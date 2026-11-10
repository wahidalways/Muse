package expo.modules.musemetadata

import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.nio.channels.FileChannel

// Every picture stored in a music file's tags. Android only ever hands out one
// (MediaMetadataRetriever.embeddedPicture), so Muse reads the tags itself to
// find the best cover when a file holds several (front, back, booklet...).
// Only the tag area is read, never the audio.

/**
 * Tags bigger than this are not read (a cover is a few MB at most); such a
 * file gets Android's own picture. Reading takes a few copies of the tag at
 * once, so a bigger limit risks running the app out of memory.
 */
private const val MAX_TAG_BYTES = 16_000_000

/** ID3 and FLAC picture type for the front cover. */
private const val FRONT_COVER = 3

/** One picture from a file. `type` is the ID3/FLAC picture type, or -1 when the format has none (MP4, Ogg COVERART). */
internal class FilePicture(val type: Int, val bytes: ByteArray) {
  val width: Int
  val height: Int

  init {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    width = bounds.outWidth.coerceAtLeast(0)
    height = bounds.outHeight.coerceAtLeast(0)
  }

  val area: Long get() = width.toLong() * height

  val extension: String
    get() = if (bytes.size > 3 && u8(bytes, 0) == 0x89 && bytes[1] == 'P'.code.toByte()) "png" else "jpg"
}

/**
 * The picture to show: the biggest front cover, or the biggest picture when
 * none is marked as the front. Null when there are none.
 */
internal fun bestPicture(pictures: List<FilePicture>): FilePicture? =
  pictures.filter { it.type == FRONT_COVER }.ifEmpty { pictures }.maxByOrNull { it.area }

/** Every readable picture in the file's tags, in file order. */
internal fun readFilePictures(channel: FileChannel): List<FilePicture> {
  val head = readAt(channel, 0, 12) ?: return emptyList()
  val magic = String(head, 0, 4, Charsets.ISO_8859_1)
  val pictures = when {
    magic.startsWith("ID3") -> {
      // Some FLAC files carry an ID3 tag in front of "fLaC".
      val tagEnd = 10L + syncsafe(head, 6) + if ((u8(head, 5) and 0x10) != 0) 10 else 0
      id3Pictures(channel, head) + flacPictures(channel, tagEnd)
    }
    magic == "fLaC" -> flacPictures(channel, 0)
    magic == "OggS" -> oggPictures(channel)
    String(head, 4, 4, Charsets.ISO_8859_1) == "ftyp" -> mp4Pictures(channel)
    else -> emptyList()
  }
  return pictures.filter { it.width > 0 && it.height > 0 }
}

// ---------------------------------------------------------------------------
// MP3: APIC (v2.3, v2.4) and PIC (v2.2) frames of an ID3v2 tag.

private fun id3Pictures(channel: FileChannel, header: ByteArray): List<FilePicture> {
  val version = u8(header, 3)
  val flags = u8(header, 5)
  val size = syncsafe(header, 6)
  if (version !in 2..4 || size <= 0 || size > MAX_TAG_BYTES) {
    return emptyList()
  }
  var tag = readAt(channel, 10, size) ?: return emptyList()
  // v2.2 and v2.3 unsynchronise the whole tag; v2.4 marks it frame by frame.
  if (version < 4 && (flags and 0x80) != 0) {
    tag = resync(tag)
  }
  var position = 0
  if (version >= 3 && (flags and 0x40) != 0 && tag.size >= 4) {
    // Extended header: v2.4 counts its own size, v2.3 does not.
    position = if (version == 4) syncsafe(tag, 0) else int32(tag, 0) + 4
  }
  val idLength = if (version == 2) 3 else 4
  val headerLength = if (version == 2) 6 else 10
  val pictures = mutableListOf<FilePicture>()
  while (position >= 0 && position + headerLength <= tag.size) {
    if (tag[position].toInt() == 0) {
      break // padding
    }
    val id = String(tag, position, idLength, Charsets.ISO_8859_1)
    val frameSize = when (version) {
      2 -> (u8(tag, position + 3) shl 16) or (u8(tag, position + 4) shl 8) or u8(tag, position + 5)
      4 -> syncsafe(tag, position + 4)
      else -> int32(tag, position + 4)
    }
    val start = position + headerLength
    if (frameSize <= 0 || start + frameSize > tag.size) {
      break
    }
    if (id == "APIC" || id == "PIC") {
      frameBody(tag, position, start, frameSize, version)?.let { body ->
        (if (version == 2) picFrame(body) else apicFrame(body))?.let(pictures::add)
      }
    }
    position = start + frameSize
  }
  return pictures
}

/** A frame's data with its extra header bytes removed and unsynchronisation undone; null when compressed or encrypted. */
private fun frameBody(tag: ByteArray, header: Int, start: Int, size: Int, version: Int): ByteArray? {
  var from = start
  var unsynchronised = false
  if (version == 3) {
    val format = u8(tag, header + 9)
    if ((format and 0xC0) != 0) {
      return null // compressed or encrypted
    }
    if ((format and 0x20) != 0) from += 1 // group id
  } else if (version == 4) {
    val format = u8(tag, header + 9)
    if ((format and 0x0C) != 0) {
      return null // compressed or encrypted
    }
    if ((format and 0x40) != 0) from += 1 // group id
    if ((format and 0x01) != 0) from += 4 // data length
    unsynchronised = (format and 0x02) != 0
  }
  val end = start + size
  if (from >= end) {
    return null
  }
  val body = tag.copyOfRange(from, end)
  return if (unsynchronised) resync(body) else body
}

/** APIC: text encoding, MIME type, picture type, description, then the image. */
private fun apicFrame(body: ByteArray): FilePicture? {
  if (body.size < 4) {
    return null
  }
  val encoding = u8(body, 0)
  var position = skipText(body, 1, wide = false) // MIME type is always Latin-1
  if (position >= body.size) {
    return null
  }
  val type = u8(body, position)
  position = skipText(body, position + 1, wide = encoding == 1 || encoding == 2)
  return if (position < body.size) FilePicture(type, body.copyOfRange(position, body.size)) else null
}

/** PIC (ID3v2.2): text encoding, a 3-letter format, picture type, description, then the image. */
private fun picFrame(body: ByteArray): FilePicture? {
  if (body.size < 6) {
    return null
  }
  val encoding = u8(body, 0)
  val type = u8(body, 4)
  val position = skipText(body, 5, wide = encoding == 1)
  return if (position < body.size) FilePicture(type, body.copyOfRange(position, body.size)) else null
}

/** The position after a 0-terminated string: one 0 byte, or a 00 00 pair for UTF-16. */
private fun skipText(data: ByteArray, from: Int, wide: Boolean): Int {
  var position = from
  if (wide) {
    while (position + 1 < data.size) {
      if (data[position].toInt() == 0 && data[position + 1].toInt() == 0) {
        return position + 2
      }
      position += 2
    }
  } else {
    while (position < data.size) {
      if (data[position].toInt() == 0) {
        return position + 1
      }
      position += 1
    }
  }
  return data.size
}

/** Undoes ID3 unsynchronisation: every FF 00 pair was an FF. */
private fun resync(data: ByteArray): ByteArray {
  val out = ByteArrayOutputStream(data.size)
  var index = 0
  while (index < data.size) {
    out.write(data[index].toInt())
    index += if (u8(data, index) == 0xFF && index + 1 < data.size && data[index + 1].toInt() == 0) 2 else 1
  }
  return out.toByteArray()
}

// ---------------------------------------------------------------------------
// FLAC: PICTURE metadata blocks.

private fun flacPictures(channel: FileChannel, start: Long): List<FilePicture> {
  val magic = readAt(channel, start, 4) ?: return emptyList()
  if (String(magic, Charsets.ISO_8859_1) != "fLaC") {
    return emptyList()
  }
  val pictures = mutableListOf<FilePicture>()
  var position = start + 4
  repeat(128) {
    val header = readAt(channel, position, 4) ?: return pictures
    val isLast = (u8(header, 0) and 0x80) != 0
    val type = u8(header, 0) and 0x7F
    val length = (u8(header, 1) shl 16) or (u8(header, 2) shl 8) or u8(header, 3)
    if (type == 6) {
      readAt(channel, position + 4, length)?.let(::pictureBlock)?.let(pictures::add)
    }
    if (isLast) {
      return pictures
    }
    position += 4 + length
  }
  return pictures
}

/** A FLAC PICTURE block (also stored base64 in Ogg comments): type, MIME, description, size, then the image. */
private fun pictureBlock(block: ByteArray): FilePicture? {
  if (block.size < 32) {
    return null
  }
  val type = int32(block, 0)
  var position = 4
  val mimeLength = int32(block, position)
  if (mimeLength < 0 || mimeLength > block.size) return null
  position += 4 + mimeLength
  if (position + 4 > block.size) return null
  val descriptionLength = int32(block, position)
  if (descriptionLength < 0 || descriptionLength > block.size) return null
  position += 4 + descriptionLength + 16 // width, height, depth, colors
  if (position + 4 > block.size) return null
  val length = int32(block, position)
  position += 4
  if (length <= 0 || position + length > block.size) return null
  return FilePicture(type, block.copyOfRange(position, position + length))
}

// ---------------------------------------------------------------------------
// MP4/M4A: moov > udta > meta > ilst > covr, one data box per picture.

private fun mp4Pictures(channel: FileChannel): List<FilePicture> {
  val moov = mp4BoxInFile(channel, "moov") ?: return emptyList()
  val length = moov.second - moov.first
  if (length <= 0 || length > MAX_TAG_BYTES) {
    return emptyList()
  }
  val data = readAt(channel, moov.first, length.toInt()) ?: return emptyList()
  val udta = mp4Box(data, 0, data.size, "udta") ?: return emptyList()
  val meta = mp4Box(data, udta.first, udta.second, "meta") ?: return emptyList()
  // meta is a "full box": 4 bytes of version and flags come first.
  val ilst = mp4Box(data, meta.first + 4, meta.second, "ilst") ?: return emptyList()
  val covr = mp4Box(data, ilst.first, ilst.second, "covr") ?: return emptyList()
  val pictures = mutableListOf<FilePicture>()
  var position = covr.first
  while (position + 16 <= covr.second) {
    val size = int32(data, position)
    if (size < 16 || position + size > covr.second) {
      break
    }
    // data: 4 bytes type, 4 bytes locale, then the image.
    if (String(data, position + 4, 4, Charsets.ISO_8859_1) == "data") {
      pictures += FilePicture(-1, data.copyOfRange(position + 16, position + size))
    }
    position += size
  }
  return pictures
}

// ---------------------------------------------------------------------------
// Ogg Vorbis and Opus: METADATA_BLOCK_PICTURE (or the older COVERART) comments.

private fun oggPictures(channel: FileChannel): List<FilePicture> {
  val packet = oggPacket(channel, 1) ?: return emptyList()
  val start = when {
    packet.size > 7 && u8(packet, 0) == 3 && String(packet, 1, 6, Charsets.ISO_8859_1) == "vorbis" -> 7
    packet.size > 8 && String(packet, 0, 8, Charsets.ISO_8859_1) == "OpusTags" -> 8
    else -> return emptyList()
  }
  if (start + 8 > packet.size) {
    return emptyList()
  }
  var position = start + 4 + int32le(packet, start) // vendor string
  if (position < start || position + 4 > packet.size) {
    return emptyList()
  }
  val count = int32le(packet, position)
  position += 4
  val pictures = mutableListOf<FilePicture>()
  repeat(count.coerceIn(0, 10_000)) {
    if (position + 4 > packet.size) return pictures
    val length = int32le(packet, position)
    if (length < 0 || position + 4 + length > packet.size) return pictures
    val from = position + 4
    val equals = (from until from + length).firstOrNull { packet[it] == '='.code.toByte() }
    if (equals != null) {
      val key = String(packet, from, equals - from, Charsets.ISO_8859_1)
      val isBlock = key.equals("METADATA_BLOCK_PICTURE", ignoreCase = true)
      if (isBlock || key.equals("COVERART", ignoreCase = true)) {
        val decoded = runCatching {
          Base64.decode(packet.copyOfRange(equals + 1, from + length), Base64.DEFAULT)
        }.getOrNull()
        if (decoded != null) {
          (if (isBlock) pictureBlock(decoded) else FilePicture(-1, decoded))?.let(pictures::add)
        }
      }
    }
    position = from + length
  }
  return pictures
}

/** Packet `index` of the stream, joined across pages. */
private fun oggPacket(channel: FileChannel, index: Int): ByteArray? {
  val out = ByteArrayOutputStream()
  var position = 0L
  var packet = 0
  repeat(20_000) {
    val header = readAt(channel, position, 27) ?: return null
    if (String(header, 0, 4, Charsets.ISO_8859_1) != "OggS") {
      return null
    }
    val segments = u8(header, 26)
    val table = readAt(channel, position + 27, segments) ?: return null
    val bodyLength = (0 until segments).sumOf { u8(table, it) }
    val body = readAt(channel, position + 27 + segments, bodyLength) ?: return null
    var offset = 0
    for (segment in 0 until segments) {
      val lace = u8(table, segment)
      if (packet == index) {
        out.write(body, offset, lace)
        if (out.size() > MAX_TAG_BYTES) return null
      }
      offset += lace
      if (lace < 255) {
        // The packet ends in this segment.
        if (packet == index) {
          return out.toByteArray()
        }
        packet += 1
      }
    }
    position += 27 + segments + bodyLength
  }
  return null
}
