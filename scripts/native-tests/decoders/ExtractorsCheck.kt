import androidx.media3.common.DataReader
import androidx.media3.common.Format
import androidx.media3.common.util.ParsableByteArray
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.TrackOutput
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.RandomAccessFile

/** A file-backed ExtractorInput with Media3's peek semantics. */
class FileInput(private val raf: RandomAccessFile, private var pos: Long) : ExtractorInput {
  private var peek = 0L
  override fun read(b: ByteArray, o: Int, l: Int): Int {
    if (pos >= raf.length()) return androidx.media3.common.C.RESULT_END_OF_INPUT
    raf.seek(pos); val n = raf.read(b, o, minOf(l.toLong(), raf.length() - pos).toInt()); pos += n; peek = 0; return n
  }
  override fun readFully(b: ByteArray, o: Int, l: Int, allowEnd: Boolean): Boolean {
    if (pos + l > raf.length()) { if (allowEnd && pos == raf.length()) return false; if (allowEnd) return false; throw java.io.EOFException() }
    raf.seek(pos); raf.readFully(b, o, l); pos += l; peek = 0; return true
  }
  override fun readFully(b: ByteArray, o: Int, l: Int) { readFully(b, o, l, false) }
  override fun skip(l: Int): Int { val n = minOf(l.toLong(), raf.length() - pos).toInt(); pos += n; peek = 0; return n }
  override fun skipFully(l: Int, allowEnd: Boolean): Boolean { if (pos + l > raf.length()) { if (allowEnd) return false; throw java.io.EOFException() }; pos += l; peek = 0; return true }
  override fun skipFully(l: Int) { skipFully(l, false) }
  override fun peek(b: ByteArray, o: Int, l: Int): Int {
    val at = pos + peek; if (at >= raf.length()) return androidx.media3.common.C.RESULT_END_OF_INPUT
    raf.seek(at); val n = raf.read(b, o, minOf(l.toLong(), raf.length() - at).toInt()); peek += n; return n
  }
  override fun peekFully(b: ByteArray, o: Int, l: Int, allowEnd: Boolean): Boolean {
    val at = pos + peek; if (at + l > raf.length()) { if (allowEnd) return false; throw java.io.EOFException() }
    raf.seek(at); raf.readFully(b, o, l); peek += l; return true
  }
  override fun peekFully(b: ByteArray, o: Int, l: Int) { peekFully(b, o, l, false) }
  override fun advancePeekPosition(l: Int, allowEnd: Boolean): Boolean { if (pos + peek + l > raf.length()) { if (allowEnd) return false; throw java.io.EOFException() }; peek += l; return true }
  override fun advancePeekPosition(l: Int) { advancePeekPosition(l, false) }
  override fun resetPeekPosition() { peek = 0 }
  override fun getPeekPosition() = pos + peek
  override fun getPosition() = pos
  override fun getLength() = raf.length()
  override fun <E : Throwable> setRetryPosition(p: Long, e: E) { throw e }
}

class Collect : TrackOutput, ExtractorOutput {
  var format: Format? = null
  var seekMap: SeekMap? = null
  val pcm = ByteArrayOutputStream()
  val times = mutableListOf<Pair<Long, Int>>()
  override fun format(format: Format) { this.format = format }
  override fun sampleData(input: DataReader, length: Int, allowEndOfInput: Boolean, sampleDataPart: Int): Int = throw UnsupportedOperationException()
  override fun sampleData(data: ParsableByteArray, length: Int, sampleDataPart: Int) { pcm.write(data.data, data.position, length); data.skipBytes(length) }
  override fun sampleMetadata(timeUs: Long, flags: Int, size: Int, offset: Int, cryptoData: TrackOutput.CryptoData?) { times += timeUs to size }
  override fun track(id: Int, type: Int): TrackOutput = this
  override fun endTracks() {}
  override fun seekMap(seekMap: SeekMap) { this.seekMap = seekMap }
}

/** Reads until `maxBytes` of PCM or the end, following RESULT_SEEK like Media3 does. */
fun drive(extractor: Extractor, raf: RandomAccessFile, out: Collect, start: Long, maxBytes: Int = Int.MAX_VALUE) {
  var input = FileInput(raf, start)
  val holder = PositionHolder()
  var guard = 0
  while (out.pcm.size() < maxBytes && guard++ < 10_000_000) {
    when (extractor.read(input, holder)) {
      Extractor.RESULT_SEEK -> input = FileInput(raf, holder.position)
      Extractor.RESULT_END_OF_INPUT -> return
    }
  }
}

var failures = 0
fun check(name: String, ok: Boolean, detail: String = "") {
  println((if (ok) "PASS " else "FAIL ") + name + "  " + detail); if (!ok) failures++
}

fun main(args: Array<String>) {
  // args: kind file reference.raw bytesPerFrame
  val cases = args.toList().chunked(3)
  for ((kind, path, refPath) in cases) {
    val file = File(path)
    val ref = File(refPath).readBytes()
    fun make(): Extractor = when (kind) {
      "aiff" -> expo.modules.musemetadata.playback.AiffExtractor()
      "dsd" -> expo.modules.musemetadata.playback.DsdExtractor()
      "wv" -> expo.modules.musemetadata.playback.WavPackExtractor()
      "ape" -> expo.modules.musemetadata.playback.ApeExtractor()
      else -> error(kind)
    }
    RandomAccessFile(file, "r").use { raf ->
      // Sniff and decode the whole file.
      val ex = make()
      val sniffed = ex.sniff(FileInput(raf, 0))
      val out = Collect()
      ex.init(out)
      val t0 = System.nanoTime()
      drive(ex, raf, out, 0)
      val ms = (System.nanoTime() - t0) / 1e6
      val fmt = out.format!!
      val frameBytes = out.pcm.size() / maxOf(1, (out.times.sumOf { it.second } / maxOf(1, out.pcm.size())))
      val pcm = out.pcm.toByteArray()
      val same = if (kind == "dsd") pcm.size > 0 else pcm.contentEquals(ref)
      check("$kind ${file.name} sniff+decode", sniffed && same,
        "fmt enc=${fmt.pcmEncoding} rate=${fmt.sampleRate} ch=${fmt.channelCount} ours=${pcm.size} ref=${ref.size} dur=${out.seekMap?.durationUs} %.0f ms".format(ms))
      // Timestamps run on without gaps.
      val bpf = when (fmt.pcmEncoding) { 3 -> 1; 2 -> 2; 21 -> 3; else -> 4 } * fmt.channelCount
      var expected = 0L; var gapless = true; var frames = 0L
      for ((t, size) in out.times) { if (Math.abs(t - frames * 1_000_000L / fmt.sampleRate) > 1) gapless = false; frames += size / bpf }
      check("$kind ${file.name} timestamps", gapless)
      // Seek to 0.7 s: first sample must be exactly the target frame, matching the reference.
      val seekMap = out.seekMap!!
      if (seekMap.isSeekable) {
        val targetUs = 700_000L
        val point = seekMap.getSeekPoints(targetUs).first
        val ex2 = make(); val out2 = Collect(); ex2.init(out2)
        drive(ex2, raf, out2, 0, 1) // open the stream
        out2.pcm.reset(); out2.times.clear()
        ex2.seek(point.position, targetUs)
        drive(ex2, raf, out2, point.position, 64 * 1024)
        val targetFrame = targetUs * fmt.sampleRate / 1_000_000L
        val firstUs = out2.times.firstOrNull()?.first ?: -1
        val got = out2.pcm.toByteArray()
        val offset = (targetFrame * bpf).toInt()
        val matches = kind == "dsd" || (got.size > 0 && offset + got.size <= ref.size && got.contentEquals(ref.copyOfRange(offset, offset + got.size)))
        check("$kind ${file.name} seek 0.7 s", firstUs == targetFrame * 1_000_000L / fmt.sampleRate && matches,
          "first=$firstUs expect=${targetFrame * 1_000_000L / fmt.sampleRate} bytes=${got.size}")
      }
    }
  }
  println(if (failures == 0) "ALL PASS" else "$failures FAILED")
}
