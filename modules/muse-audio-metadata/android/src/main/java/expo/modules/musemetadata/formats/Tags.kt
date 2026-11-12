package expo.modules.musemetadata.formats

import expo.modules.musemetadata.formats.FormatBytes.ascii
import expo.modules.musemetadata.formats.FormatBytes.beInt
import expo.modules.musemetadata.formats.FormatBytes.leInt
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

// Song tags Muse reads itself, for files Android's scanner leaves untagged:
// WAV (LIST/INFO and an id3 chunk), AIFF, APE and WavPack (APEv2), DSF and DFF
// (ID3), plus plain ID3v2/ID3v1 as a fallback when Android's fields are empty.
// Only tag areas are read, never the audio.

class TagValues {
  var title: String? = null
  var artist: String? = null
  var album: String? = null
  var albumArtist: String? = null
  var genre: String? = null
  var year: Int? = null
  var trackNumber: Int? = null
  /** From the audio header, for formats Android cannot measure. */
  var durationSeconds: Double? = null
  var sampleRate: Int? = null
  var bitDepth: Int? = null
  var channels: Int? = null
  /** "AIFF", "APE", "WavPack", "DSD"... for Song info. */
  var codec: String? = null

  /** Fills only the fields still empty. */
  fun fillFrom(other: TagValues) {
    title = title ?: other.title
    artist = artist ?: other.artist
    album = album ?: other.album
    albumArtist = albumArtist ?: other.albumArtist
    genre = genre ?: other.genre
    year = year ?: other.year
    trackNumber = trackNumber ?: other.trackNumber
  }

  val isEmpty: Boolean get() = title == null && artist == null && album == null
}

/** A picture from a tag: ID3/FLAC picture type (3 = front cover, -1 unknown) and the image bytes. */
class RawPicture(val type: Int, val bytes: ByteArray)

object Tags {
  private const val MAX_TAG_BYTES = 16_000_000

  /** Everything Muse can read from the file's own tags. Never throws. */
  fun read(read: ReadAt, length: Long): TagValues = runCatching { readTags(read, length, pictures = null) }.getOrElse { TagValues() }

  /** Pictures from the tags of WAV, AIFF, APE, WavPack and DSD files (other formats: FilePictures.kt). */
  fun pictures(read: ReadAt, length: Long): List<RawPicture> {
    val found = mutableListOf<RawPicture>()
    runCatching { readTags(read, length, found) }
    return found
  }

  private fun readTags(read: ReadAt, length: Long, pictures: MutableList<RawPicture>?): TagValues {
    val head = read(0, 16) ?: return TagValues()
    val magic = ascii(head, 0)
    val values = TagValues()
    when {
      (magic == "RIFF" || magic == "RF64" || magic == "BW64") && ascii(head, 8) == "WAVE" -> riff(read, length, values, pictures)
      Aiff.isAiff(head) -> aiff(read, length, values, pictures)
      Dsd.isDsd(head) -> {
        val info = Dsd.parse(read, length)
        values.durationSeconds = info.samplesPerChannel.toDouble() / info.dsdRate
        values.sampleRate = info.dsdRate
        values.bitDepth = 1
        values.channels = info.channels
        values.codec = "DSD"
        if (info.id3Offset > 0) id3At(read, info.id3Offset, values, pictures)
      }
      magic == "wvpk" -> {
        values.codec = "WavPack"
        runCatching { WavPackFile.readInfo(read, length) }.getOrNull()?.stream?.let { describe(values, it) }
        apeTag(read, length, values, pictures)
      }
      magic == "MAC " || (magic.startsWith("ID3") && isApeAfterId3(read, head)) -> {
        values.codec = "APE"
        runCatching { ApeFile.parse(read, length) }.getOrNull()?.stream?.let { describe(values, it) }
        apeTag(read, length, values, pictures)
        if (magic.startsWith("ID3")) id3At(read, 0, values, pictures)
      }
      magic.startsWith("ID3") -> id3At(read, 0, values, pictures)
    }
    if (values.isEmpty) id3v1(read, length, values)
    return values
  }

  private fun describe(values: TagValues, stream: StreamInfo) {
    if (stream.totalFrames > 0 && stream.sampleRate > 0) values.durationSeconds = stream.totalFrames.toDouble() / stream.sampleRate
    values.sampleRate = stream.sampleRate
    values.bitDepth = stream.bitsPerSample
    values.channels = stream.channels
  }

  private fun isApeAfterId3(read: ReadAt, head: ByteArray): Boolean {
    val end = 10L + syncsafe(head, 6) + if ((head[5].toInt() and 0x10) != 0) 10 else 0
    return read(end, 4)?.let { ascii(it, 0) == "MAC " } == true
  }

  // -------------------------------------------------------------------------
  // WAV: LIST/INFO text chunks and an "id3 " chunk (ID3 wins: it handles every script).

  private fun riff(read: ReadAt, length: Long, values: TagValues, pictures: MutableList<RawPicture>?) {
    val info = TagValues()
    var dataSize64 = -1L
    var position = 12L
    repeat(4096) {
      if (position + 8 > length) return@repeat
      val header = read(position, 8) ?: return@repeat
      val id = ascii(header, 0)
      var size = leInt(header, 4).toLong() and 0xFFFFFFFFL
      val body = position + 8
      when (id) {
        // RF64/BW64 keep the real data size in ds64, since 4 GB does not fit 32 bits.
        "ds64" -> read(body + 8, 8)?.let { dataSize64 = ByteBuffer.wrap(it).order(java.nio.ByteOrder.LITTLE_ENDIAN).long }
        "data" -> if (size == 0xFFFFFFFFL && dataSize64 >= 0) size = dataSize64
        "LIST" -> if (size in 4..MAX_TAG_BYTES.toLong()) {
          read(body, size.toInt())?.let { list -> if (ascii(list, 0) == "INFO") riffInfo(list, info) }
        }
        "id3 ", "ID3 " -> id3At(read, body, values, pictures)
      }
      position = body + size + (size and 1)
      if (position >= length) return@repeat
    }
    values.fillFrom(info)
  }

  private fun riffInfo(list: ByteArray, into: TagValues) {
    var position = 4
    while (position + 8 <= list.size) {
      val id = ascii(list, position)
      val size = leInt(list, position + 4)
      val start = position + 8
      if (size < 0 || start + size > list.size) break
      val text = legacyText(list, start, size)
      when (id) {
        "INAM" -> into.title = text
        "IART" -> into.artist = text
        "IPRD" -> into.album = text
        "IGNR" -> into.genre = text
        "ICRD" -> into.year = yearOf(text)
        "ITRK", "IPRT", "TRCK" -> into.trackNumber = numberOf(text)
      }
      position = start + size + (size and 1)
    }
  }

  // -------------------------------------------------------------------------
  // AIFF: an "ID3 " chunk, or the old NAME/AUTH text chunks.

  private fun aiff(read: ReadAt, length: Long, values: TagValues, pictures: MutableList<RawPicture>?) {
    runCatching { Aiff.parse(read, length) }.getOrNull()?.let {
      describe(values, it.stream)
      values.codec = "AIFF"
    }
    val text = TagValues()
    var position = 12L
    repeat(4096) {
      if (position + 8 > length) return@repeat
      val header = read(position, 8) ?: return@repeat
      val size = beInt(header, 4).toLong() and 0xFFFFFFFFL
      val body = position + 8
      when (ascii(header, 0)) {
        "ID3 ", "id3 " -> id3At(read, body, values, pictures)
        "NAME" -> text.title = read(body, size.coerceAtMost(4096).toInt())?.let { legacyText(it, 0, it.size) }
        "AUTH" -> text.artist = read(body, size.coerceAtMost(4096).toInt())?.let { legacyText(it, 0, it.size) }
      }
      position = body + size + (size and 1)
    }
    values.fillFrom(text)
  }

  // -------------------------------------------------------------------------
  // APEv2 (APE and WavPack files): a footer at the end, or before an ID3v1 tag.

  private fun apeTag(read: ReadAt, length: Long, values: TagValues, pictures: MutableList<RawPicture>?) {
    val footerAt = listOf(length - 32, length - 128 - 32).firstOrNull { at ->
      at >= 0 && read(at, 8)?.let { String(it, Charsets.ISO_8859_1) == "APETAGEX" } == true
    } ?: return
    val footer = read(footerAt, 32) ?: return
    val tagSize = leInt(footer, 12)
    val count = leInt(footer, 16)
    if (tagSize < 32 || tagSize > MAX_TAG_BYTES || count < 0) return
    val items = read(footerAt + 32 - tagSize, tagSize - 32) ?: return
    val found = TagValues()
    var position = 0
    repeat(count.coerceAtMost(10_000)) {
      if (position + 9 > items.size) return@repeat
      val size = leInt(items, position)
      val flags = leInt(items, position + 4)
      var keyEnd = position + 8
      while (keyEnd < items.size && items[keyEnd].toInt() != 0) keyEnd++
      val key = String(items, position + 8, keyEnd - position - 8, Charsets.ISO_8859_1).lowercase()
      val start = keyEnd + 1
      if (size < 0 || start + size > items.size) return@repeat
      val isText = (flags shr 1) and 3 == 0
      if (isText) {
        val text = clean(String(items, start, size, Charsets.UTF_8).replace('\u0000', '\n').lines().filter { it.isNotBlank() }.joinToString(", "))
        when (key) {
          "title" -> found.title = text
          "artist" -> found.artist = text
          "album" -> found.album = text
          "album artist", "albumartist" -> found.albumArtist = text
          "genre" -> found.genre = text
          "year", "date" -> found.year = yearOf(text)
          "track" -> found.trackNumber = numberOf(text)
        }
      } else if (pictures != null && key.startsWith("cover art")) {
        // A file name, a 0 byte, then the image.
        var nameEnd = start
        while (nameEnd < start + size && items[nameEnd].toInt() != 0) nameEnd++
        if (nameEnd + 1 < start + size) {
          val type = when {
            key.contains("front") -> 3
            key.contains("back") -> 4
            else -> 0
          }
          pictures += RawPicture(type, items.copyOfRange(nameEnd + 1, start + size))
        }
      }
      position = start + size
    }
    values.fillFrom(found)
  }

  // -------------------------------------------------------------------------
  // ID3v2 anywhere in a file (MP3 start, WAV/AIFF chunk, DSF metadata block).

  private fun id3At(read: ReadAt, offset: Long, values: TagValues, pictures: MutableList<RawPicture>?) {
    val header = read(offset, 10) ?: return
    if (!(header[0] == 'I'.code.toByte() && header[1] == 'D'.code.toByte() && header[2] == '3'.code.toByte())) return
    val version = header[3].toInt() and 0xFF
    val flags = header[5].toInt() and 0xFF
    val size = syncsafe(header, 6)
    if (version !in 2..4 || size <= 0 || size > MAX_TAG_BYTES) return
    var tag = read(offset + 10, size) ?: return
    if (version < 4 && (flags and 0x80) != 0) tag = resync(tag)
    var position = 0
    if (version >= 3 && (flags and 0x40) != 0 && tag.size >= 4) {
      position = if (version == 4) syncsafe(tag, 0) else beInt(tag, 0) + 4
    }
    val idLength = if (version == 2) 3 else 4
    val headerLength = if (version == 2) 6 else 10
    val found = TagValues()
    while (position >= 0 && position + headerLength <= tag.size) {
      if (tag[position].toInt() == 0) break
      val id = String(tag, position, idLength, Charsets.ISO_8859_1)
      val frameSize = when (version) {
        2 -> ((tag[position + 3].toInt() and 0xFF) shl 16) or ((tag[position + 4].toInt() and 0xFF) shl 8) or (tag[position + 5].toInt() and 0xFF)
        4 -> syncsafe(tag, position + 4)
        else -> beInt(tag, position + 4)
      }
      val start = position + headerLength
      if (frameSize <= 0 || start + frameSize > tag.size) break
      val body = frameBody(tag, position, start, frameSize, version)
      if (body != null && body.isNotEmpty()) {
        when (id) {
          "TIT2", "TT2" -> found.title = id3Text(body, ", ")
          "TPE1", "TP1" -> found.artist = id3Text(body, ", ")
          "TALB", "TAL" -> found.album = id3Text(body, ", ")
          "TPE2", "TP2" -> found.albumArtist = id3Text(body, ", ")
          "TCON", "TCO" -> found.genre = id3Text(body, "\u0000")?.let(::genreName)
          "TYER", "TYE", "TDRC", "TDOR" -> if (found.year == null) found.year = id3Text(body, " ")?.let(::yearOf)
          "TRCK", "TRK" -> found.trackNumber = id3Text(body, " ")?.let(::numberOf)
          "APIC" -> if (pictures != null) apic(body)?.let(pictures::add)
          "PIC" -> if (pictures != null) pic(body)?.let(pictures::add)
        }
      }
      position = start + frameSize
    }
    values.fillFrom(found)
  }

  private fun frameBody(tag: ByteArray, header: Int, start: Int, size: Int, version: Int): ByteArray? {
    var from = start
    var unsynchronised = false
    if (version >= 3) {
      val format = tag[header + 9].toInt() and 0xFF
      if (version == 3) {
        if ((format and 0xC0) != 0) return null // compressed or encrypted
        if ((format and 0x20) != 0) from += 1
      } else {
        if ((format and 0x0C) != 0) return null
        if ((format and 0x40) != 0) from += 1
        if ((format and 0x01) != 0) from += 4
        unsynchronised = (format and 0x02) != 0
      }
    }
    if (from >= start + size) return null
    val body = tag.copyOfRange(from, start + size)
    return if (unsynchronised) resync(body) else body
  }

  /** A text frame: encoding byte, then one or more 0-separated strings. */
  private fun id3Text(body: ByteArray, joiner: String): String? {
    val encoding = body[0].toInt() and 0xFF
    val raw = when (encoding) {
      0 -> legacyDecode(body, 1, body.size - 1)
      1 -> String(body, 1, body.size - 1, Charsets.UTF_16)
      2 -> String(body, 1, body.size - 1, Charsets.UTF_16BE)
      3 -> String(body, 1, body.size - 1, Charsets.UTF_8)
      else -> return null
    }
    // A UTF-16 list repeats the byte order mark before each value.
    val parts = raw.split('\u0000').map { it.trim('﻿', ' ') }.filter { it.isNotEmpty() }
    return clean(parts.joinToString(joiner))
  }

  private fun apic(body: ByteArray): RawPicture? {
    if (body.size < 4) return null
    val encoding = body[0].toInt() and 0xFF
    var position = skipText(body, 1, wide = false)
    if (position >= body.size) return null
    val type = body[position].toInt() and 0xFF
    position = skipText(body, position + 1, wide = encoding == 1 || encoding == 2)
    return if (position < body.size) RawPicture(type, body.copyOfRange(position, body.size)) else null
  }

  private fun pic(body: ByteArray): RawPicture? {
    if (body.size < 6) return null
    val position = skipText(body, 5, wide = (body[0].toInt() and 0xFF) == 1)
    return if (position < body.size) RawPicture(body[4].toInt() and 0xFF, body.copyOfRange(position, body.size)) else null
  }

  private fun skipText(data: ByteArray, from: Int, wide: Boolean): Int {
    var position = from
    if (wide) {
      while (position + 1 < data.size) {
        if (data[position].toInt() == 0 && data[position + 1].toInt() == 0) return position + 2
        position += 2
      }
    } else {
      while (position < data.size) {
        if (data[position].toInt() == 0) return position + 1
        position += 1
      }
    }
    return data.size
  }

  private fun resync(data: ByteArray): ByteArray {
    val out = java.io.ByteArrayOutputStream(data.size)
    var index = 0
    while (index < data.size) {
      out.write(data[index].toInt())
      index += if ((data[index].toInt() and 0xFF) == 0xFF && index + 1 < data.size && data[index + 1].toInt() == 0) 2 else 1
    }
    return out.toByteArray()
  }

  private fun id3v1(read: ReadAt, length: Long, values: TagValues) {
    if (length < 128) return
    val tag = read(length - 128, 128) ?: return
    if (String(tag, 0, 3, Charsets.ISO_8859_1) != "TAG") return
    values.title = values.title ?: legacyText(tag, 3, 30)
    values.artist = values.artist ?: legacyText(tag, 33, 30)
    values.album = values.album ?: legacyText(tag, 63, 30)
    values.year = values.year ?: yearOf(String(tag, 93, 4, Charsets.ISO_8859_1))
    if (tag[125].toInt() == 0 && tag[126].toInt() != 0) values.trackNumber = values.trackNumber ?: (tag[126].toInt() and 0xFF)
    val genre = tag[127].toInt() and 0xFF
    if (values.genre == null && genre < GENRES.size) values.genre = GENRES[genre]
  }

  // -------------------------------------------------------------------------

  private fun syncsafe(bytes: ByteArray, at: Int): Int =
    ((bytes[at].toInt() and 0x7F) shl 21) or ((bytes[at + 1].toInt() and 0x7F) shl 14) or
      ((bytes[at + 2].toInt() and 0x7F) shl 7) or (bytes[at + 3].toInt() and 0x7F)

  /** Old tags have no declared encoding: UTF-8 when it decodes cleanly, else Windows-1252. */
  private fun legacyDecode(bytes: ByteArray, start: Int, length: Int): String {
    val strict = Charsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
    return try {
      strict.decode(ByteBuffer.wrap(bytes, start, length)).toString()
    } catch (_: CharacterCodingException) {
      String(bytes, start, length, WINDOWS_1252)
    }
  }

  private fun legacyText(bytes: ByteArray, start: Int, length: Int): String? {
    var end = start
    while (end < start + length && bytes[end].toInt() != 0) end++
    return clean(legacyDecode(bytes, start, end - start))
  }

  private fun clean(text: String?): String? = text?.trim()?.takeIf { it.isNotEmpty() }

  private fun yearOf(text: String?): Int? = text?.let { Regex("(\\d{4})").find(it)?.value?.toInt() }?.takeIf { it in 1000..2999 }

  private fun numberOf(text: String?): Int? = text?.let { Regex("^\\s*(\\d+)").find(it)?.groupValues?.get(1)?.toIntOrNull() }?.takeIf { it > 0 }

  /** ID3 genres may be "(17)", "(17)Rock", "17" or plain text. */
  private fun genreName(text: String): String? {
    val match = Regex("^\\((\\d+)\\)(.*)$").find(text) ?: Regex("^(\\d+)$").find(text)
    if (match != null) {
      val rest = match.groupValues.getOrNull(2)?.trim().orEmpty()
      if (rest.isNotEmpty()) return rest
      return match.groupValues[1].toIntOrNull()?.let { GENRES.getOrNull(it) }
    }
    return clean(text)
  }

  private val WINDOWS_1252: Charset = runCatching { Charset.forName("windows-1252") }.getOrDefault(Charsets.ISO_8859_1)

  private val GENRES = arrayOf(
    "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal",
    "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial",
    "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk",
    "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise",
    "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic",
    "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta",
    "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychedelic", "Rave", "Showtunes",
    "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock",
  )
}
