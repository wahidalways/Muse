package expo.modules.musemetadata.playback

import androidx.media3.common.C
import androidx.media3.common.ParserException
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.SeekPoint
import expo.modules.musemetadata.formats.DopPacker
import expo.modules.musemetadata.formats.Dsd
import expo.modules.musemetadata.formats.DsdInfo
import expo.modules.musemetadata.formats.DsdToPcm
import expo.modules.musemetadata.formats.FormatException

/**
 * DSF and DFF. Normally the DSD becomes 88.2 kHz float PCM. When a USB DAC is
 * in bit-perfect mode and takes DoP at this rate, the DSD bits pass untouched
 * inside 24-bit frames instead (labelled so the output stage can guard them).
 */
internal class DsdExtractor : Extractor {
  private lateinit var output: ExtractorOutput
  private var info: DsdInfo? = null
  private var pcm: PcmOut? = null
  private var converter: DsdToPcm? = null
  private var packer: DopPacker? = null
  private var raw = ByteArray(0)
  private var frames = ByteArray(0)
  private var floats = FloatArray(0)
  private var ints = IntArray(0)

  /** DSD bytes per channel already read from the data. */
  private var byteIndex = 0L

  override fun sniff(input: ExtractorInput): Boolean {
    val head = ByteArray(16)
    return input.peekFully(head, 0, 16, true) && Dsd.isDsd(head)
  }

  override fun init(output: ExtractorOutput) {
    this.output = output
  }

  override fun read(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = info ?: return openStream(input, seekPosition)
    val pcm = pcm!!
    val channels = info.channels
    // DSF stores each channel as a 4096-byte block; DFF interleaves byte by byte.
    val chunk = if (info.isDsf) info.blockSize else CHUNK
    val left = info.bytesPerChannel - byteIndex
    if (left <= 0) return Extractor.RESULT_END_OF_INPUT
    val count = minOf(chunk.toLong(), left).toInt()
    val readBytes = if (info.isDsf) info.blockSize * channels else count * channels
    if (raw.size < readBytes) raw = ByteArray(readBytes)
    if (!input.readFully(raw, 0, readBytes, true)) return Extractor.RESULT_END_OF_INPUT
    if (frames.size < count * channels) frames = ByteArray(count * channels)
    if (info.isDsf) {
      for (j in 0 until count) for (c in 0 until channels) frames[j * channels + c] = raw[c * info.blockSize + j]
    } else {
      System.arraycopy(raw, 0, frames, 0, count * channels)
    }
    byteIndex += count
    val packer = packer
    if (packer != null) {
      val even = count and 1.inv()
      if (ints.size < even / 2 * channels) ints = IntArray(even / 2 * channels)
      pcm.writeInts(ints, packer.pack(frames, 0, even, ints))
    } else {
      val converter = converter!!
      val need = converter.maxOutputFrames(count) * channels
      if (floats.size < need) floats = FloatArray(need)
      pcm.writeFloats(floats, converter.convert(frames, 0, count, floats))
    }
    return Extractor.RESULT_CONTINUE
  }

  private fun openStream(input: ExtractorInput, seekPosition: PositionHolder): Int {
    val info = try {
      Dsd.parse(peekReader(input), lengthOf(input))
    } catch (error: FormatException) {
      throw ParserException.createForMalformedContainer(error.message, error)
    }
    this.info = info
    val track = output.track(0, C.TRACK_TYPE_AUDIO)
    val dopRate = Dsd.dopRate(info.dsdRate)
    val useDop = MuseOutput.canUseDop(dopRate, info.channels)
    val pcm = if (useDop) {
      packer = DopPacker(info.channels, info.lsbFirst)
      PcmOut(track, dopRate, info.channels, C.ENCODING_PCM_24BIT, 24)
    } else {
      converter = DsdToPcm(info.dsdRate, info.channels, info.lsbFirst)
      PcmOut(track, Dsd.pcmRate(info.dsdRate), info.channels, C.ENCODING_PCM_FLOAT, 32)
    }
    this.pcm = pcm
    track.format(pcm.format { if (useDop) setLabel(LABEL_DOP) })
    output.endTracks()
    output.seekMap(object : SeekMap {
      override fun isSeekable() = true
      override fun getDurationUs() = info.durationUs
      override fun getSeekPoints(timeUs: Long): SeekMap.SeekPoints {
        val bytes = alignedByte((timeUs * (info.dsdRate / 8) / 1_000_000L).coerceIn(0L, maxOf(0L, info.bytesPerChannel - 1)))
        return SeekMap.SeekPoints(SeekPoint(bytes * 8_000_000L / info.dsdRate, positionOf(bytes)))
      }
    })
    seekPosition.position = info.dataOffset
    return Extractor.RESULT_SEEK
  }

  /** Seeks land on a DSF block, or an even byte (whole DoP frames). */
  private fun alignedByte(index: Long): Long {
    val info = info!!
    return if (info.isDsf) index / info.blockSize * info.blockSize else index and 1L.inv()
  }

  private fun positionOf(byte: Long): Long {
    val info = info!!
    return info.dataOffset + byte * info.channels
  }

  override fun seek(position: Long, timeUs: Long) {
    val info = info ?: return
    byteIndex = alignedByte(((position - info.dataOffset) / info.channels).coerceAtLeast(0))
    converter?.reset()
    packer?.reset()
    val pcm = pcm ?: return
    val frame = if (packer != null) byteIndex / 2 else byteIndex * 8 * pcm.sampleRate / info.dsdRate
    pcm.seekTo(frame, timeUs * pcm.sampleRate / 1_000_000L)
  }

  override fun release() = Unit

  private companion object {
    /** DFF bytes per channel per read. Even, so DoP frames never split. */
    const val CHUNK = 4096
  }
}
