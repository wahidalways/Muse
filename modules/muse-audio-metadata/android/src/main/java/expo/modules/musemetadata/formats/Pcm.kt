package expo.modules.musemetadata.formats

// Shared shapes for Muse's own decoders (APE, WavPack, ALAC, DSD, AIFF).
// Pure Kotlin: nothing here touches Android or Media3, so the decoders are
// tested on a desktop JVM against ffmpeg's output, bit for bit.

/** What a stream holds, read from its header. */
class StreamInfo(
  val sampleRate: Int,
  val channels: Int,
  /** Bits per sample as stored: 8, 16, 24 or 32 (32 with [isFloat] = 32-bit float). */
  val bitsPerSample: Int,
  val isFloat: Boolean,
  /** Length in sample frames (one sample per channel), or -1 when the file does not say. */
  val totalFrames: Long,
  /** WAVE_FORMAT_EXTENSIBLE-style speaker mask, or 0 for the default layout. */
  val channelMask: Int = 0,
)

/**
 * Decoded audio, interleaved (L R L R ...). Each Int holds one sample
 * sign-extended at its own bit depth (a 24-bit sample stays in -2^23..2^23-1),
 * or, for float streams, the sample's raw float bits (Float.fromBits).
 * [samples] may be longer than needed; only frames * channels are valid.
 */
class PcmBlock(val samples: IntArray, val frames: Int)

/** Reads `length` bytes at an absolute file position; null at or past the end. */
typealias ReadAt = (position: Long, length: Int) -> ByteArray?

/** Thrown when a file is damaged or uses a feature Muse cannot decode. */
class FormatException(message: String) : Exception(message)
