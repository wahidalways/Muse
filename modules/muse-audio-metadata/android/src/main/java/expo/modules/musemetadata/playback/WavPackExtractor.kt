package expo.modules.musemetadata.playback

import androidx.media3.common.C
import androidx.media3.common.ParserException
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.SeekPoint
import expo.modules.musemetadata.formats.FormatException
import expo.modules.musemetadata.formats.WavPackDecoder
import expo.modules.musemetadata.formats.WavPackFile
import expo.modules.musemetadata.formats.WavPackInfo

/**
 * WavPack (.wv), decoded by formats/WavPackDecoder.kt. Files have no seek
 * index, so a seek guesses a byte spot, finds the next block, and steps back
 * until it lands on a frame at or before the target; frames before the target
 * are then decoded and dropped, so playback starts on the exact sample.
 */
internal class WavPackExtractor : Extractor {
  private lateinit var output: ExtractorOutput
  private var info: WavPackInfo? = null
  private var decoder: WavPackDecoder? = null
  private var pcm: PcmOut? = null
  private var frame = ByteArray(1 shl 16)
  private val header = ByteArray(32)

  /** Set by a seek: find a frame at or before this one first. */
  private var target = -1L
  private var backOff = 0L
  private var tries = 0

  override fun sniff(input: ExtractorInput): Boolean {
    if (!input.peekFully(header, 0, 32, true)) return false
    return header[0] == 'w'.code.toByte() && header[1] == 'v'.code.toByte() && WavPackFile.parseHeader(header, 0) != null
  }

  override fun init(output: ExtractorOutput) {
    this.output = output
  }

  override fun read(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = info ?: return openStream(input, seekPosition)
    if (input.position < info.firstBlockOffset) {
      seekPosition.position = info.firstBlockOffset
      return Extractor.RESULT_SEEK
    }
    if (target >= 0) return resync(input, seekPosition, info)
    // One frame: blocks from an initial block through its final block.
    var length = 0
    var first = -1L
    while (true) {
      input.resetPeekPosition()
      if (input.length > 0 && input.length - input.position < 32) return Extractor.RESULT_END_OF_INPUT
      if (!input.peekFully(header, 0, 32, true)) return Extractor.RESULT_END_OF_INPUT
      // Not a block: a tag at the end (APEv2, ID3v1) or damage. Skip to the next block, if any.
      val block = WavPackFile.parseHeader(header, 0) ?: return skipToNextBlock(input)
      if (length == 0 && !block.isInitial) {
        input.skipFully(block.blockSize)
        continue
      }
      // A file cut short mid-block ends at its last whole frame.
      if (input.length > 0 && input.position + block.blockSize > input.length) {
        return Extractor.RESULT_END_OF_INPUT
      }
      if (first < 0) first = block.blockIndex
      if (frame.size < length + block.blockSize) frame = frame.copyOf(maxOf(frame.size * 2, length + block.blockSize))
      input.readFully(frame, length, block.blockSize)
      length += block.blockSize
      if (block.isFinal) return decode(length, first, info)
    }
  }

  private fun decode(length: Int, firstSample: Long, info: WavPackInfo): Int {
    val pcm = pcm!!
    val block = try {
      decoder!!.decodeFrame(frame, length)
    } catch (error: FormatException) {
      throw ParserException.createForMalformedContainer(error.message, error)
    }
    if (block.frames > 0) {
      pcm.at(firstSample - info.firstBlockIndex)
      pcm.writeInts(block.samples, block.frames)
    }
    return Extractor.RESULT_CONTINUE
  }

  private fun skipToNextBlock(input: ExtractorInput): Int {
    val window = ByteArray(WINDOW)
    input.resetPeekPosition()
    val got = peekSome(input, window)
    val at = if (got > 33) WavPackFile.findHeader(window, 1, got) else -1
    if (at < 0) return Extractor.RESULT_END_OF_INPUT
    input.skipFully(at)
    return Extractor.RESULT_CONTINUE
  }

  /** After a seek: find a frame that starts at or before the target. */
  private fun resync(input: ExtractorInput, seekPosition: PositionHolder, info: WavPackInfo): Int {
    val window = ByteArray(WINDOW)
    input.resetPeekPosition()
    val got = peekSome(input, window)
    val at = if (got >= 32) WavPackFile.findHeader(window, 0, got) else -1
    if (at < 0) {
      target = -1
      return Extractor.RESULT_END_OF_INPUT
    }
    val block = WavPackFile.parseHeader(window, at)!!
    val start = block.blockIndex - info.firstBlockIndex
    if (start > target && input.position > info.firstBlockOffset && tries < MAX_TRIES) {
      // Landed past the target: step back further each time.
      tries += 1
      backOff = if (backOff == 0L) WINDOW.toLong() else backOff * 2
      seekPosition.position = maxOf(info.firstBlockOffset, input.position - backOff)
      return Extractor.RESULT_SEEK
    }
    input.skipFully(at)
    if (!block.isInitial) {
      // The middle of a multichannel frame: move on to the next frame's start.
      input.skipFully(block.blockSize)
      return Extractor.RESULT_CONTINUE
    }
    pcm!!.seekTo(start, target)
    target = -1
    return Extractor.RESULT_CONTINUE
  }

  private fun peekSome(input: ExtractorInput, into: ByteArray): Int {
    var total = 0
    while (total < into.size) {
      val read = input.peek(into, total, into.size - total)
      if (read == C.RESULT_END_OF_INPUT) break
      total += read
    }
    return total
  }

  private fun openStream(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = try {
      WavPackFile.readInfo(peekReader(input), lengthOf(input))
    } catch (error: FormatException) {
      throw ParserException.createForMalformedContainer(error.message, error)
    }
    this.info = info
    decoder = WavPackDecoder(info)
    val stream = info.stream
    val track = output.track(0, C.TRACK_TYPE_AUDIO)
    val pcm = PcmOut(track, stream.sampleRate, stream.channels, pcmEncodingFor(stream), stream.bitsPerSample)
    this.pcm = pcm
    track.format(pcm.format())
    output.endTracks()
    val dataLength = (input.length - info.firstBlockOffset).takeIf { input.length > 0 }
    val durationUs = if (stream.totalFrames > 0) stream.totalFrames * 1_000_000L / stream.sampleRate else C.TIME_UNSET
    output.seekMap(
      if (dataLength == null || durationUs == C.TIME_UNSET) {
        SeekMap.Unseekable(durationUs)
      } else {
        object : SeekMap {
          override fun isSeekable() = true
          override fun getDurationUs() = durationUs
          override fun getSeekPoints(timeUs: Long): SeekMap.SeekPoints {
            // A guess by bytes; read() then finds the right frame.
            val share = timeUs.toDouble() / durationUs
            val position = info.firstBlockOffset + (dataLength * share.coerceIn(0.0, 1.0)).toLong()
            return SeekMap.SeekPoints(SeekPoint(timeUs, position))
          }
        }
      },
    )
    seekPosition.position = info.firstBlockOffset
    return Extractor.RESULT_SEEK
  }

  override fun seek(position: Long, timeUs: Long) {
    val info = info ?: return
    if (position <= info.firstBlockOffset && timeUs == 0L) {
      target = -1
      pcm?.seekTo(0, 0)
      return
    }
    target = timeUs * info.stream.sampleRate / 1_000_000L
    backOff = 0
    tries = 0
  }

  override fun release() = Unit

  private companion object {
    const val WINDOW = 1 shl 20
    const val MAX_TRIES = 24
  }
}
