package expo.modules.musemetadata.formats

/** Byte helpers for the format readers Muse writes itself (AIFF, DSD, tags). */
internal object FormatBytes {
  fun ascii(bytes: ByteArray, at: Int): String = String(bytes, at, 4, Charsets.ISO_8859_1)

  fun beInt(bytes: ByteArray, at: Int): Int =
    ((bytes[at].toInt() and 0xFF) shl 24) or ((bytes[at + 1].toInt() and 0xFF) shl 16) or
      ((bytes[at + 2].toInt() and 0xFF) shl 8) or (bytes[at + 3].toInt() and 0xFF)

  fun beShort(bytes: ByteArray, at: Int): Int = ((bytes[at].toInt() and 0xFF) shl 8) or (bytes[at + 1].toInt() and 0xFF)

  fun leInt(bytes: ByteArray, at: Int): Int =
    (bytes[at].toInt() and 0xFF) or ((bytes[at + 1].toInt() and 0xFF) shl 8) or
      ((bytes[at + 2].toInt() and 0xFF) shl 16) or ((bytes[at + 3].toInt() and 0xFF) shl 24)

  fun leLong(bytes: ByteArray, at: Int): Long =
    (leInt(bytes, at).toLong() and 0xFFFFFFFFL) or (leInt(bytes, at + 4).toLong() shl 32)

  fun beLong(bytes: ByteArray, at: Int): Long =
    (beInt(bytes, at).toLong() shl 32) or (beInt(bytes, at + 4).toLong() and 0xFFFFFFFFL)
}
