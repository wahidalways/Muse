package expo.modules.musemetadata

import java.nio.ByteBuffer
import java.nio.channels.FileChannel

// Byte helpers shared by the tag readers (lyrics and pictures). Anything that
// does not parse cleanly returns null, which callers treat as "not there".

/** `length` bytes at `position`, or null if the file is shorter. */
internal fun readAt(channel: FileChannel, position: Long, length: Int): ByteArray? {
  if (length < 0 || position < 0 || position + length > channel.size()) {
    return null
  }
  val buffer = ByteBuffer.allocate(length)
  var offset = position
  while (buffer.hasRemaining()) {
    val read = channel.read(buffer, offset)
    if (read <= 0) {
      return null
    }
    offset += read
  }
  return buffer.array()
}

internal fun u8(bytes: ByteArray, at: Int): Int = bytes[at].toInt() and 0xFF

internal fun int32(bytes: ByteArray, at: Int): Int =
  (u8(bytes, at) shl 24) or (u8(bytes, at + 1) shl 16) or (u8(bytes, at + 2) shl 8) or u8(bytes, at + 3)

internal fun int32le(bytes: ByteArray, at: Int): Int =
  u8(bytes, at) or (u8(bytes, at + 1) shl 8) or (u8(bytes, at + 2) shl 16) or (u8(bytes, at + 3) shl 24)

internal fun syncsafe(bytes: ByteArray, at: Int): Int =
  (u8(bytes, at) shl 21) or (u8(bytes, at + 1) shl 14) or (u8(bytes, at + 2) shl 7) or u8(bytes, at + 3)

/** A top-level MP4 box's content as [start, end) file offsets. */
internal fun mp4BoxInFile(channel: FileChannel, type: String): Pair<Long, Long>? {
  var position = 0L
  val fileSize = channel.size()
  repeat(1_000) {
    if (position + 8 > fileSize) {
      return null
    }
    val header = readAt(channel, position, 16.coerceAtMost((fileSize - position).toInt())) ?: return null
    var size = int32(header, 0).toLong() and 0xFFFFFFFFL
    var headerSize = 8
    if (size == 1L && header.size >= 16) {
      size = ByteBuffer.wrap(header, 8, 8).long
      headerSize = 16
    } else if (size == 0L) {
      size = fileSize - position
    }
    if (size < headerSize) {
      return null
    }
    if (String(header, 4, 4, Charsets.ISO_8859_1) == type) {
      return Pair(position + headerSize, position + size)
    }
    position += size
  }
  return null
}

/** A child MP4 box's content as [start, end) offsets within `data`. */
internal fun mp4Box(data: ByteArray, from: Int, to: Int, type: String): Pair<Int, Int>? {
  var position = from
  while (position + 8 <= to) {
    val size = int32(data, position)
    if (size < 8 || position + size > to) {
      return null
    }
    if (String(data, position + 4, 4, Charsets.ISO_8859_1) == type) {
      return Pair(position + 8, position + size)
    }
    position += size
  }
  return null
}
