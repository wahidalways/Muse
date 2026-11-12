package expo.modules.musemetadata.formats

import expo.modules.musemetadata.formats.FormatBytes.ascii
import expo.modules.musemetadata.formats.FormatBytes.beInt
import expo.modules.musemetadata.formats.FormatBytes.beLong
import expo.modules.musemetadata.formats.FormatBytes.beShort
import expo.modules.musemetadata.formats.FormatBytes.leInt
import expo.modules.musemetadata.formats.FormatBytes.leLong

// DSD audio: DSF (Sony) and DSDIFF/DFF (Philips) files, uncompressed only
// (DST-compressed DFF is refused). Phones cannot play DSD, so Muse either
// turns it into PCM (DsdToPcm) or, for a USB DAC in bit-perfect mode, wraps
// the untouched DSD bits in PCM frames the DAC unpacks (DoP, DopPacker).

class DsdInfo(
  /** DSD samples per second per channel, e.g. 2,822,400 for DSD64. */
  val dsdRate: Int,
  val channels: Int,
  /** DSD samples (bits) per channel. */
  val samplesPerChannel: Long,
  val dataOffset: Long,
  val dataLength: Long,
  /** DSF: channels come in blocks of [blockSize] bytes each. DFF: byte by byte. */
  val isDsf: Boolean,
  val blockSize: Int,
  /** True when the first DSD sample in time is a byte's lowest bit (most DSF files). */
  val lsbFirst: Boolean,
  val channelMask: Int,
  /** Where an ID3v2 tag starts, or 0 when there is none. */
  val id3Offset: Long,
) {
  /** Bytes per channel that hold real samples (the last DSF block is padded). */
  val bytesPerChannel: Long get() = (samplesPerChannel + 7) / 8
  val durationUs: Long get() = samplesPerChannel * 1_000_000L / dsdRate
}

object Dsd {
  fun isDsd(head: ByteArray): Boolean =
    head.size >= 4 && (ascii(head, 0) == "DSD " || (head.size >= 16 && ascii(head, 0) == "FRM8" && ascii(head, 12) == "DSD "))

  fun parse(read: ReadAt, fileLength: Long): DsdInfo {
    val head = read(0, 16) ?: throw FormatException("Not a DSD file")
    return when {
      ascii(head, 0) == "DSD " -> parseDsf(read, fileLength)
      ascii(head, 0) == "FRM8" && ascii(head, 12) == "DSD " -> parseDff(read, fileLength)
      else -> throw FormatException("Not a DSD file")
    }
  }

  /** PCM made from DSD plays at 88.2 kHz (or 96 kHz for the 48 kHz family of DSD rates). */
  fun pcmRate(dsdRate: Int): Int = if (dsdRate % 44100 == 0) 88_200 else 96_000

  /** DoP carries 16 DSD samples per PCM frame, so DSD64 travels as 176.4 kHz PCM. */
  fun dopRate(dsdRate: Int): Int = dsdRate / 16

  private fun parseDsf(read: ReadAt, fileLength: Long): DsdInfo {
    val dsd = read(0, 28) ?: throw FormatException("Broken DSF")
    val id3 = leLong(dsd, 20)
    val fmtStart = leLong(dsd, 4)
    val fmt = read(fmtStart, 52) ?: throw FormatException("Broken DSF")
    if (ascii(fmt, 0) != "fmt ") throw FormatException("Broken DSF")
    val formatId = leInt(fmt, 16)
    if (formatId != 0) throw FormatException("Unknown DSF format")
    val channelType = leInt(fmt, 20)
    val channels = leInt(fmt, 24)
    val rate = leInt(fmt, 28)
    val bits = leInt(fmt, 32)
    val samples = leLong(fmt, 36)
    val blockSize = leInt(fmt, 44)
    val dataStart = fmtStart + leLong(fmt, 4)
    val data = read(dataStart, 12) ?: throw FormatException("Broken DSF")
    if (ascii(data, 0) != "data") throw FormatException("Broken DSF")
    val dataLength = minOf(leLong(data, 4) - 12, fileLength - dataStart - 12)
    if (channels !in 1..8 || rate < 2_822_400 || blockSize <= 0 || samples <= 0) throw FormatException("Unusual DSF")
    return DsdInfo(
      rate, channels, samples, dataStart + 12, dataLength, true, blockSize,
      lsbFirst = bits == 1,
      channelMask = dsfMask(channelType),
      id3Offset = if (id3 > 0 && id3 < fileLength) id3 else 0,
    )
  }

  private fun parseDff(read: ReadAt, fileLength: Long): DsdInfo {
    var rate = 0
    var channels = 0
    var compression = "DSD "
    var dataOffset = -1L
    var dataLength = 0L
    var id3 = 0L
    var position = 16L
    while (position + 12 <= fileLength) {
      val header = read(position, 12) ?: break
      val id = ascii(header, 0)
      val size = beLong(header, 4)
      val body = position + 12
      if (size < 0) break
      when (id) {
        "PROP" -> {
          // "SND " then its own sub-chunks.
          var sub = body + 4
          val end = body + size
          while (sub + 12 <= end) {
            val subHeader = read(sub, 12) ?: break
            val subSize = beLong(subHeader, 4)
            val subBody = sub + 12
            when (ascii(subHeader, 0)) {
              "FS  " -> rate = read(subBody, 4)?.let { beInt(it, 0) } ?: 0
              "CHNL" -> channels = read(subBody, 2)?.let { beShort(it, 0) } ?: 0
              "CMPR" -> compression = read(subBody, 4)?.let { ascii(it, 0) } ?: compression
            }
            sub = subBody + subSize + (subSize and 1)
          }
        }
        "DSD " -> {
          dataOffset = body
          dataLength = minOf(size, fileLength - body)
        }
        "DST " -> throw FormatException("DST-compressed DSD")
        "ID3 " -> id3 = body
      }
      position = body + size + (size and 1)
    }
    if (compression != "DSD ") throw FormatException("DST-compressed DSD")
    if (rate < 2_822_400 || channels !in 1..8 || dataOffset < 0) throw FormatException("Broken DFF")
    return DsdInfo(
      rate, channels, dataLength / channels * 8, dataOffset, dataLength, false, 1,
      lsbFirst = false,
      channelMask = if (channels == 2) 0x3 else 0,
      id3Offset = id3,
    )
  }

  private fun dsfMask(type: Int): Int = when (type) {
    1 -> 0x4 // mono = front center
    2 -> 0x3
    3 -> 0x7
    4 -> 0x33
    5 -> 0xF
    6 -> 0x37
    7 -> 0x3F
    else -> 0
  }
}

/** Reverses the bit order of a byte, for LSB-first DSF data. */
internal val REVERSED_BITS = IntArray(256) { value ->
  var reversed = 0
  for (bit in 0 until 8) if (value and (1 shl bit) != 0) reversed = reversed or (0x80 ushr bit)
  reversed
}

/**
 * DSD to PCM: one low-pass filter that also decimates, run as lookup tables
 * (each DSD byte adds a precomputed sum of 8 filter taps). Output is float at
 * [Dsd.pcmRate], unity gain, so the loudest DSD (100% modulation) is full scale
 * and nothing clips. Input is DSD bytes interleaved by channel (one byte of
 * channel 0, one of channel 1, ...), each byte in [lsbFirst] bit order.
 */
class DsdToPcm(dsdRate: Int, private val channels: Int, lsbFirst: Boolean) {
  val pcmRate = Dsd.pcmRate(dsdRate)
  /** DSD bytes per channel for each PCM sample. */
  private val step = dsdRate / pcmRate / 8
  /** Filter length in bytes: long enough for a flat band to 20 kHz and quiet aliasing. */
  private val window: Int
  private val tables: FloatArray
  private val history: Array<ByteArray>
  private var filled = 0
  private var sinceOutput = 0
  private var writeIndex = 0

  init {
    require(step >= 1 && dsdRate % (pcmRate * 8) == 0) { "Unusual DSD rate $dsdRate" }
    val taps = when {
      step <= 4 -> 1024 // DSD64
      step <= 16 -> 2048 // DSD128, DSD256
      else -> 4096
    }
    window = taps / 8
    val coefficients = lowPass(taps, (20_000.0 + 4.0 * dsdRate / taps) / dsdRate)
    tables = FloatArray(window * 256)
    for (k in 0 until window) {
      for (value in 0 until 256) {
        // Time order inside the byte: bit 7 first unless the file stores the lowest bit first.
        val ordered = if (lsbFirst) REVERSED_BITS[value] else value
        var sum = 0.0
        for (bit in 0 until 8) {
          val one = (ordered shr (7 - bit)) and 1
          sum += coefficients[k * 8 + bit] * (if (one == 1) 1.0 else -1.0)
        }
        tables[k * 256 + value] = sum.toFloat()
      }
    }
    history = Array(channels) { ByteArray(window) }
    reset()
  }

  /** Forgets past samples (after a seek): the filter starts from DSD silence. */
  fun reset() {
    // 0x69 is DSD's idle pattern: as many ones as zeros, so no click at the start.
    for (channel in history) channel.fill(0x69)
    filled = window
    sinceOutput = 0
    writeIndex = 0
  }

  /** PCM frames `byteFrames` DSD byte frames will make at most. */
  fun maxOutputFrames(byteFrames: Int): Int = byteFrames / step + 1

  /** Converts `byteFrames` interleaved DSD byte frames; writes interleaved float frames to `out`, returns how many. */
  fun convert(input: ByteArray, offset: Int, byteFrames: Int, out: FloatArray): Int {
    var frames = 0
    var position = offset
    val mask = window
    for (i in 0 until byteFrames) {
      for (channel in 0 until channels) {
        history[channel][writeIndex] = input[position++]
      }
      writeIndex += 1
      if (writeIndex == mask) writeIndex = 0
      sinceOutput += 1
      if (sinceOutput == step) {
        sinceOutput = 0
        val base = frames * channels
        for (channel in 0 until channels) {
          val ring = history[channel]
          var sum = 0f
          // Oldest byte first: it lines up with the filter's first taps.
          var index = writeIndex
          var k = 0
          while (k < window) {
            sum += tables[(k shl 8) + (ring[index].toInt() and 0xFF)]
            index += 1
            if (index == mask) index = 0
            k += 1
          }
          out[base + channel] = sum
        }
        frames += 1
      }
    }
    return frames
  }

  private fun lowPass(taps: Int, cutoff: Double): DoubleArray {
    // Windowed sinc with a 4-term Blackman-Harris window (about -92 dB side lobes).
    val coefficients = DoubleArray(taps)
    val middle = (taps - 1) / 2.0
    var total = 0.0
    for (n in 0 until taps) {
      val x = n - middle
      val sinc = if (x == 0.0) 2 * cutoff else Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)
      val phase = 2 * Math.PI * n / (taps - 1)
      val blackman = 0.35875 - 0.48829 * Math.cos(phase) + 0.14128 * Math.cos(2 * phase) - 0.01168 * Math.cos(3 * phase)
      coefficients[n] = sinc * blackman
      total += coefficients[n]
    }
    for (n in 0 until taps) coefficients[n] /= total
    return coefficients
  }
}

/**
 * DSD over PCM (DoP 1.1): each 24-bit PCM sample carries 16 DSD bits under a
 * marker byte that alternates 0x05 / 0xFA, so a DoP DAC can tell it is DSD.
 * The bits are never changed. Output: interleaved 24-bit samples, sign-extended.
 */
class DopPacker(private val channels: Int, private val lsbFirst: Boolean) {
  private var marker = 0x05

  fun reset() {
    marker = 0x05
  }

  /** Packs pairs of interleaved DSD byte frames; `byteFrames` must be even. Returns PCM frames written. */
  fun pack(input: ByteArray, offset: Int, byteFrames: Int, out: IntArray): Int {
    val frames = byteFrames / 2
    var position = offset
    var o = 0
    for (frame in 0 until frames) {
      for (channel in 0 until channels) {
        val older = input[position + channel].toInt() and 0xFF
        val newer = input[position + channels + channel].toInt() and 0xFF
        val first = if (lsbFirst) REVERSED_BITS[older] else older
        val second = if (lsbFirst) REVERSED_BITS[newer] else newer
        val word = (marker shl 16) or (first shl 8) or second
        out[o++] = (word shl 8) shr 8
      }
      position += channels * 2
      marker = if (marker == 0x05) 0xFA else 0x05
    }
    return frames
  }
}
