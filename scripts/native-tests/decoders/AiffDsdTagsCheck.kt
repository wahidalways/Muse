import expo.modules.musemetadata.formats.*
import java.io.File
import java.io.RandomAccessFile

fun reader(file: File): Pair<ReadAt, Long> {
  val raf = RandomAccessFile(file, "r")
  val read: ReadAt = { position, length ->
    if (position < 0 || position + length > raf.length()) null else ByteArray(length).also { raf.seek(position); raf.readFully(it) }
  }
  return read to raf.length()
}

var failures = 0
fun check(name: String, ok: Boolean, detail: String = "") {
  println((if (ok) "PASS " else "FAIL ") + name + (if (detail.isNotEmpty()) "  $detail" else ""))
  if (!ok) failures++
}

fun testAiff(dir: File) {
  for (name in dir.list()!!.filter { it.endsWith(".aif") || it.endsWith(".aifc") }.sorted()) {
    val file = File(dir, name)
    val (read, length) = reader(file)
    val info = Aiff.parse(read, length)
    val src = read(info.dataOffset, info.dataLength.toInt())!!
    val outBytes = Aiff.outputBytesPerSample(info)
    val frames = (info.dataLength / info.frameBytes).toInt()
    val dst = ByteArray(frames * info.stream.channels * outBytes)
    Aiff.toPcm(info, src, 0, frames, dst, 0)
    val expected = File(dir, "$name.raw").readBytes()
    check("aiff $name (${info.stream.sampleRate} Hz ${info.stream.channels} ch ${info.stream.bitsPerSample} bit float=${info.stream.isFloat})",
      dst.contentEquals(expected), "ours=${dst.size} ffmpeg=${expected.size}")
  }
}

/** A 2nd-order sigma-delta modulator: enough to test the PCM path's levels and filtering. */
fun modulate(signal: (Double) -> Double, rate: Int, seconds: Double, channels: Int): Array<ByteArray> {
  val samples = (rate * seconds).toLong()
  val bytes = ((samples + 7) / 8).toInt()
  return Array(channels) { channel ->
    val out = ByteArray(bytes)
    var i1 = 0.0
    var i2 = 0.0
    var y = 0.0
    for (n in 0 until samples) {
      val x = signal(n.toDouble() / rate) * (if (channel == 1) 0.5 else 1.0)
      i1 += x - y
      i2 += i1 - y
      val bit = if (i2 >= 0) 1 else 0
      y = if (bit == 1) 1.0 else -1.0
      // DSF: lowest bit is first in time.
      if (bit == 1) out[(n / 8).toInt()] = (out[(n / 8).toInt()].toInt() or (1 shl (n % 8).toInt())).toByte()
    }
    out
  }
}

fun writeDsf(file: File, data: Array<ByteArray>, rate: Int, samples: Long) {
  val channels = data.size
  val block = 4096
  val blocks = (data[0].size + block - 1) / block
  val dataSize = 12L + blocks.toLong() * block * channels
  val total = 28 + 52 + dataSize
  val out = java.io.ByteArrayOutputStream()
  fun le32(v: Int) { for (i in 0 until 4) out.write((v shr (8 * i)) and 0xFF) }
  fun le64(v: Long) { for (i in 0 until 8) out.write(((v shr (8 * i)) and 0xFF).toInt()) }
  out.write("DSD ".toByteArray()); le64(28); le64(total); le64(0)
  out.write("fmt ".toByteArray()); le64(52); le32(1); le32(0); le32(if (channels == 2) 2 else 1); le32(channels)
  le32(rate); le32(1); le64(samples); le32(block); le32(0)
  out.write("data".toByteArray()); le64(dataSize)
  for (b in 0 until blocks) for (c in 0 until channels) {
    val chunk = ByteArray(block)
    val from = b * block
    System.arraycopy(data[c], from, chunk, 0, minOf(block, data[c].size - from))
    out.write(chunk)
  }
  file.writeBytes(out.toByteArray())
}

/** Amplitude of a tone at `hz` in `x` (single-bin DFT). */
fun tone(x: FloatArray, channels: Int, channel: Int, rate: Int, hz: Double, skip: Int): Double {
  var re = 0.0; var im = 0.0; var n = 0
  for (i in skip until x.size / channels) {
    val v = x[i * channels + channel].toDouble()
    re += v * Math.cos(2 * Math.PI * hz * i / rate); im += v * Math.sin(2 * Math.PI * hz * i / rate); n++
  }
  return 2 * Math.sqrt(re * re + im * im) / n
}

fun testDsd(dir: File) {
  for ((label, rate) in listOf("DSD64" to 2_822_400, "DSD128" to 5_644_800, "DSD256" to 11_289_600)) {
    for (hz in listOf(1000.0, 10000.0, 18000.0)) {
      val amp = 0.5
      val data = modulate({ t -> amp * Math.sin(2 * Math.PI * hz * t) }, rate, 0.25, 2)
      val samples = (rate * 0.25).toLong()
      val file = File(dir, "test-$label-${hz.toInt()}.dsf")
      writeDsf(file, data, rate, samples)
      val (read, length) = reader(file)
      val info = Dsd.parse(read, length)
      check("dsf parse $label", info.dsdRate == rate && info.channels == 2 && info.samplesPerChannel == samples && info.lsbFirst)
      // De-block into interleaved byte frames, as the extractor does.
      val perChannel = info.bytesPerChannel.toInt()
      val raw = read(info.dataOffset, info.dataLength.toInt())!!
      val interleaved = ByteArray(perChannel * 2)
      for (j in 0 until perChannel) for (c in 0 until 2) {
        val blockIndex = j / info.blockSize
        interleaved[j * 2 + c] = raw[(blockIndex * 2 + c) * info.blockSize + j % info.blockSize]
      }
      val converter = DsdToPcm(rate, 2, true)
      val out = FloatArray(converter.maxOutputFrames(perChannel) * 2)
      val start = System.nanoTime()
      val frames = converter.convert(interleaved, 0, perChannel, out)
      val ms = (System.nanoTime() - start) / 1e6
      val pcm = out.copyOf(frames * 2)
      val left = tone(pcm, 2, 0, converter.pcmRate, hz, 2000)
      val right = tone(pcm, 2, 1, converter.pcmRate, hz, 2000)
      val db = 20 * Math.log10(left / amp)
      check("dsd->pcm $label ${hz.toInt()} Hz level", Math.abs(db) < 0.2 && Math.abs(right / left - 0.5) < 0.01,
        "left %.3f dB, right/left %.4f, %d frames at %d Hz, %.0f ms for 0.25 s".format(db, right / left, frames, converter.pcmRate, ms))
    }
  }
  // An ultrasonic tone that would fold into the audible band must be filtered out.
  run {
    val rate = 2_822_400
    val hz = 70_000.0
    val data = modulate({ t -> 0.5 * Math.sin(2 * Math.PI * hz * t) }, rate, 0.25, 1)
    val converter = DsdToPcm(rate, 1, true)
    val out = FloatArray(converter.maxOutputFrames(data[0].size))
    val frames = converter.convert(data[0], 0, data[0].size, out)
    val folded = tone(out.copyOf(frames), 1, 0, converter.pcmRate, 88_200 - hz, 2000)
    check("dsd->pcm 70 kHz folds below -80 dB", 20 * Math.log10(folded / 0.5) < -80, "%.1f dB".format(20 * Math.log10(folded / 0.5)))
  }
  // DoP: markers alternate, and the DSD bits come back unchanged.
  run {
    val input = ByteArray(8) { (it * 37 + 11).toByte() } // 4 byte frames, 2 channels
    val packer = DopPacker(2, lsbFirst = false)
    val out = IntArray(4)
    val frames = packer.pack(input, 0, 4, out)
    val ok = frames == 2 &&
      ((out[0] shr 16) and 0xFF) == 0x05 && ((out[2] shr 16) and 0xFF) == 0xFA &&
      ((out[0] shr 8) and 0xFF) == (input[0].toInt() and 0xFF) && (out[0] and 0xFF) == (input[2].toInt() and 0xFF) &&
      ((out[1] shr 8) and 0xFF) == (input[1].toInt() and 0xFF) && (out[3] and 0xFF) == (input[7].toInt() and 0xFF) &&
      out[2] < 0 && out[2] >= -(1 shl 23)
    check("dop packing", ok, out.joinToString { Integer.toHexString(it) })
    val lsb = DopPacker(1, lsbFirst = true)
    val one = IntArray(1)
    lsb.pack(byteArrayOf(0x01, 0x80.toByte()), 0, 2, one)
    check("dop lsb-first reversal", one[0] == 0x058001, Integer.toHexString(one[0]))
  }
}

fun main(args: Array<String>) {
  testAiff(File(args[0]))
  testDsd(File(args[1]))
  println(if (failures == 0) "ALL PASS" else "$failures FAILED")
}
