import expo.modules.musemetadata.formats.*
import java.io.File
import java.io.RandomAccessFile

// usage: Main <file.ape> <ffmpeg-ref.raw or -> [bench]
// Reference is ffmpeg output as s16le (bits <= 16) or s32le (24/32 bit).
fun main(args: Array<String>) {
  val f = File(args[0])
  val raf = RandomAccessFile(f, "r")
  val len = raf.length()
  val read: ReadAt = { pos, n ->
    if (pos >= len) null else {
      val m = minOf(n.toLong(), len - pos).toInt()
      val b = ByteArray(m); raf.seek(pos); raf.readFully(b); b
    }
  }
  val info = try { ApeFile.parse(read, len) } catch (e: FormatException) { println("${f.name}: PARSE FAIL ${e.message}"); return }
  val s = info.stream
  print("${f.name}: v${info.fileVersion} c${info.compressionLevel} ${s.bitsPerSample}bit ${s.channels}ch ${s.sampleRate}Hz float=${s.isFloat} frames=${info.frameCount} bpf=${info.blocksPerFrame} total=${s.totalFrames}")
  val frames = Array(info.frameCount) { i -> read(ApeFile.frameStart(info, i), ApeFile.frameLength(info, i)) ?: ByteArray(0) }
  val wide = s.bitsPerSample > 16
  val bps = if (wide) 4 else 2
  val out = ByteArray((s.totalFrames * s.channels * bps).toInt())
  val bad = ArrayList<Int>()
  val dec = ApeDecoder(info)
  if (System.getenv("FORCE_INTERIM") != null) ApeDecoder::class.java.getDeclaredField("useInterim").apply { isAccessible = true }.setBoolean(dec, true)
  val reps = if (args.size > 2) args[2].toInt() else 1
  var best = Long.MAX_VALUE
  repeat(reps) {
    bad.clear()
    var o = 0
    val t0 = System.nanoTime()
    for (i in 0 until info.frameCount) {
      val n = ApeFile.frameBlocks(info, i) * s.channels
      try {
        val blk = dec.decodeFrame(i, frames[i], frames[i].size)
        check(blk.frames * s.channels == n)
        val sm = blk.samples
        for (j in 0 until n) {
          val v = if (s.bitsPerSample == 8) sm[j] shl 8 else if (s.bitsPerSample == 24) sm[j] shl 8 else sm[j]
          if (wide) { out[o] = v.toByte(); out[o + 1] = (v shr 8).toByte(); out[o + 2] = (v shr 16).toByte(); out[o + 3] = (v shr 24).toByte(); o += 4 }
          else { out[o] = v.toByte(); out[o + 1] = (v shr 8).toByte(); o += 2 }
        }
      } catch (e: FormatException) {
        // test only: keep what was decoded before the CRC check, so cut files compare against ffmpeg's partial output
        bad.add(i)
        val f = ApeDecoder::class.java.getDeclaredField("samples"); f.isAccessible = true
        val sm = f.get(dec) as IntArray
        for (j in 0 until n) {
          val v = if (s.bitsPerSample == 8 || s.bitsPerSample == 24) sm[j] shl 8 else sm[j]
          if (wide) { out[o] = v.toByte(); out[o + 1] = (v shr 8).toByte(); out[o + 2] = (v shr 16).toByte(); out[o + 3] = (v shr 24).toByte(); o += 4 }
          else { out[o] = v.toByte(); out[o + 1] = (v shr 8).toByte(); o += 2 }
        }
      }
    }
    best = minOf(best, System.nanoTime() - t0)
  }
  val secs = s.totalFrames.toDouble() / s.sampleRate
  print(" | decode ${"%.1f".format(best / 1e6)} ms = ${"%.0f".format(secs / (best / 1e9))}x realtime")
  if (bad.isNotEmpty()) print(" | CRC/corrupt frames: ${if (bad.size > 10) bad.take(10).toString() + "... (" + bad.size + ")" else bad.toString()}")
  if (args[1] == "-") { println(); return }
  val ref = File(args[1]).readBytes()
  val bytesPerFrame = info.blocksPerFrame.toLong() * s.channels * bps
  var first = -1L
  val cmp = minOf(ref.size, out.size)
  var diffs = 0L
  for (i in 0 until cmp) if (ref[i] != out[i]) { if (first < 0) first = i.toLong(); diffs++ }
  if (diffs == 0L && ref.size == out.size) println(" | PASS bit-exact (${out.size} bytes)")
  else if (diffs == 0L) println(" | PASS over ffmpeg's ${ref.size} bytes (mine ${out.size})")
  else println(" | MISMATCH ref=${ref.size} mine=${out.size} diffBytes=$diffs firstDiff=$first (frame ${if (first >= 0) first / bytesPerFrame else -1})")
}
