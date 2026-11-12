import expo.modules.musemetadata.formats.*
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

// usage: decode <in.wv> <out.raw>   -> s32le (ints left-justified) or f32le, prints info + time
//        bench <in.wv> <reps>
//        order <in.wv>              -> checks reverse-order frame decoding == forward (seek independence)
fun main(args: Array<String>) {
  val data = File(args[1]).readBytes()
  val read: ReadAt = { pos, n ->
    if (pos >= data.size) null else data.copyOfRange(pos.toInt(), minOf(data.size.toLong(), pos + n).toInt())
  }
  val info = try { WavPackFile.readInfo(read, data.size.toLong()) } catch (e: FormatException) {
    println("FormatException: ${e.message}"); return
  }
  val s = info.stream
  // frame offsets
  val frames = ArrayList<IntArray>() // [offset, length]
  var pos = info.firstBlockOffset.toInt()
  outer@ while (pos + 32 <= data.size) {
    var h = WavPackFile.parseHeader(data, pos)
    if (h == null) { pos = WavPackFile.findHeader(data, pos, data.size); if (pos < 0) break; continue }
    val start = pos
    while (true) {
      h!!
      if (pos + h.blockSize > data.size) break@outer // truncated tail
      pos += h.blockSize
      if (h.isFinal || h.blockSamples == 0) break
      h = WavPackFile.parseHeader(data, pos) ?: break@outer
    }
    frames.add(intArrayOf(start, pos - start))
  }
  val dec = WavPackDecoder(info)
  val buf = ByteArray(1 shl 24)
  fun decode(f: IntArray): PcmBlock {
    System.arraycopy(data, f[0], buf, 0, f[1])
    return dec.decodeFrame(buf, f[1])
  }
  when (args[0]) {
    "decode" -> {
      println("rate=${s.sampleRate} ch=${s.channels} bits=${s.bitsPerSample} float=${s.isFloat} total=${s.totalFrames} mask=0x${Integer.toHexString(s.channelMask)} first=${info.firstBlockOffset} frames=${frames.size}")
      val out = File(args[2]).outputStream().buffered(1 shl 20)
      val shift = if (s.isFloat) 0 else 32 - s.bitsPerSample
      val bb = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN)
      var n = 0L
      val t0 = System.nanoTime()
      try {
        for (f in frames) {
          val p = decode(f)
          for (i in 0 until p.frames * s.channels) { bb.clear(); bb.putInt(p.samples[i] shl shift); out.write(bb.array()) }
          n += p.frames
        }
      } catch (e: FormatException) { println("FormatException after $n frames: ${e.message}") }
      out.close()
      println("decoded=$n ms=${(System.nanoTime() - t0) / 1000000}")
    }
    "bench" -> {
      val reps = args[2].toInt()
      var n = 0L
      for (f in frames) n += decode(f).frames // warm-up
      val t0 = System.nanoTime()
      for (r in 0 until reps) for (f in frames) decode(f)
      val sec = (System.nanoTime() - t0) / 1e9
      val audio = n.toDouble() * reps / s.sampleRate
      println("audio=${"%.1f".format(audio)}s cpu=${"%.3f".format(sec)}s speed=${"%.0f".format(audio / sec)}x realtime")
    }
    "stats" -> { // union of header versions, flags and metadata ids, to see what a vector exercises
      var flags = 0; val vers = sortedSetOf<Int>(); val ids = sortedSetOf<Int>()
      var p = info.firstBlockOffset.toInt()
      while (true) {
        val h = WavPackFile.parseHeader(data, p) ?: break
        if (p + h.blockSize > data.size) break
        flags = flags or h.flags; vers.add(h.version)
        var q = p + 32
        while (q + 2 <= p + h.blockSize) {
          val id = data[q].toInt() and 0xff; var len = (data[q + 1].toInt() and 0xff) shl 1; q += 2
          if (id and 0x80 != 0) { len += ((data[q].toInt() and 0xff) shl 9) + ((data[q + 1].toInt() and 0xff) shl 17); q += 2 }
          ids.add(id and 0x3f); q += len
        }
        p += h.blockSize
      }
      val names = mapOf(0x8 to "HYBRID", 0x10 to "JOINT", 0x20 to "XDECORR", 0x40 to "SHAPE", 0x80 to "FLOAT", 0x100 to "INT32",
        0x200 to "HBITRATE", 0x400 to "HBALANCE", 0x10000000 to "CHECKSUM", 0x40000000 to "FALSE_ST", 0x20000000 to "NEWSHAPE")
      println("vers=${vers.map { Integer.toHexString(it) }} flags=${names.filter { flags and it.key != 0 }.values} ids=${ids.map { Integer.toHexString(it) }}")
    }
    "corrupt" -> { // flip one payload byte per frame: must throw or (rarely) decode identically
      val rnd = java.util.Random(1)
      var thrown = 0; var same = 0; var silent = 0
      for (f in frames) {
        val good = decode(f).let { p -> p.samples.copyOf(p.frames * s.channels) }
        System.arraycopy(data, f[0], buf, 0, f[1])
        val at = 32 + rnd.nextInt(f[1] - 32)
        buf[at] = (buf[at].toInt() xor (1 shl rnd.nextInt(8))).toByte()
        try {
          val p = dec.decodeFrame(buf, f[1])
          if (p.samples.copyOf(p.frames * s.channels).contentEquals(good)) same++ else silent++
        } catch (e: FormatException) { thrown++ } catch (e: RuntimeException) { println("CRASH ${e}"); silent++ }
      }
      println("corrupt: thrown=$thrown unchanged=$same SILENT_BAD=$silent")
    }
    "order" -> {
      val fwd = frames.map { decode(it).let { p -> p.samples.copyOf(p.frames * s.channels) } }
      var ok = true
      for (k in frames.indices.reversed()) if (!decode(frames[k]).let { p -> p.samples.copyOf(p.frames * s.channels) }.contentEquals(fwd[k])) ok = false
      // resync from a random mid-file offset must land on a header we can decode
      val mid = WavPackFile.findHeader(data, data.size / 3, data.size)
      println("order=${if (ok) "OK" else "MISMATCH"} resync@${data.size / 3}->$mid")
    }
  }
}
