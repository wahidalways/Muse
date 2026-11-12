package expo.modules.musemetadata.formats

import expo.modules.musemetadata.formats.FormatBytes.ascii
import expo.modules.musemetadata.formats.FormatBytes.beInt
import expo.modules.musemetadata.formats.FormatBytes.beShort

// AIFF and AIFF-C: uncompressed PCM in big-endian chunks. Media3 has no AIFF
// reader, so Muse finds the samples here and turns them into the little-endian
// PCM Media3 plays. Compressed AIFF-C (u-law, IMA...) is refused.

class AiffInfo(
  val stream: StreamInfo,
  /** First byte of the first sample frame. */
  val dataOffset: Long,
  /** Bytes of sample frames, whole frames only. */
  val dataLength: Long,
  /** Bytes per sample in the file. */
  val bytesPerSample: Int,
  val kind: Int,
) {
  val frameBytes: Int get() = bytesPerSample * stream.channels
}

object Aiff {
  const val INT_BIG = 0
  const val INT_LITTLE = 1
  const val FLOAT32 = 2
  const val FLOAT64 = 3

  fun isAiff(head: ByteArray): Boolean =
    head.size >= 12 && ascii(head, 0) == "FORM" && (ascii(head, 8) == "AIFF" || ascii(head, 8) == "AIFC")

  fun parse(read: ReadAt, fileLength: Long): AiffInfo {
    val head = read(0, 12) ?: throw FormatException("Not an AIFF file")
    if (!isAiff(head)) throw FormatException("Not an AIFF file")
    val isAifc = ascii(head, 8) == "AIFC"
    var channels = 0
    var frames = 0L
    var bits = 0
    var rate = 0.0
    var kind = INT_BIG
    var dataOffset = -1L
    var dataLength = 0L
    var position = 12L
    while (position + 8 <= fileLength) {
      val header = read(position, 8) ?: break
      val id = ascii(header, 0)
      val size = beInt(header, 4).toLong() and 0xFFFFFFFFL
      val body = position + 8
      when (id) {
        "COMM" -> {
          val comm = read(body, minOf(size, 64L).toInt()) ?: throw FormatException("Broken AIFF")
          if (comm.size < 18) throw FormatException("Broken AIFF")
          channels = beShort(comm, 0)
          frames = beInt(comm, 2).toLong() and 0xFFFFFFFFL
          bits = beShort(comm, 6)
          rate = extended(comm, 8)
          if (isAifc && comm.size >= 22) {
            kind = when (ascii(comm, 18)) {
              "NONE", "twos", "in24", "in32" -> INT_BIG
              "sowt", "23ni" -> INT_LITTLE
              "fl32", "FL32" -> FLOAT32
              "fl64", "FL64" -> FLOAT64
              else -> throw FormatException("Compressed AIFF-C (${ascii(comm, 18)})")
            }
          }
        }
        "SSND" -> {
          val ssnd = read(body, 8) ?: throw FormatException("Broken AIFF")
          val offset = beInt(ssnd, 0).toLong() and 0xFFFFFFFFL
          dataOffset = body + 8 + offset
          dataLength = minOf(size - 8 - offset, fileLength - dataOffset)
        }
      }
      // Chunks are padded to an even size.
      position = body + size + (size and 1)
    }
    if (channels <= 0 || rate <= 0 || dataOffset < 0) throw FormatException("Broken AIFF")
    if (kind == FLOAT32) bits = 32
    if (kind == FLOAT64) bits = 64
    // Samples sit left-justified in whole bytes, so a 20-bit file is 24-bit here.
    val bytes = (bits + 7) / 8
    if (bytes !in 1..8 || (kind <= INT_LITTLE && bytes > 4)) throw FormatException("Unusual AIFF sample size")
    val frameBytes = bytes * channels
    val wholeFrames = minOf(frames, dataLength / frameBytes)
    val isFloat = kind == FLOAT32 || kind == FLOAT64
    return AiffInfo(
      StreamInfo(Math.round(rate).toInt(), channels, if (isFloat) 32 else bytes * 8, isFloat, wholeFrames),
      dataOffset,
      wholeFrames * frameBytes,
      bytes,
      kind,
    )
  }

  /** Bytes per sample after [toPcm]: the same, except 64-bit floats become 32-bit. */
  fun outputBytesPerSample(info: AiffInfo): Int = if (info.kind == FLOAT64) 4 else info.bytesPerSample

  /**
   * Converts `frames` sample frames from the file's bytes to the little-endian
   * PCM Media3 takes: ints keep their depth (8-bit becomes unsigned, as Media3
   * wants), floats become 32-bit. Returns the bytes written to `dst`.
   */
  fun toPcm(info: AiffInfo, src: ByteArray, srcOffset: Int, frames: Int, dst: ByteArray, dstOffset: Int): Int {
    val samples = frames * info.stream.channels
    val width = info.bytesPerSample
    var s = srcOffset
    var d = dstOffset
    when (info.kind) {
      INT_BIG -> if (width == 1) {
        for (i in 0 until samples) dst[d++] = (src[s++].toInt() + 128).toByte()
      } else {
        for (i in 0 until samples) {
          for (b in width - 1 downTo 0) dst[d++] = src[s + b]
          s += width
        }
      }
      INT_LITTLE -> if (width == 1) {
        for (i in 0 until samples) dst[d++] = (src[s++].toInt() + 128).toByte()
      } else {
        System.arraycopy(src, s, dst, d, samples * width)
        d += samples * width
      }
      FLOAT32 -> for (i in 0 until samples) {
        dst[d++] = src[s + 3]; dst[d++] = src[s + 2]; dst[d++] = src[s + 1]; dst[d++] = src[s]
        s += 4
      }
      FLOAT64 -> for (i in 0 until samples) {
        var raw = 0L
        for (b in 0 until 8) raw = (raw shl 8) or (src[s + b].toLong() and 0xFF)
        s += 8
        val bitsOut = java.lang.Float.floatToRawIntBits(java.lang.Double.longBitsToDouble(raw).toFloat())
        dst[d++] = bitsOut.toByte(); dst[d++] = (bitsOut shr 8).toByte()
        dst[d++] = (bitsOut shr 16).toByte(); dst[d++] = (bitsOut shr 24).toByte()
      }
    }
    return d - dstOffset
  }

  /** The sample rate: an 80-bit IEEE extended float. */
  private fun extended(bytes: ByteArray, at: Int): Double {
    val exponent = (((bytes[at].toInt() and 0x7F) shl 8) or (bytes[at + 1].toInt() and 0xFF)) - 16383 - 63
    var mantissa = 0L
    for (i in 0 until 8) mantissa = (mantissa shl 8) or (bytes[at + 2 + i].toLong() and 0xFF)
    // The mantissa is unsigned 64-bit; halve it first so it fits a signed long.
    val value = (mantissa ushr 1).toDouble() * 2.0
    return Math.scalb(value, exponent)
  }
}
