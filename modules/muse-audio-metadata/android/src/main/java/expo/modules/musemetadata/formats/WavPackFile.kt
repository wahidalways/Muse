package expo.modules.musemetadata.formats

// WavPack 4.x/5.x block framing and stream info.
// Ported from libwavpack (https://github.com/dbry/WavPack: open_utils.c, wavpack.h),
// Copyright (c) 1998 - 2025 David Bryant. All rights reserved.
// Distributed under the BSD 3-clause license (see THIRD_PARTY_NOTICES).

/** The fixed 32-byte header in front of every WavPack block. */
class WavPackHeader(
  /** Total bytes of this block INCLUDING the 32-byte header. */
  val blockSize: Int,
  val version: Int,
  /** -1 if unknown. */
  val totalSamples: Long,
  /** First sample frame of this block. */
  val blockIndex: Long,
  /** 0 for metadata-only blocks. */
  val blockSamples: Int,
  val flags: Int,
  /** First block of a frame. */
  val isInitial: Boolean,
  /** Last block of a frame. */
  val isFinal: Boolean,
  /** From the flags table; 0 when the rate is custom (ID_SAMPLE_RATE, resolved in readInfo). */
  val sampleRate: Int,
  /** CRC of the decoded samples of this block. */
  val crc: Int,
)

class WavPackInfo(
  val stream: StreamInfo,
  val firstBlockOffset: Long,
  /** blockIndex of the first audio block (non-zero for split files); totalFrames counts from here. */
  val firstBlockIndex: Long,
)

object WavPackFile {
  internal const val MONO_FLAG = 4
  internal const val HYBRID_FLAG = 8
  internal const val JOINT_STEREO = 0x10
  internal const val HYBRID_BITRATE = 0x200
  internal const val HYBRID_BALANCE = 0x400
  internal const val FLOAT_DATA = 0x80
  internal const val INT32_DATA = 0x100
  internal const val INITIAL_BLOCK = 0x800
  internal const val FINAL_BLOCK = 0x1000
  internal const val FALSE_STEREO = 0x40000000
  internal const val MONO_DATA = MONO_FLAG or FALSE_STEREO
  internal const val HAS_CHECKSUM = 0x10000000
  internal const val DSD_FLAG = Int.MIN_VALUE // 0x80000000

  internal const val ID_LARGE = 0x80
  internal const val ID_ODD_SIZE = 0x40
  internal const val ID_OPTIONAL_DATA = 0x20
  internal const val ID_UNIQUE = 0x3f
  internal const val ID_CHANNEL_INFO = 0xd
  internal const val ID_DSD_BLOCK = 0xe
  internal const val ID_SAMPLE_RATE = 0x27
  internal const val ID_BLOCK_CHECKSUM = 0x2f

  private val SAMPLE_RATES = intArrayOf(
    6000, 8000, 9600, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 64000, 88200, 96000, 192000,
  )

  private fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xff
  internal fun le32(b: ByteArray, i: Int) = u8(b, i) or (u8(b, i + 1) shl 8) or (u8(b, i + 2) shl 16) or (u8(b, i + 3) shl 24)

  /** Parses a block header at bytes[offset]; null unless it is a plausible "wvpk" header. */
  fun parseHeader(bytes: ByteArray, offset: Int): WavPackHeader? {
    if (offset < 0 || offset + 32 > bytes.size) return null
    val b = offset
    // Same plausibility test as libwavpack's read_next_header().
    if (bytes[b] != 'w'.code.toByte() || bytes[b + 1] != 'v'.code.toByte() ||
      bytes[b + 2] != 'p'.code.toByte() || bytes[b + 3] != 'k'.code.toByte()
    ) return null
    if (u8(bytes, b + 4) and 1 != 0 || u8(bytes, b + 6) >= 16 || u8(bytes, b + 7) != 0) return null
    if (u8(bytes, b + 6) == 0 && u8(bytes, b + 5) == 0 && u8(bytes, b + 4) < 24) return null
    if (u8(bytes, b + 9) != 4 || u8(bytes, b + 8) < 2 || u8(bytes, b + 8) > 0x10) return null
    if (u8(bytes, b + 22) >= 3 || u8(bytes, b + 23) != 0) return null

    val ckSize = le32(bytes, b + 4)
    val totalLo = le32(bytes, b + 12).toLong() and 0xffffffffL
    val totalHi = u8(bytes, b + 11).toLong()
    val flags = le32(bytes, b + 24)
    val rateIndex = (flags ushr 23) and 0xf
    return WavPackHeader(
      blockSize = ckSize + 8,
      version = u8(bytes, b + 8) or (u8(bytes, b + 9) shl 8),
      // all 1s in the low 32 bits means unknown; the odd "- hi" is libwavpack's GET_TOTAL_SAMPLES
      totalSamples = if (totalLo == 0xffffffffL) -1 else totalLo + (totalHi shl 32) - totalHi,
      blockIndex = (le32(bytes, b + 16).toLong() and 0xffffffffL) + (u8(bytes, b + 10).toLong() shl 32),
      blockSamples = le32(bytes, b + 20),
      flags = flags,
      isInitial = flags and INITIAL_BLOCK != 0,
      isFinal = flags and FINAL_BLOCK != 0,
      sampleRate = if (rateIndex < SAMPLE_RATES.size) SAMPLE_RATES[rateIndex] else 0,
      crc = le32(bytes, b + 28),
    )
  }

  /** Index of the first plausible block header in bytes[from until to - 32], or -1 (for resync after a seek). */
  fun findHeader(bytes: ByteArray, from: Int, to: Int): Int {
    val end = minOf(to, bytes.size) - 32
    for (i in maxOf(from, 0)..end) {
      if (bytes[i] == 'w'.code.toByte() && parseHeader(bytes, i) != null) return i
    }
    return -1
  }

  /**
   * Checks the metadata layout of a whole block and, when present, its WavPack 5
   * ID_BLOCK_CHECKSUM (port of WavpackVerifySingleBlock). bytes[off] is the header.
   */
  internal fun verifyBlock(bytes: ByteArray, off: Int, blockSize: Int, flags: Int): Boolean {
    var dp = off + 32
    var bcount = blockSize - 32
    var passed = false
    while (bcount >= 2) {
      val id = u8(bytes, dp)
      var metaBc = u8(bytes, dp + 1) shl 1
      dp += 2; bcount -= 2
      if (id and ID_LARGE != 0) {
        if (bcount < 2) return false
        metaBc += (u8(bytes, dp) shl 9) + (u8(bytes, dp + 1) shl 17)
        dp += 2; bcount -= 2
      }
      if (bcount < metaBc) return false
      if (id and ID_UNIQUE == ID_BLOCK_CHECKSUM) {
        if (id and ID_ODD_SIZE != 0 || metaBc < 2 || metaBc > 4) return false
        // 16-bit little-endian words from the block start up to this metadata's id byte
        var csum = -1
        var p = off
        val stop = off + ((dp - 2 - off) shr 1) * 2
        while (p < stop) {
          csum = csum * 3 + (u8(bytes, p) or (u8(bytes, p + 1) shl 8))
          p += 2
        }
        if (metaBc == 4) {
          if (le32(bytes, dp) != csum) return false
        } else {
          csum = csum xor (csum ushr 16)
          if (u8(bytes, dp) != csum and 0xff || u8(bytes, dp + 1) != (csum ushr 8) and 0xff) return false
        }
        passed = true
      }
      bcount -= metaBc
      dp += metaBc
    }
    return bcount == 0 && (flags and HAS_CHECKSUM == 0 || passed)
  }

  /** Reads the first frame to learn the stream: rate (incl. non-standard rates), channels, bits, float, mask, total samples. */
  fun readInfo(read: ReadAt, fileLength: Long): WavPackInfo {
    val head = read(0, 4) ?: throw FormatException("Empty file")
    if (head.size >= 4 && head[0] == 'R'.code.toByte() && head[1] == 'I'.code.toByte() &&
      head[2] == 'F'.code.toByte() && head[3] == 'F'.code.toByte()
    ) throw FormatException("WavPack before 4.0 is not supported")

    var pos = scanForward(read, fileLength, 0) ?: throw FormatException("No WavPack block found")
    var hdr: WavPackHeader
    var block: ByteArray
    var channels = 0
    var mask = 0
    var customRate = 0
    var skipped = 0
    while (true) {
      val h = read(pos, 32) ?: throw FormatException("Truncated WavPack file")
      hdr = parseHeader(h, 0) ?: throw FormatException("Bad WavPack header")
      block = read(pos, hdr.blockSize)?.takeIf { it.size >= hdr.blockSize } ?: throw FormatException("Truncated WavPack block")
      if (!verifyBlock(block, 0, hdr.blockSize, hdr.flags)) throw FormatException("Corrupt WavPack block")
      // Non-audio blocks may still carry stream metadata (libwavpack runs unpack_init on them too).
      var p = 32
      while (p + 2 <= hdr.blockSize) {
        var id = u8(block, p)
        var len = u8(block, p + 1) shl 1
        p += 2
        if (id and ID_LARGE != 0) {
          len += (u8(block, p) shl 9) + (u8(block, p + 1) shl 17); p += 2; id = id and ID_LARGE.inv()
        }
        val padded = len
        if (id and ID_ODD_SIZE != 0) { id = id and ID_ODD_SIZE.inv(); len-- }
        when (id) {
          ID_CHANNEL_INFO -> if (channels == 0) {
            val r = readChannelInfo(block, p, len)
            channels = (r ushr 32).toInt(); mask = r.toInt()
          }
          ID_SAMPLE_RATE -> if (len == 3 || len == 4) {
            customRate = u8(block, p) or (u8(block, p + 1) shl 8) or (u8(block, p + 2) shl 16)
            if (len == 4) customRate = customRate or ((u8(block, p + 3) and 0x7f) shl 24)
          }
          ID_DSD_BLOCK -> throw FormatException("DSD WavPack")
        }
        p += padded
      }
      if (hdr.flags and DSD_FLAG != 0) throw FormatException("DSD WavPack")
      if (hdr.blockSamples != 0) break
      if (++skipped > 16) throw FormatException("No WavPack audio block found")
      pos += hdr.blockSize
    }
    if (!hdr.isInitial) throw FormatException("First WavPack block is not an initial block")

    if (channels == 0) {
      channels = if (hdr.flags and MONO_FLAG != 0) 1 else 2
      mask = 0x5 - channels
    }
    val rate = when {
      customRate != 0 -> customRate
      hdr.sampleRate != 0 -> hdr.sampleRate
      else -> 44100
    }
    var total = -1L
    if (hdr.blockIndex == 0L && hdr.totalSamples != -1L) total = hdr.totalSamples
    else {
      val last = lastAudioBlockEnd(read, fileLength, pos)
      if (last >= 0) total = last - hdr.blockIndex
    }
    val stream = StreamInfo(
      sampleRate = rate,
      channels = channels,
      bitsPerSample = ((hdr.flags and 3) + 1) * 8,
      isFloat = hdr.flags and FLOAT_DATA != 0,
      totalFrames = total,
      channelMask = mask,
    )
    return WavPackInfo(stream, pos, hdr.blockIndex)
  }

  /** Port of read_channel_info(): returns (channels shl 32) or mask; throws on bad data. */
  private fun readChannelInfo(b: ByteArray, p: Int, len: Int): Long {
    if (len == 0 || len > 7) throw FormatException("Bad WavPack channel info")
    val channels: Int
    val maxStreams: Int
    var mask = 0
    if (len >= 6) {
      channels = (u8(b, p) or ((u8(b, p + 2) and 0xf) shl 8)) + 1
      maxStreams = (u8(b, p + 1) or ((u8(b, p + 2) and 0xf0) shl 4)) + 1
      if (channels < maxStreams) throw FormatException("Bad WavPack channel info")
      mask = u8(b, p + 3) or (u8(b, p + 4) shl 8) or (u8(b, p + 5) shl 16)
      if (len == 7) mask = mask or (u8(b, p + 6) shl 24)
    } else {
      channels = u8(b, p)
      for (i in 1 until len) mask = mask or (u8(b, p + i) shl ((i - 1) * 8))
      // old layout allowed 8 streams; ffmpeg 6.1 writes more channels in it (libwavpack accepts that)
      maxStreams = if (channels > 8) channels else 8
    }
    if (channels == 0 || channels > maxStreams * 2) throw FormatException("Bad WavPack channel info")
    if (Integer.bitCount(mask) > channels) throw FormatException("Bad WavPack channel info")
    return (channels.toLong() shl 32) or (mask.toLong() and 0xffffffffL)
  }

  private const val WINDOW = 65536

  /** Offset of the first header at or after [from], scanning at most 1 MB like libwavpack. */
  private fun scanForward(read: ReadAt, fileLength: Long, from: Long): Long? {
    var pos = from
    while (pos < fileLength && pos - from <= 1024 * 1024) {
      // ReadAt gives nothing past the end, so a short file is read only as far as it goes.
      val buf = read(pos, minOf((WINDOW + 32).toLong(), fileLength - pos).toInt()) ?: return null
      val i = findHeader(buf, 0, buf.size)
      if (i >= 0) return pos + i
      if (buf.size < WINDOW + 32) return null
      pos += WINDOW
    }
    return null
  }

  /**
   * End sample (blockIndex + blockSamples) of the last audio block, found by hopping
   * block to block through the file's last megabyte; -1 if none.
   * shortcut: assumes the last block starts in the final 1 MB; scan the whole file if huge blocks ever appear.
   */
  private fun lastAudioBlockEnd(read: ReadAt, fileLength: Long, firstPos: Long): Long {
    val start = maxOf(firstPos, fileLength - 1024 * 1024)
    val buf = read(start, (fileLength - start).toInt()) ?: return -1
    var end = -1L
    var i = findHeader(buf, 0, buf.size)
    while (i >= 0) {
      val h = parseHeader(buf, i)!!
      if (i + h.blockSize > buf.size) break
      if (h.blockSamples > 0) end = h.blockIndex + h.blockSamples
      i = if (parseHeader(buf, i + h.blockSize) != null) i + h.blockSize else findHeader(buf, i + 1, buf.size)
    }
    return end
  }
}
