package expo.modules.musemetadata

import java.nio.channels.FileChannel

// Bit depth straight from the file header, for when Android's extractor does
// not report it. Only lossless formats have one: FLAC (STREAMINFO) and WAV
// (the fmt chunk). Anything that does not parse cleanly is null.

internal fun readBitDepth(channel: FileChannel): Int? {
  val head = readAt(channel, 0, 12) ?: return null
  val magic = String(head, 0, 4, Charsets.ISO_8859_1)
  return when {
    // Some FLAC files carry an ID3 tag in front of "fLaC".
    magic.startsWith("ID3") -> flacBitDepth(channel, 10L + syncsafe(head, 6) + if ((u8(head, 5) and 0x10) != 0) 10 else 0)
    magic == "fLaC" -> flacBitDepth(channel, 0)
    magic == "RIFF" && String(head, 8, 4, Charsets.ISO_8859_1) == "WAVE" -> wavBitDepth(channel)
    else -> null
  }
}

/** STREAMINFO is always the first block: 5 bits of (bits per sample - 1) at byte 12-13 of its body. */
private fun flacBitDepth(channel: FileChannel, start: Long): Int? {
  val bytes = readAt(channel, start, 8 + 14) ?: return null
  if (String(bytes, 0, 4, Charsets.ISO_8859_1) != "fLaC" || (u8(bytes, 4) and 0x7F) != 0) {
    return null
  }
  val body = 8
  return ((((u8(bytes, body + 12) and 0x01) shl 4) or (u8(bytes, body + 13) shr 4)) + 1).takeIf { it in 4..32 }
}

/** The fmt chunk's bits per sample; WAVE_FORMAT_EXTENSIBLE gives the real (valid) bits after it. */
private fun wavBitDepth(channel: FileChannel): Int? {
  var position = 12L
  repeat(64) {
    val header = readAt(channel, position, 8) ?: return null
    val size = int32le(header, 4).toLong() and 0xFFFFFFFFL
    if (String(header, 0, 4, Charsets.ISO_8859_1) == "fmt ") {
      val fmt = readAt(channel, position + 8, size.coerceAtMost(40).toInt()) ?: return null
      if (fmt.size < 16) {
        return null
      }
      val bits = u16le(fmt, 14)
      val extensible = u16le(fmt, 0) == 0xFFFE && fmt.size >= 20
      return (if (extensible) u16le(fmt, 18).takeIf { it > 0 } ?: bits else bits).takeIf { it in 4..64 }
    }
    // Chunks are padded to an even size.
    position += 8 + size + (size and 1)
  }
  return null
}

private fun u16le(bytes: ByteArray, at: Int): Int = u8(bytes, at) or (u8(bytes, at + 1) shl 8)
