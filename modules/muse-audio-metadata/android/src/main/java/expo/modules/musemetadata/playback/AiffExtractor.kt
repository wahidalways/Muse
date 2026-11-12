package expo.modules.musemetadata.playback

import androidx.media3.common.C
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.SeekPoint
import expo.modules.musemetadata.formats.Aiff
import expo.modules.musemetadata.formats.AiffInfo
import expo.modules.musemetadata.formats.FormatException

/** AIFF and AIFF-C, which Media3 has no reader for. */
internal class AiffExtractor : Extractor {
  private lateinit var output: ExtractorOutput
  private var info: AiffInfo? = null
  private var pcm: PcmOut? = null
  private var src = ByteArray(0)
  private var dst = ByteArray(0)

  override fun sniff(input: ExtractorInput): Boolean {
    val head = ByteArray(12)
    return input.peekFully(head, 0, 12, true) && Aiff.isAiff(head)
  }

  override fun init(output: ExtractorOutput) {
    this.output = output
  }

  override fun read(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = info ?: return openStream(input, seekPosition)
    val pcm = pcm!!
    val end = info.dataOffset + info.dataLength
    if (input.position < info.dataOffset) {
      seekPosition.position = info.dataOffset
      return Extractor.RESULT_SEEK
    }
    val frames = minOf(PcmOut.MAX_FRAMES.toLong(), (end - input.position) / info.frameBytes).toInt()
    if (frames <= 0) return Extractor.RESULT_END_OF_INPUT
    val bytes = frames * info.frameBytes
    if (src.size < bytes) src = ByteArray(bytes)
    if (!input.readFully(src, 0, bytes, true)) return Extractor.RESULT_END_OF_INPUT
    val outBytes = frames * info.stream.channels * Aiff.outputBytesPerSample(info)
    if (dst.size < outBytes) dst = ByteArray(outBytes)
    Aiff.toPcm(info, src, 0, frames, dst, 0)
    pcm.writeBytes(dst, frames)
    return Extractor.RESULT_CONTINUE
  }

  private fun openStream(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = try {
      Aiff.parse(peekReader(input), lengthOf(input))
    } catch (error: FormatException) {
      throw androidx.media3.common.ParserException.createForMalformedContainer(error.message, error)
    }
    this.info = info
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
        val frame = (timeUs * stream.sampleRate / 1_000_000L).coerceIn(0L, maxOf(0L, stream.totalFrames - 1))
        return SeekMap.SeekPoints(SeekPoint(frame * 1_000_000L / stream.sampleRate, info.dataOffset + frame * info.frameBytes))
      }
    })
    seekPosition.position = info.dataOffset
    return Extractor.RESULT_SEEK
  }

  override fun seek(position: Long, timeUs: Long) {
    val info = info ?: return
    val frame = ((position - info.dataOffset) / info.frameBytes).coerceAtLeast(0)
    pcm?.seekTo(frame, timeUs * info.stream.sampleRate / 1_000_000L)
  }

  override fun release() = Unit
}
