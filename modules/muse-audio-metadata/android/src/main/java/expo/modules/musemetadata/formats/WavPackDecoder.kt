package expo.modules.musemetadata.formats

import expo.modules.musemetadata.formats.WavPackFile.FALSE_STEREO
import expo.modules.musemetadata.formats.WavPackFile.FLOAT_DATA
import expo.modules.musemetadata.formats.WavPackFile.HYBRID_BALANCE
import expo.modules.musemetadata.formats.WavPackFile.HYBRID_BITRATE
import expo.modules.musemetadata.formats.WavPackFile.HYBRID_FLAG
import expo.modules.musemetadata.formats.WavPackFile.INT32_DATA
import expo.modules.musemetadata.formats.WavPackFile.JOINT_STEREO
import expo.modules.musemetadata.formats.WavPackFile.MONO_DATA
import expo.modules.musemetadata.formats.WavPackFile.MONO_FLAG

// WavPack 4.x/5.x audio decoder (lossless and hybrid lossy; no .wvc correction, no DSD).
// Ported from libwavpack (https://github.com/dbry/WavPack: unpack.c, unpack_utils.c,
// read_words.c, entropy_utils.c, decorr_utils.c, unpack_floats.c, open_utils.c),
// Copyright (c) 1998 - 2025 David Bryant. All rights reserved.
// Distributed under the BSD 3-clause license (see THIRD_PARTY_NOTICES).

/** LSB-first bit reader over a byte range (libwavpack's Bitstream, 64-bit refill). */
private class WvBits {
  var buf = ByteArray(0)
  var pos = 0
  var end = 0
  var sr = 0L // pending bits, LSB first; bits above bc are always 0
  var bc = 0
  var open = false

  fun open(b: ByteArray, from: Int, to: Int) {
    buf = b; pos = from; end = to; sr = 0; bc = 0; open = true
  }

  /** Tops up to at least 57 bits. Past the end it feeds zeros; damage then shows up as a CRC error. */
  fun fill() {
    while (bc <= 56) {
      if (pos < end) sr = sr or ((buf[pos].toLong() and 0xff) shl bc)
      pos++
      bc += 8
    }
  }

  fun bit(): Int {
    if (bc == 0) fill()
    val b = (sr and 1).toInt()
    sr = sr ushr 1
    bc--
    return b
  }

  /** n in 1..32; returns the low n bits (unsigned). */
  fun bits(n: Int): Int {
    if (bc < n) fill()
    val v = (sr and ((1L shl n) - 1)).toInt()
    sr = sr ushr n
    bc -= n
    return v
  }

  fun skip(n: Int) {
    sr = sr ushr n
    bc -= n
  }
}

class WavPackDecoder(val info: WavPackInfo) {
  private val channels = info.stream.channels
  private var out = IntArray(0)
  private var tmp = IntArray(0)

  // ---- per-block state (unpack_init clears all of it) ----
  private var flags = 0
  private var numTerms = 0
  private val term = IntArray(MAX_NTERMS)
  private val delta = IntArray(MAX_NTERMS)
  private val weightA = IntArray(MAX_NTERMS)
  private val weightB = IntArray(MAX_NTERMS)
  private val samplesA = IntArray(MAX_NTERMS * MAX_TERM)
  private val samplesB = IntArray(MAX_NTERMS * MAX_TERM)

  private val median = IntArray(6) // [chan * 3 + n], unsigned
  private val slowLevel = IntArray(2)
  private val errorLimit = IntArray(2)
  private val bitrateAcc = IntArray(2)
  private val bitrateDelta = IntArray(2)
  private var holdingZero = 0
  private var holdingOne = 0
  private var zerosAcc = 0
  private var eof = false

  private var int32SentBits = 0
  private var int32Zeros = 0
  private var int32Ones = 0
  private var int32Dups = 0
  private var int32MaxWidth = 0
  private var floatFlags = 0
  private var floatShift = 0
  private var floatMaxExp = 0
  private var floatMinShiftedZeros = 0
  private var floatMaxShiftedOnes = 0
  private var crcX = 0
  private var crcWvx = 0

  private val wv = WvBits()
  private val wvx = WvBits()

  /**
   * Decodes one frame: bytes[0 until length] are all blocks from an initial block through its final block.
   * Returns interleaved samples (frames = blockSamples), sign-extended at stream.bitsPerSample, or float
   * bits for float streams. The result is overwritten by the next call. A metadata-only block gives 0 frames.
   */
  fun decodeFrame(bytes: ByteArray, length: Int): PcmBlock {
    var off = 0
    var channel = 0
    var frames = -1
    var index = 0L
    while (true) {
      val h = WavPackFile.parseHeader(bytes, off) ?: throw FormatException("Bad WavPack block header")
      if (off + h.blockSize > length) throw FormatException("Truncated WavPack frame")
      if (frames == -1) {
        if (h.blockSamples == 0) return PcmBlock(out, 0)
        if (!h.isInitial) throw FormatException("WavPack frame does not start with an initial block")
        frames = h.blockSamples
        index = h.blockIndex
        val need = frames * channels
        if (out.size < need) out = IntArray(need)
        if (tmp.size < frames * 2) tmp = IntArray(frames * 2)
      } else if (h.blockSamples != frames || h.blockIndex != index) {
        throw FormatException("WavPack blocks of one frame disagree")
      }
      if (h.flags and WavPackFile.DSD_FLAG != 0) throw FormatException("DSD WavPack")
      val mono = h.flags and MONO_FLAG != 0
      if (!mono && channels == 1) throw FormatException("Stereo WavPack block in a mono stream")
      if (channel >= channels) throw FormatException("WavPack frame has too many channels")

      unpackBlock(bytes, off, h, tmp)

      // unpack_samples_interleave(): spread this block's 1 or 2 channels into the frame
      val src = tmp
      var d = channel
      if (mono) {
        for (i in 0 until frames) { out[d] = src[i]; d += channels }
        channel++
      } else if (channel == channels - 1) {
        throw FormatException("WavPack stereo block does not fit the channel count")
      } else {
        var s = 0
        for (i in 0 until frames) { out[d] = src[s]; out[d + 1] = src[s + 1]; s += 2; d += channels }
        channel += 2
      }
      off += h.blockSize
      if (h.isFinal || channel == channels) break
      if (off >= length) throw FormatException("WavPack frame has no final block")
    }
    if (channel != channels) throw FormatException("WavPack frame has $channel of $channels channels")
    return PcmBlock(out, frames)
  }

  // ---------------------------------------------------------------- block

  /** unpack_init() + unpack_samples() for one whole block; buf gets 1 or 2 interleaved channels. */
  private fun unpackBlock(bytes: ByteArray, off: Int, h: WavPackHeader, buf: IntArray) {
    if (!WavPackFile.verifyBlock(bytes, off, h.blockSize, h.flags)) throw FormatException("WavPack block checksum mismatch")
    flags = h.flags
    readMetadata(bytes, off, h)
    if (!wv.open) throw FormatException("WavPack block has no audio bitstream")

    val count = h.blockSamples
    val monoData = flags and MONO_DATA != 0
    val hybrid = flags and HYBRID_FLAG != 0
    val mag = (flags ushr 18) and 0x1f
    var muteLimit = (1 shl mag) + 2 // int32 wrap at mag 31, as in C
    if (hybrid) muteLimit = muteLimit * 3 + 128
    val limit = muteLimit.toLong()
    var crc = -1

    if (monoData) {
      for (i in 0 until count) buf[i] = getWord(0, hybrid)
      if (eof) throw FormatException("WavPack bitstream ended early")
      for (t in 0 until numTerms) decorrMono(t, buf, count)
      for (i in 0 until count) {
        val s = buf[i]
        if (Math.abs(s.toLong()) > limit) throw FormatException("WavPack sample out of range")
        crc = crc * 3 + s
      }
    } else {
      val n = count * 2
      var i = 0
      while (i < n) {
        buf[i] = getWord(0, hybrid)
        buf[i + 1] = getWord(1, hybrid)
        i += 2
      }
      if (eof) throw FormatException("WavPack bitstream ended early")
      for (t in 0 until numTerms) decorrStereo(t, buf, count)
      val joint = flags and JOINT_STEREO != 0
      i = 0
      while (i < n) {
        if (joint) {
          val r = buf[i + 1] - (buf[i] shr 1)
          buf[i + 1] = r
          buf[i] += r
        }
        crc = crc * 9 + buf[i] * 3 + buf[i + 1]
        i += 2
      }
      // libwavpack only spot-checks every 8th stereo frame
      i = 0
      while (i < n) {
        if (Math.abs(buf[i].toLong()) > limit || Math.abs(buf[i + 1].toLong()) > limit) {
          throw FormatException("WavPack sample out of range")
        }
        i += 16
      }
    }

    fixupSamples(buf, if (monoData) count else count * 2)

    if (flags and FALSE_STEREO != 0) {
      var i = count
      while (i-- > 0) { buf[i * 2 + 1] = buf[i]; buf[i * 2] = buf[i] }
    }
    if (crc != h.crc || (wvx.open && crcX != crcWvx)) throw FormatException("WavPack CRC mismatch")
  }

  // ---------------------------------------------------------------- metadata

  private fun readMetadata(b: ByteArray, off: Int, h: WavPackHeader) {
    numTerms = 0
    java.util.Arrays.fill(term, 0); java.util.Arrays.fill(delta, 0)
    java.util.Arrays.fill(weightA, 0); java.util.Arrays.fill(weightB, 0)
    java.util.Arrays.fill(samplesA, 0); java.util.Arrays.fill(samplesB, 0)
    java.util.Arrays.fill(median, 0); java.util.Arrays.fill(slowLevel, 0); java.util.Arrays.fill(errorLimit, 0)
    java.util.Arrays.fill(bitrateAcc, 0); java.util.Arrays.fill(bitrateDelta, 0)
    holdingZero = 0; holdingOne = 0; zerosAcc = 0; eof = false
    int32SentBits = 0; int32Zeros = 0; int32Ones = 0; int32Dups = 0; int32MaxWidth = 0
    floatFlags = 0; floatShift = 0; floatMaxExp = 0; floatMinShiftedZeros = 0; floatMaxShiftedOnes = 0
    crcX = -1; crcWvx = 0
    wv.open = false; wvx.open = false

    val monoData = flags and MONO_DATA != 0
    val end = off + h.blockSize
    var p = off + 32
    while (end - p >= 2) {
      var id = b[p].toInt() and 0xff
      var len = (b[p + 1].toInt() and 0xff) shl 1
      p += 2
      if (id and WavPackFile.ID_LARGE != 0) {
        id = id and WavPackFile.ID_LARGE.inv()
        if (end - p < 2) bad()
        len += ((b[p].toInt() and 0xff) shl 9) + ((b[p + 1].toInt() and 0xff) shl 17)
        p += 2
      }
      if (id and WavPackFile.ID_ODD_SIZE != 0) {
        if (len == 0) bad()
        id = id and WavPackFile.ID_ODD_SIZE.inv()
        len--
      }
      if (end - p < len + (len and 1)) bad()
      when (id) {
        0x0 -> {} // ID_DUMMY
        0x2 -> readTerms(b, p, len, monoData)
        0x3 -> readWeights(b, p, len, monoData)
        0x4 -> readDecorrSamples(b, p, len, monoData, h.version)
        0x5 -> { // ID_ENTROPY_VARS
          if (len != (if (monoData) 6 else 12)) bad()
          for (k in 0 until len / 2) median[k] = exp2s(le16(b, p + k * 2))
        }
        0x6 -> readHybridProfile(b, p, len, monoData)
        0x7 -> if (len != 2 && len < (if (monoData) 4 else 8)) bad() // shaping: only used with .wvc
        0x8 -> { // ID_FLOAT_INFO
          if (len != 4) bad()
          floatFlags = b[p].toInt() and 0xff; floatShift = b[p + 1].toInt() and 0xff
          floatMaxExp = b[p + 2].toInt() and 0xff
        }
        0x9 -> { // ID_INT32_INFO
          if (len != 4) bad()
          int32SentBits = b[p].toInt() and 0xff; int32Zeros = b[p + 1].toInt() and 0xff
          int32Ones = b[p + 2].toInt() and 0xff; int32Dups = b[p + 3].toInt() and 0xff
        }
        0xa -> { if (len == 0 || len and 1 != 0) bad(); wv.open(b, p, p + len) }
        0xb -> {} // ID_WVC_BITSTREAM: correction data, not used for lossy playback
        0xc, 0x2c -> { // ID_WVX_BITSTREAM / ID_WVX_NEW_BITSTREAM
          if (len <= 4 || len and 1 != 0) bad()
          crcWvx = WavPackFile.le32(b, p)
          wvx.open(b, p + 4, p + len)
          if (id == 0x2c) {
            if (flags and FLOAT_DATA != 0) {
              floatMinShiftedZeros = wvx.bits(5); floatMaxShiftedOnes = wvx.bits(5)
            } else int32MaxWidth = wvx.bits(5)
          }
        }
        0xd -> if (len == 0 || len > 7) bad() // channel info: read once in readInfo
        0xe -> throw FormatException("DSD WavPack")
        0x2b -> { if (len == 0) bad(); for (k in 0 until len) if (b[p + k].toInt() == 0) bad() }
        else -> if (id and WavPackFile.ID_OPTIONAL_DATA == 0) bad()
      }
      p += len + (len and 1)
    }
  }

  private fun bad(): Nothing = throw FormatException("Bad WavPack metadata")

  private fun le16(b: ByteArray, p: Int) = (b[p].toInt() and 0xff) or ((b[p + 1].toInt() and 0xff) shl 8)

  /** Signed 16-bit log value -> exp2s, used for stored decorrelation samples. */
  private fun exp2sSigned(b: ByteArray, p: Int) = exp2s(le16(b, p).toShort().toInt())

  private fun readTerms(b: ByteArray, p: Int, len: Int, monoData: Boolean) {
    if (len > MAX_NTERMS) bad()
    numTerms = len
    // stored in the opposite order of the passes
    for (k in 0 until len) {
      val v = b[p + k].toInt() and 0xff
      val t = (v and 0x1f) - 5
      val i = len - 1 - k
      term[i] = t
      delta[i] = (v shr 5) and 7
      if (t == 0 || t < -3 || (t > MAX_TERM && t < 17) || t > 18 || (monoData && t < 0)) bad()
    }
  }

  private fun readWeights(b: ByteArray, p: Int, len: Int, monoData: Boolean) {
    val count = if (monoData) len else len / 2
    if (count > numTerms) bad()
    var q = p
    for (k in 0 until count) {
      val i = numTerms - 1 - k
      weightA[i] = restoreWeight(b[q++].toInt())
      if (!monoData) weightB[i] = restoreWeight(b[q++].toInt())
    }
  }

  private fun readDecorrSamples(b: ByteArray, p0: Int, len: Int, monoData: Boolean, version: Int) {
    var p = p0
    val end = p0 + len
    if (version == 0x402 && flags and HYBRID_FLAG != 0) {
      p += if (monoData) 2 else 4 // old shaping error values, only used with .wvc
      if (p > end) bad()
    }
    var i = numTerms
    while (i-- > 0 && p < end) {
      val t = term[i]
      val base = i * MAX_TERM
      if (t > MAX_TERM) {
        if (p + (if (monoData) 4 else 8) > end) bad()
        samplesA[base] = exp2sSigned(b, p); samplesA[base + 1] = exp2sSigned(b, p + 2); p += 4
        if (!monoData) { samplesB[base] = exp2sSigned(b, p); samplesB[base + 1] = exp2sSigned(b, p + 2); p += 4 }
      } else if (t < 0) {
        if (p + 4 > end) bad()
        samplesA[base] = exp2sSigned(b, p); samplesB[base] = exp2sSigned(b, p + 2); p += 4
      } else {
        for (m in 0 until t) {
          if (p + (if (monoData) 2 else 4) > end) bad()
          samplesA[base + m] = exp2sSigned(b, p); p += 2
          if (!monoData) { samplesB[base + m] = exp2sSigned(b, p); p += 2 }
        }
      }
    }
    if (p != end) bad()
  }

  private fun readHybridProfile(b: ByteArray, p0: Int, len: Int, monoData: Boolean) {
    var p = p0
    val end = p0 + len
    val step = if (monoData) 2 else 4
    if (flags and HYBRID_BITRATE != 0) {
      if (p + step > end) bad()
      slowLevel[0] = exp2s(le16(b, p)); p += 2
      if (!monoData) { slowLevel[1] = exp2s(le16(b, p)); p += 2 }
    }
    if (p + step > end) bad()
    bitrateAcc[0] = le16(b, p) shl 16; p += 2
    if (!monoData) { bitrateAcc[1] = le16(b, p) shl 16; p += 2 }
    if (p < end) {
      if (p + step > end) bad()
      bitrateDelta[0] = exp2sSigned(b, p); p += 2
      if (!monoData) { bitrateDelta[1] = exp2sSigned(b, p); p += 2 }
      if (p < end) bad()
    }
  }

  // ---------------------------------------------------------------- entropy decoding (read_words.c)

  /** Escape code: unary bit count, then that many - 1 bits under an implied top bit. -1 = end of data. */
  private fun readEscape(): Long {
    var cbits = 0
    while (cbits < 33 && wv.bit() != 0) cbits++
    if (cbits == 33) return -1
    if (cbits < 2) return cbits.toLong()
    var v = 0L
    var mask = 1L
    while (--cbits != 0) {
      if (wv.bit() != 0) v = v or mask
      mask = mask shl 1
    }
    return v or mask
  }

  /** get_word() without the correction stream; also serves lossless data (error limit 0). */
  private fun getWord(chan: Int, hybrid: Boolean): Int {
    val bs = wv
    if ((median[0] and 1.inv()) == 0 && holdingZero == 0 && holdingOne == 0 && (median[3] and 1.inv()) == 0) {
      if (zerosAcc != 0) {
        if (--zerosAcc != 0) {
          slowLevel[chan] -= (slowLevel[chan] + SLO) ushr SLS
          return 0
        }
      } else {
        val z = readEscape()
        if (z < 0) { eof = true; return 0 }
        zerosAcc = z.toInt()
        if (zerosAcc != 0) {
          slowLevel[chan] -= (slowLevel[chan] + SLO) ushr SLS
          java.util.Arrays.fill(median, 0)
          return 0
        }
      }
    }

    var ones: Int
    if (holdingZero != 0) {
      ones = 0
      holdingZero = 0
    } else {
      bs.fill()
      ones = java.lang.Long.numberOfTrailingZeros(bs.sr.inv())
      if (ones >= LIMIT_ONES + 1) { eof = true; return 0 }
      bs.skip(ones + 1)
      if (ones == LIMIT_ONES) {
        val e = readEscape()
        if (e < 0) { eof = true; return 0 }
        ones = (e + LIMIT_ONES).toInt()
      }
      val held = holdingOne
      holdingOne = ones and 1
      ones = (ones ushr 1) + held
      holdingZero = holdingOne.inv() and 1
    }

    if (hybrid && chan == 0) updateErrorLimit()

    val c = chan * 3
    var low: Int
    var high: Int
    if (ones == 0) {
      low = 0
      high = median[c] ushr 4
      median[c] -= ((median[c] + (DIV0 - 2)) ushr 7) * 2
    } else {
      low = (median[c] ushr 4) + 1
      median[c] += ((median[c] + DIV0) ushr 7) * 5
      if (ones == 1) {
        high = low + (median[c + 1] ushr 4)
        median[c + 1] -= ((median[c + 1] + (DIV1 - 2)) ushr 6) * 2
      } else {
        low += (median[c + 1] ushr 4) + 1
        median[c + 1] += ((median[c + 1] + DIV1) ushr 6) * 5
        if (ones == 2) {
          high = low + (median[c + 2] ushr 4)
          median[c + 2] -= ((median[c + 2] + (DIV2 - 2)) ushr 5) * 2
        } else {
          low += (ones - 2) * ((median[c + 2] ushr 4) + 1)
          high = low + (median[c + 2] ushr 4)
          median[c + 2] += ((median[c + 2] + DIV2) ushr 5) * 5
        }
      }
    }

    var mid: Int
    if (hybrid) {
      low = low and 0x7fffffff
      high = high and 0x7fffffff
      if (low > high) high = low
    }
    val limit = errorLimit[chan]
    if (limit == 0) {
      mid = readCode(high - low) + low
    } else {
      mid = (high + low + 1) ushr 1
      while (((high - low) xor Int.MIN_VALUE) > (limit xor Int.MIN_VALUE)) { // unsigned >
        if (bs.bit() != 0) {
          low = mid
          mid = (high + low + 1) ushr 1
        } else {
          high = mid - 1
          mid = (high + low + 1) ushr 1
        }
      }
    }
    val sign = bs.bit()
    if (flags and HYBRID_BITRATE != 0) {
      slowLevel[chan] -= (slowLevel[chan] + SLO) ushr SLS
      slowLevel[chan] += log2(mid)
    }
    return if (sign != 0) mid.inv() else mid
  }

  /** Reads a value in 0..maxcode (unsigned) with the minimum number of bits. */
  private fun readCode(maxcode: Int): Int {
    if (maxcode == 0) return 0
    if (maxcode == 1) return wv.bit()
    val bs = wv
    val bitcount = 32 - Integer.numberOfLeadingZeros(maxcode)
    val extras = (1L shl bitcount) - (maxcode.toLong() and 0xffffffffL) - 1
    if (bs.bc < bitcount) bs.fill()
    val sr = bs.sr
    var code = sr and ((1L shl (bitcount - 1)) - 1)
    if (code >= extras) {
      code = (code shl 1) - extras + ((sr ushr (bitcount - 1)) and 1)
      bs.skip(bitcount)
    } else {
      bs.skip(bitcount - 1)
    }
    return code.toInt()
  }

  private fun updateErrorLimit() {
    bitrateAcc[0] += bitrateDelta[0]
    var bitrate0 = bitrateAcc[0] ushr 16
    if (flags and MONO_DATA != 0) {
      if (flags and HYBRID_BITRATE != 0) {
        val slowLog0 = (slowLevel[0] + SLO) ushr SLS
        errorLimit[0] = if (slowLog0 - bitrate0 > -0x100) exp2s(slowLog0 - bitrate0 + 0x100) else 0
      } else errorLimit[0] = exp2s(bitrate0)
    } else {
      bitrateAcc[1] += bitrateDelta[1]
      var bitrate1 = bitrateAcc[1] ushr 16
      if (flags and HYBRID_BITRATE != 0) {
        val slowLog0 = (slowLevel[0] + SLO) ushr SLS
        val slowLog1 = (slowLevel[1] + SLO) ushr SLS
        if (flags and HYBRID_BALANCE != 0) {
          val balance = (slowLog1 - slowLog0 + bitrate1 + 1) shr 1
          if (balance > bitrate0) {
            bitrate1 = bitrate0 * 2; bitrate0 = 0
          } else if (-balance > bitrate0) {
            bitrate0 *= 2; bitrate1 = 0
          } else {
            bitrate1 = bitrate0 + balance; bitrate0 -= balance
          }
        }
        errorLimit[0] = if (slowLog0 - bitrate0 > -0x100) exp2s(slowLog0 - bitrate0 + 0x100) else 0
        errorLimit[1] = if (slowLog1 - bitrate1 > -0x100) exp2s(slowLog1 - bitrate1 + 0x100) else 0
      } else {
        errorLimit[0] = exp2s(bitrate0)
        errorLimit[1] = exp2s(bitrate1)
      }
    }
  }

  // ---------------------------------------------------------------- decorrelation (unpack.c)

  private fun decorrMono(t: Int, buf: IntArray, count: Int) {
    val base = t * MAX_TERM
    val sa = samplesA
    val d = delta[t]
    var w = weightA[t]
    when (val tm = term[t]) {
      17, 18 -> {
        var s0 = sa[base]
        var s1 = sa[base + 1]
        for (i in 0 until count) {
          val sam = if (tm == 17) 2 * s0 - s1 else (3 * s0 - s1) shr 1
          s1 = s0
          val x = buf[i]
          s0 = applyWeight(w, sam) + x
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; w = (d xor s) + (w - s) }
          buf[i] = s0
        }
        sa[base] = s0; sa[base + 1] = s1
      }
      else -> {
        var m = 0
        var k = tm and (MAX_TERM - 1)
        for (i in 0 until count) {
          val sam = sa[base + m]
          val x = buf[i]
          val v = applyWeight(w, sam) + x
          sa[base + k] = v
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; w = (d xor s) + (w - s) }
          buf[i] = v
          m = (m + 1) and (MAX_TERM - 1)
          k = (k + 1) and (MAX_TERM - 1)
        }
        // history is not carried to another call: every block is decoded in one go
      }
    }
    weightA[t] = w
  }

  private fun decorrStereo(t: Int, buf: IntArray, count: Int) {
    val base = t * MAX_TERM
    val sa = samplesA
    val sb = samplesB
    val d = delta[t]
    var wa = weightA[t]
    var wb = weightB[t]
    val n = count * 2
    when (val tm = term[t]) {
      17 -> {
        var i = 0
        while (i < n) {
          var sam = 2 * sa[base] - sa[base + 1]
          sa[base + 1] = sa[base]
          var x = buf[i]
          sa[base] = applyWeight(wa, sam) + x; buf[i] = sa[base]
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; wa = (d xor s) + (wa - s) }
          sam = 2 * sb[base] - sb[base + 1]
          sb[base + 1] = sb[base]
          x = buf[i + 1]
          sb[base] = applyWeight(wb, sam) + x; buf[i + 1] = sb[base]
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; wb = (d xor s) + (wb - s) }
          i += 2
        }
      }
      18 -> {
        var i = 0
        while (i < n) {
          var sam = sa[base] + ((sa[base] - sa[base + 1]) shr 1)
          sa[base + 1] = sa[base]
          var x = buf[i]
          sa[base] = applyWeight(wa, sam) + x; buf[i] = sa[base]
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; wa = (d xor s) + (wa - s) }
          sam = sb[base] + ((sb[base] - sb[base + 1]) shr 1)
          sb[base + 1] = sb[base]
          x = buf[i + 1]
          sb[base] = applyWeight(wb, sam) + x; buf[i + 1] = sb[base]
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; wb = (d xor s) + (wb - s) }
          i += 2
        }
      }
      -1 -> {
        var i = 0
        while (i < n) {
          val a0 = sa[base]
          var x = buf[i]
          val sam = x + applyWeight(wa, a0)
          wa = clipUpdate(wa, d, a0, x)
          buf[i] = sam
          x = buf[i + 1]
          sa[base] = x + applyWeight(wb, sam)
          wb = clipUpdate(wb, d, sam, x)
          buf[i + 1] = sa[base]
          i += 2
        }
      }
      -2 -> {
        var i = 0
        while (i < n) {
          val b0 = sb[base]
          var x = buf[i + 1]
          val sam = x + applyWeight(wb, b0)
          wb = clipUpdate(wb, d, b0, x)
          buf[i + 1] = sam
          x = buf[i]
          sb[base] = x + applyWeight(wa, sam)
          wa = clipUpdate(wa, d, sam, x)
          buf[i] = sb[base]
          i += 2
        }
      }
      -3 -> {
        var i = 0
        while (i < n) {
          val a0 = sa[base]
          val b0 = sb[base]
          val xa = buf[i]
          val xb = buf[i + 1]
          val samA = xa + applyWeight(wa, a0)
          wa = clipUpdate(wa, d, a0, xa)
          val samB = xb + applyWeight(wb, b0)
          wb = clipUpdate(wb, d, b0, xb)
          buf[i] = samA; sb[base] = samA
          buf[i + 1] = samB; sa[base] = samB
          i += 2
        }
      }
      else -> {
        var m = 0
        var k = tm and (MAX_TERM - 1)
        var i = 0
        while (i < n) {
          var sam = sa[base + m]
          var x = buf[i]
          var v = applyWeight(wa, sam) + x
          sa[base + k] = v
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; wa = (d xor s) + (wa - s) }
          buf[i] = v
          sam = sb[base + m]
          x = buf[i + 1]
          v = applyWeight(wb, sam) + x
          sb[base + k] = v
          if (sam != 0 && x != 0) { val s = (sam xor x) shr 31; wb = (d xor s) + (wb - s) }
          buf[i + 1] = v
          m = (m + 1) and (MAX_TERM - 1)
          k = (k + 1) and (MAX_TERM - 1)
          i += 2
        }
      }
    }
    weightA[t] = wa
    weightB[t] = wb
  }

  // ---------------------------------------------------------------- final fixups (unpack.c, unpack_floats.c)

  private fun fixupSamples(buf: IntArray, count: Int) {
    val lossy = flags and HYBRID_FLAG != 0
    var shift = (flags ushr 13) and 0x1f
    if (flags and FLOAT_DATA != 0) {
      if (wvx.open) floatValues(buf, count) else floatValuesNoWvx(buf, count)
      return
    }
    if (flags and INT32_DATA != 0) {
      val sent = int32SentBits and 0x1f
      var zeros = int32Zeros and 0x1f
      var ones = int32Ones and 0x1f
      var dups = int32Dups and 0x1f
      if (wvx.open) {
        val maxWidth = int32MaxWidth
        var crc = crcX
        for (i in 0 until count) {
          var v = buf[i]
          if (sent != 0) {
            if (maxWidth != 0) {
              val pv = if (v < 0) v.inv() else v
              val width = 32 - Integer.numberOfLeadingZeros(pv) + sent
              // only the bits that fit under max_width were sent; the rest are zeros
              var toRead = sent
              if (width > maxWidth) toRead -= width - maxWidth
              if (toRead > 0) {
                val data = wvx.bits(toRead)
                v = ((v shl toRead) or data) shl (sent - toRead)
              } else v = v shl sent
            } else {
              v = (v shl sent) or wvx.bits(sent)
            }
          }
          if (zeros != 0) v = v shl zeros
          else if (ones != 0) v = ((v + 1) shl ones) - 1
          else if (dups != 0) v = ((v + (v and 1)) shl dups) - (v and 1)
          crc = crc * 9 + (v and 0xffff) * 3 + ((v shr 16) and 0xffff)
          buf[i] = v
        }
        crcX = crc
      } else if (sent == 0 && zeros + ones + dups != 0) {
        while (lossy && flags and 3 == 3 && shift < 8) {
          if (zeros != 0) zeros--
          else if (ones != 0) ones--
          else if (dups != 0) dups--
          else break
          shift++
        }
        for (i in 0 until count) {
          val v = buf[i]
          buf[i] = if (zeros != 0) v shl zeros
          else if (ones != 0) ((v + 1) shl ones) - 1
          else if (dups != 0) ((v + (v and 1)) shl dups) - (v and 1)
          else v
        }
      } else {
        shift += zeros + sent + ones + dups
      }
    }
    shift = shift and 0x1f
    if (lossy) {
      val minValue: Int
      val maxValue: Int
      when (flags and 3) {
        0 -> { minValue = -128 shr shift; maxValue = 127 shr shift }
        1 -> { minValue = -32768 shr shift; maxValue = 32767 shr shift }
        2 -> { minValue = -8388608 shr shift; maxValue = 8388607 shr shift }
        else -> { minValue = Int.MIN_VALUE shr shift; maxValue = Int.MAX_VALUE shr shift }
      }
      val minShifted = minValue shl shift
      val maxShifted = maxValue shl shift
      for (i in 0 until count) {
        val v = buf[i]
        buf[i] = if (v < minValue) minShifted else if (v > maxValue) maxShifted else v shl shift
      }
    } else if (shift != 0) {
      for (i in 0 until count) buf[i] = buf[i] shl shift
    }
  }

  /** float_values(): rebuilds IEEE floats from the integer stream plus the wvx extra bits. */
  private fun floatValues(buf: IntArray, count: Int) {
    val minShiftedZeros = floatMinShiftedZeros
    val maxShiftedOnes = floatMaxShiftedOnes
    var crc = crcX
    for (i in 0 until count) {
      var v = buf[i]
      var shiftCount = 0
      var exp = floatMaxExp
      var out = 0
      if (v == 0) {
        if (floatFlags and FLOAT_ZEROS_SENT != 0) {
          if (wvx.bit() != 0) {
            out = setMantissa(out, wvx.bits(23))
            if (exp >= 25) out = setExponent(out, wvx.bits(8))
            out = setSign(out, wvx.bit())
          } else if (floatFlags and FLOAT_NEG_ZEROS != 0) out = setSign(out, wvx.bit())
        }
      } else {
        v = v shl (floatShift and 0x1f)
        if (v < 0) { v = -v; out = setSign(out, 1) }
        if (v == 0x1000000) {
          if (wvx.bit() != 0) out = setMantissa(out, wvx.bits(23))
          out = setExponent(out, 255)
        } else {
          if (exp != 0) {
            while (v and 0x800000 == 0 && --exp != 0) { shiftCount++; v = v shl 1 }
          }
          shiftCount = shiftCount and 0x1f
          if (shiftCount != 0) {
            if (floatFlags and FLOAT_SHIFT_ONES != 0 || (floatFlags and FLOAT_SHIFT_SAME != 0 && wvx.bit() != 0)) {
              v = v or ((1 shl shiftCount) - 1)
            } else if (floatFlags and FLOAT_SHIFT_SENT != 0) {
              val mask = (1 shl shiftCount) - 1
              var numZeros = 0
              if (maxShiftedOnes != 0 && shiftCount > maxShiftedOnes) numZeros = shiftCount - maxShiftedOnes
              if (minShiftedZeros > numZeros) numZeros = if (minShiftedZeros > shiftCount) shiftCount else minShiftedZeros
              shiftCount -= numZeros
              if (shiftCount > 0) v = v or ((wvx.bits(shiftCount) shl numZeros) and mask)
            }
          }
          out = setMantissa(out, v)
          out = setExponent(out, exp)
        }
      }
      crc = crc * 27 + (out and 0x7fffff) * 9 + ((out shr 23) and 0xff) * 3 + ((out shr 31) and 1)
      buf[i] = out
    }
    crcX = crc
  }

  private fun floatValuesNoWvx(buf: IntArray, count: Int) {
    for (i in 0 until count) {
      var v = buf[i]
      var shiftCount = 0
      var exp = floatMaxExp
      var out = 0
      if (v != 0) {
        v = v shl (floatShift and 0x1f)
        if (v < 0) { v = -v; out = setSign(out, 1) }
        if (v >= 0x1000000) {
          while (v and 0xf000000 != 0) { v = v shr 1; ++exp }
        } else if (exp != 0) {
          while (v and 0x800000 == 0 && --exp != 0) { shiftCount++; v = v shl 1 }
          shiftCount = shiftCount and 0x1f
          if (shiftCount != 0 && floatFlags and FLOAT_SHIFT_ONES != 0) v = v or ((1 shl shiftCount) - 1)
        }
        out = setMantissa(out, v)
        out = setExponent(out, exp)
      }
      buf[i] = out
    }
  }

  private companion object {
    const val MAX_NTERMS = 16
    const val MAX_TERM = 8
    const val SLS = 8
    const val SLO = 1 shl (SLS - 1)
    const val LIMIT_ONES = 16
    const val DIV0 = 128
    const val DIV1 = 64
    const val DIV2 = 32
    const val FLOAT_SHIFT_ONES = 1
    const val FLOAT_SHIFT_SAME = 2
    const val FLOAT_SHIFT_SENT = 4
    const val FLOAT_ZEROS_SENT = 8
    const val FLOAT_NEG_ZEROS = 0x10

    fun setMantissa(f: Int, v: Int) = f xor ((f xor v) and 0x7fffff)
    fun setExponent(f: Int, v: Int) = f xor ((f xor (v shl 23)) and 0x7f800000)
    fun setSign(f: Int, v: Int) = f xor ((f xor (v shl 31)) and Int.MIN_VALUE)

    /** apply_weight(): exact 32-bit form of (weight * sample + 512) >> 10, as libwavpack computes it. */
    fun applyWeight(w: Int, s: Int): Int =
      if (s != s.toShort().toInt()) (((((s and 0xffff) * w) shr 9) + (((s and 0xffff.inv()) shr 9) * w) + 1) shr 1)
      else (w * s + 512) shr 10

    fun clipUpdate(weight: Int, delta: Int, source: Int, result: Int): Int {
      if (source == 0 || result == 0) return weight
      val s = (source xor result) shr 31
      var w = (weight xor s) + (delta - s)
      if (w > 1024) w = 1024
      return (w xor s) - s
    }

    fun restoreWeight(b: Int): Int {
      var r = b * 8
      if (r > 0) r += (r + 64) shr 7
      return r
    }

    /** wp_exp2s(): signed log (8 fractional bits) back to a 32-bit value. */
    fun exp2s(log: Int): Int {
      if (log < 0) return -exp2s(-log)
      val value = (EXP2[log and 0xff].toInt() and 0xff) or 0x100
      val l = log shr 8
      return if (l <= 9) value ushr (9 - l) else value shl ((l - 9) and 0x1f)
    }

    /** wp_log2() of an unsigned value. */
    fun log2(v: Int): Int {
      val a = v + (v ushr 9)
      val dbits = 32 - Integer.numberOfLeadingZeros(a)
      return if ((a xor Int.MIN_VALUE) < (256 xor Int.MIN_VALUE)) {
        (dbits shl 8) + (LOG2[(a shl (9 - dbits)) and 0xff].toInt() and 0xff)
      } else {
        (dbits shl 8) + (LOG2[(a ushr (dbits - 9)) and 0xff].toInt() and 0xff)
      }
    }

    private fun table(s: String): ByteArray {
      val parts = s.trim().split(Regex("\\s+"))
      return ByteArray(parts.size) { parts[it].toInt(16).toByte() }
    }

    val LOG2 = table(
      """
      00 01 03 04 06 07 09 0a 0b 0d 0e 10 11 12 14 15 16 18 19 1a 1c 1d 1e 20 21 22 24 25 26 28 29 2a
      2c 2d 2e 2f 31 32 33 34 36 37 38 39 3b 3c 3d 3e 3f 41 42 43 44 45 47 48 49 4a 4b 4d 4e 4f 50 51
      52 54 55 56 57 58 59 5a 5c 5d 5e 5f 60 61 62 63 64 66 67 68 69 6a 6b 6c 6d 6e 6f 70 71 72 74 75
      76 77 78 79 7a 7b 7c 7d 7e 7f 80 81 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e 8f 90 91 92 93 94 95
      96 97 98 99 9a 9b 9b 9c 9d 9e 9f a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a9 aa ab ac ad ae af b0 b1 b2 b2
      b3 b4 b5 b6 b7 b8 b9 b9 ba bb bc bd be bf c0 c0 c1 c2 c3 c4 c5 c6 c6 c7 c8 c9 ca cb cb cc cd ce
      cf d0 d0 d1 d2 d3 d4 d4 d5 d6 d7 d8 d8 d9 da db dc dc dd de df e0 e0 e1 e2 e3 e4 e4 e5 e6 e7 e7
      e8 e9 ea ea eb ec ed ee ee ef f0 f1 f1 f2 f3 f4 f4 f5 f6 f7 f7 f8 f9 f9 fa fb fc fc fd fe ff ff
      """,
    )

    val EXP2 = table(
      """
      00 01 01 02 03 03 04 05 06 06 07 08 08 09 0a 0b 0b 0c 0d 0e 0e 0f 10 10 11 12 13 13 14 15 16 16
      17 18 19 19 1a 1b 1c 1d 1d 1e 1f 20 20 21 22 23 24 24 25 26 27 28 28 29 2a 2b 2c 2c 2d 2e 2f 30
      30 31 32 33 34 35 35 36 37 38 39 3a 3a 3b 3c 3d 3e 3f 40 41 41 42 43 44 45 46 47 48 48 49 4a 4b
      4c 4d 4e 4f 50 51 51 52 53 54 55 56 57 58 59 5a 5b 5c 5d 5e 5e 5f 60 61 62 63 64 65 66 67 68 69
      6a 6b 6c 6d 6e 6f 70 71 72 73 74 75 76 77 78 79 7a 7b 7c 7d 7e 7f 80 81 82 83 84 85 87 88 89 8a
      8b 8c 8d 8e 8f 90 91 92 93 95 96 97 98 99 9a 9b 9c 9d 9f a0 a1 a2 a3 a4 a5 a6 a8 a9 aa ab ac ad
      af b0 b1 b2 b3 b4 b6 b7 b8 b9 ba bc bd be bf c0 c2 c3 c4 c5 c6 c8 c9 ca cb cd ce cf d0 d2 d3 d4
      d6 d7 d8 d9 db dc dd de e0 e1 e2 e4 e5 e6 e8 e9 ea ec ed ee f0 f1 f2 f4 f5 f6 f8 f9 fa fc fd ff
      """,
    )
  }
}
