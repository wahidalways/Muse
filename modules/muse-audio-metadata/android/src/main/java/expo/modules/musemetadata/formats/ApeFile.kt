// Monkey's Audio (APE) container parsing: descriptor, header and seek table.
// Ported from the Monkey's Audio SDK 13.46 (APEHeader.cpp, APEInfo.cpp).
// Copyright 2000-2026 Matthew T. Ashland. All rights reserved.
// Used under the 3-clause BSD license (see THIRD_PARTY_NOTICES).
package expo.modules.musemetadata.formats

class ApeInfo(
  val stream: StreamInfo,
  /** Encoder file version x1000, e.g. 3990. */
  val fileVersion: Int,
  /** 1000 (fast) .. 5000 (insane). */
  val compressionLevel: Int,
  val blocksPerFrame: Int,
  val finalFrameBlocks: Int,
  val frameCount: Int,
  /** Absolute file position of each frame's first byte. */
  internal val seekTable: LongArray,
  /** Absolute position just past the last frame's data (tags and trailing WAV data excluded). */
  internal val dataEnd: Long,
  internal val fileLength: Long,
)

object ApeFile {
  private const val FLAG_8_BIT = 1 shl 0
  private const val FLAG_HAS_PEAK_LEVEL = 1 shl 2
  private const val FLAG_24_BIT = 1 shl 3
  private const val FLAG_HAS_SEEK_ELEMENTS = 1 shl 4
  private const val FLAG_CREATE_WAV_HEADER = 1 shl 5
  private const val FLAG_FLOATING_POINT = 1 shl 12

  /** Oldest file version decoded (the SDK's own modern decode path starts here too). */
  const val MIN_VERSION = 3930

  fun parse(read: ReadAt, fileLength: Long): ApeInfo {
    val junk = findDescriptor(read, fileLength)
    val common = bytes(read, junk, 6)
    val version = u16(common, 4)
    if (version < MIN_VERSION) throw FormatException("APE file version $version is too old (needs ${MIN_VERSION}+)")

    val level: Int
    val flags: Int
    val blocksPerFrame: Int
    val finalFrameBlocks: Long
    val totalFrames: Long
    val bits: Int
    val channels: Int
    val sampleRate: Int
    val seekElements: Long
    val seekPos: Long
    var dataEnd: Long

    if (version >= 3980) {
      val d = bytes(read, junk, 52)
      val descriptorBytes = u32(d, 8)
      val headerBytes = u32(d, 12)
      val seekTableBytes = u32(d, 16)
      val headerDataBytes = u32(d, 20)
      val frameDataBytes = u32(d, 24) or (u32(d, 28) shl 32)
      val h = bytes(read, junk + descriptorBytes, 24)
      level = u16(h, 0)
      flags = u16(h, 2)
      blocksPerFrame = clampInt(u32(h, 4))
      finalFrameBlocks = u32(h, 8)
      totalFrames = u32(h, 12)
      bits = u16(h, 16)
      channels = u16(h, 18)
      sampleRate = clampInt(u32(h, 20))
      seekElements = seekTableBytes / 4
      seekPos = junk + descriptorBytes + headerBytes
      dataEnd = seekPos + seekTableBytes + headerDataBytes + frameDataBytes
    } else {
      val h = bytes(read, junk, 32)
      level = u16(h, 6)
      flags = u16(h, 8)
      channels = u16(h, 10)
      sampleRate = clampInt(u32(h, 12))
      val wavHeaderBytes = u32(h, 16)
      val terminatingBytes = u32(h, 20)
      totalFrames = u32(h, 24)
      finalFrameBlocks = u32(h, 28)
      var pos = junk + 32
      if (flags and FLAG_HAS_PEAK_LEVEL != 0) pos += 4
      if (flags and FLAG_HAS_SEEK_ELEMENTS != 0) {
        seekElements = u32(bytes(read, pos, 4), 0)
        pos += 4
      } else {
        seekElements = totalFrames
      }
      if (flags and FLAG_CREATE_WAV_HEADER == 0) pos += wavHeaderBytes
      seekPos = pos
      blocksPerFrame = if (version >= 3950) 73728 * 4 else 73728
      bits = if (flags and FLAG_8_BIT != 0) 8 else if (flags and FLAG_24_BIT != 0) 24 else 16
      // old headers do not store the data length: frames run to the trailing WAV data and tags
      dataEnd = fileLength - terminatingBytes - trailingTagBytes(read, fileLength)
    }

    if (totalFrames <= 0 || totalFrames > Int.MAX_VALUE) throw FormatException("APE: bad frame count $totalFrames")
    if (channels < 1 || channels > 32) throw FormatException("APE: bad channel count $channels")
    if (bits != 8 && bits != 16 && bits != 24 && bits != 32) throw FormatException("APE: unsupported bit depth $bits")
    if (sampleRate <= 0) throw FormatException("APE: bad sample rate")
    if (level !in intArrayOf(1000, 2000, 3000, 4000, 5000)) throw FormatException("APE: unknown compression level $level")
    val maxBlocks = if (level >= 5000) 10_000_000 else 1_000_000
    if (blocksPerFrame <= 0 || blocksPerFrame > maxBlocks) throw FormatException("APE: bad blocks per frame")
    if (finalFrameBlocks <= 0 || finalFrameBlocks > blocksPerFrame) throw FormatException("APE: bad final frame size")
    // the decoder holds one whole frame; real encoders top out at 1179648 blocks (insane)
    if (blocksPerFrame.toLong() * channels > 1179648L * 8) throw FormatException("APE: frames too large to decode")
    if (seekElements < totalFrames || seekElements * 4 > fileLength) throw FormatException("APE: seek table too short")

    val frames = totalFrames.toInt()
    val raw = bytes(read, seekPos, frames * 4)
    val seek = LongArray(frames)
    // 32-bit entries wrap past 4 GB; add 2^32 each time one goes backwards (as the SDK does)
    var add = 0L
    var previous = 0L
    for (i in 0 until frames) {
      val current = u32(raw, i * 4)
      if (current < previous) add += 1L shl 32
      seek[i] = junk + add + current
      previous = current
      // entries past the end are allowed: a cut file still plays up to where it stops
      if (i > 0 && seek[i] < seek[i - 1]) throw FormatException("APE: bad seek table entry $i")
    }
    dataEnd = minOf(dataEnd, fileLength)
    if (dataEnd <= seek[frames - 1]) dataEnd = fileLength // header lied about the data size

    val total = (totalFrames - 1) * blocksPerFrame + finalFrameBlocks
    val isFloat = flags and FLAG_FLOATING_POINT != 0 && bits == 32
    return ApeInfo(
      StreamInfo(sampleRate, channels, bits, isFloat, total),
      version, level, blocksPerFrame, finalFrameBlocks.toInt(), frames, seek, dataEnd, fileLength,
    )
  }

  /** Starts 0..3 bytes early: the bitstream is read as 32-bit words aligned to the first frame. */
  fun frameStart(info: ApeInfo, index: Int): Long = info.seekTable[index] - alignSkip(info, index)

  /** Includes 4 bytes of the next frame, which the range decoder may look ahead into (SDK does the same). */
  fun frameLength(info: ApeInfo, index: Int): Int {
    val start = frameStart(info, index)
    val end = if (index + 1 < info.frameCount) minOf(info.seekTable[index + 1] + 4, info.fileLength) else info.dataEnd
    return maxOf(0L, end - start).toInt()
  }

  fun frameBlocks(info: ApeInfo, index: Int): Int =
    if (index == info.frameCount - 1) info.finalFrameBlocks else info.blocksPerFrame

  internal fun alignSkip(info: ApeInfo, index: Int): Int = ((info.seekTable[index] - info.seekTable[0]) and 3).toInt()

  /** Skips a leading ID3v2 tag, then scans up to 1 MB for "MAC " / "MACF". */
  private fun findDescriptor(read: ReadAt, fileLength: Long): Long {
    var start = 0L
    val head = read(0, 10)
    if (head != null && head.size >= 10 && head[0] == 'I'.code.toByte() && head[1] == 'D'.code.toByte() && head[2] == '3'.code.toByte()) {
      val size = ((head[6].toInt() and 127) shl 21) or ((head[7].toInt() and 127) shl 14) or
        ((head[8].toInt() and 127) shl 7) or (head[9].toInt() and 127)
      start = size + if (head[5].toInt() and 16 != 0) 20L else 10L
    }
    val limit = minOf(fileLength, start + 1024 * 1024 + 4)
    var pos = start
    while (pos + 4 <= limit) {
      val chunk = read(pos, minOf(65536L, limit - pos).toInt()) ?: break
      if (chunk.size < 4) break
      for (i in 0..chunk.size - 4) {
        if (chunk[i] == 'M'.code.toByte() && chunk[i + 1] == 'A'.code.toByte() && chunk[i + 2] == 'C'.code.toByte() &&
          (chunk[i + 3] == ' '.code.toByte() || chunk[i + 3] == 'F'.code.toByte())) return pos + i
      }
      pos += chunk.size - 3
    }
    throw FormatException("Not a Monkey's Audio file")
  }

  /** ID3v1 and APEv2 tags at the end of the file. */
  private fun trailingTagBytes(read: ReadAt, fileLength: Long): Long {
    var bytes = 0L
    if (fileLength > 128) {
      val t = read(fileLength - 128, 3)
      if (t != null && t.size == 3 && t[0] == 'T'.code.toByte() && t[1] == 'A'.code.toByte() && t[2] == 'G'.code.toByte()) bytes = 128
    }
    if (fileLength - bytes > 32) {
      val f = read(fileLength - bytes - 32, 32)
      if (f != null && f.size == 32 && String(f, 0, 8, Charsets.ISO_8859_1) == "APETAGEX") {
        bytes += u32(f, 12) + if (u32(f, 20) and 0x80000000L != 0L) 32 else 0
      }
    }
    return bytes
  }

  private fun bytes(read: ReadAt, pos: Long, length: Int): ByteArray {
    val b = read(pos, length)
    if (b == null || b.size < length) throw FormatException("APE: file is truncated")
    return b
  }

  private fun u16(b: ByteArray, o: Int) = (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8)
  private fun u32(b: ByteArray, o: Int) = (u16(b, o) or (u16(b, o + 2) shl 16)).toLong() and 0xFFFFFFFFL
  private fun clampInt(v: Long) = if (v > Int.MAX_VALUE) Int.MAX_VALUE else v.toInt()
}
