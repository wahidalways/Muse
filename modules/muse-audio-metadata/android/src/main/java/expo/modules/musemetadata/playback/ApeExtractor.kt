package expo.modules.musemetadata.playback

import androidx.media3.common.C
import androidx.media3.common.ParserException
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.SeekPoint
import expo.modules.musemetadata.formats.ApeDecoder
import expo.modules.musemetadata.formats.ApeFile
import expo.modules.musemetadata.formats.ApeInfo
import expo.modules.musemetadata.formats.FormatException

/**
 * Monkey's Audio (.ape), decoded by formats/ApeDecoder.kt. Frames can be
 * seconds long, so a seek lands on the frame holding the target and the
 * frames' first samples are dropped (PcmOut), starting on the exact sample.
 * Frames overlap by a few bytes (the decoder reads ahead), so each is peeked
 * whole, then the input moves on to the next frame's start.
 */
internal class ApeExtractor : Extractor {
  private lateinit var output: ExtractorOutput
  private var info: ApeInfo? = null
  private var decoder: ApeDecoder? = null
  private var pcm: PcmOut? = null
  private var frame = ByteArray(0)
  private var silence = IntArray(0)
  private var next = 0

  override fun sniff(input: ExtractorInput): Boolean {
    val head = ByteArray(10)
    if (!input.peekFully(head, 0, 10, true)) return false
    var at = 0
    if (head[0] == 'I'.code.toByte() && head[1] == 'D'.code.toByte() && head[2] == '3'.code.toByte()) {
      // An ID3v2 tag in front: the descriptor follows it.
      val size = ((head[6].toInt() and 0x7F) shl 21) or ((head[7].toInt() and 0x7F) shl 14) or
        ((head[8].toInt() and 0x7F) shl 7) or (head[9].toInt() and 0x7F)
      at = 10 + size + if ((head[5].toInt() and 0x10) != 0) 10 else 0
      if (at > (1 shl 20) || !input.advancePeekPosition(at - 10, true)) return false
    } else {
      input.resetPeekPosition()
    }
    val magic = ByteArray(4)
    if (!input.peekFully(magic, 0, 4, true)) return false
    val text = String(magic, Charsets.ISO_8859_1)
    return text == "MAC " || text == "MACF"
  }

  override fun init(output: ExtractorOutput) {
    this.output = output
  }

  override fun read(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = info ?: return openStream(input, seekPosition)
    if (next >= info.frameCount) return Extractor.RESULT_END_OF_INPUT
    val start = ApeFile.frameStart(info, next)
    if (input.position != start) {
      seekPosition.position = start
      return Extractor.RESULT_SEEK
    }
    val length = ApeFile.frameLength(info, next)
    if (frame.size < length) frame = ByteArray(length)
    input.resetPeekPosition()
    if (!input.peekFully(frame, 0, length, true)) return Extractor.RESULT_END_OF_INPUT
    val pcm = pcm!!
    val blocks = ApeFile.frameBlocks(info, next)
    pcm.at(next.toLong() * info.blocksPerFrame)
    try {
      val block = decoder!!.decodeFrame(next, frame, length)
      pcm.writeInts(block.samples, block.frames)
    } catch (_: FormatException) {
      // A damaged frame plays as silence, so the rest of the song keeps its timing.
      val samples = blocks * info.stream.channels
      if (silence.size < samples) silence = IntArray(samples)
      pcm.writeInts(silence, blocks)
    }
    next += 1
    val following = if (next < info.frameCount) ApeFile.frameStart(info, next) else start + length
    input.skipFully((following - start).toInt())
    return Extractor.RESULT_CONTINUE
  }

  private fun openStream(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = try {
      ApeFile.parse(peekReader(input, 16L shl 20), lengthOf(input))
    } catch (error: FormatException) {
      throw ParserException.createForMalformedContainer(error.message, error)
    }
    this.info = info
    decoder = ApeDecoder(info)
    val stream = info.stream
    val track = output.track(0, C.TRACK_TYPE_AUDIO)
    val pcm = PcmOut(track, stream.sampleRate, stream.channels, pcmEncodingFor(stream), stream.bitsPerSample)
    this.pcm = pcm
    track.format(pcm.format())
    output.endTracks()
    output.seekMap(object : SeekMap {
      override fun isSeekable() = true
      override fun getDurationUs() = stream.totalFrames * 1_000_000L / stream.sampleRate
      override fun getSeekPoints(timeUs: Long): SeekMap.SeekPoints {
        val index = frameAt(timeUs)
        val firstSample = index.toLong() * info.blocksPerFrame
        return SeekMap.SeekPoints(SeekPoint(firstSample * 1_000_000L / stream.sampleRate, ApeFile.frameStart(info, index)))
      }
    })
    next = 0
    seekPosition.position = ApeFile.frameStart(info, 0)
    return Extractor.RESULT_SEEK
  }

  private fun frameAt(timeUs: Long): Int {
    val info = info!!
    val sample = timeUs * info.stream.sampleRate / 1_000_000L
    return (sample / info.blocksPerFrame).toInt().coerceIn(0, maxOf(0, info.frameCount - 1))
  }

  override fun seek(position: Long, timeUs: Long) {
    val info = info ?: return
    next = frameAt(timeUs)
    pcm?.seekTo(next.toLong() * info.blocksPerFrame, timeUs * info.stream.sampleRate / 1_000_000L)
  }

  override fun release() = Unit
}
