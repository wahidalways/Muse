/*
 * Apple Lossless (ALAC) decoder, ported to Kotlin from Apple's open-source ALAC
 * codec (ALACDecoder.cpp, ag_dec.c, dp_dec.c, matrix_dec.c):
 * https://github.com/macosforge/alac
 *
 * Copyright (c) 2011 Apple Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * Modified: translated to Kotlin, output as sign-extended Ints, bounds checks added.
 */
package expo.modules.musemetadata.formats

/**
 * Decodes ALAC packets (one MP4 sample each). [magicCookie] is the ALACSpecificConfig:
 * the raw 24 bytes (what Media3 puts in `Format.initializationData[0]`), the same
 * preceded by its 12-byte 'alac' atom header, or Apple's 'frma' + 'alac' wrapped form.
 * Channels come out in ALAC bitstream order (see [channelMaskFor]).
 */
class AlacDecoder(magicCookie: ByteArray) {
  val info: StreamInfo
  val framesPerPacket: Int

  private val bitDepth: Int
  private val channels: Int
  private val pb: Int
  private val mb: Int
  private val kb: Int

  // Work buffers, sized once (+32 because the predictor warm-up can touch up to 31 entries).
  private val predictor: IntArray
  private val mixU: IntArray
  private val mixV: IntArray
  private val shiftBuf: IntArray
  private val coefsU = IntArray(32)
  private val coefsV = IntArray(32)
  private val out: IntArray

  // Packet copy with zero padding so the bit reader can look ahead without bounds checks.
  private var buf = ByteArray(0)
  private var bitPos = 0
  private var bitEnd = 0

  init {
    var p = 0
    if (fourcc(magicCookie, 4) == FRMA) p += 12
    if (fourcc(magicCookie, p + 4) == ALAC) p += 12
    if (magicCookie.size - p < 24) throw FormatException("ALAC: magic cookie too short")
    val c = magicCookie
    val frameLength = be32(c, p)
    val compatibleVersion = c[p + 4].toInt() and 0xff
    bitDepth = c[p + 5].toInt() and 0xff
    pb = c[p + 6].toInt() and 0xff
    mb = c[p + 7].toInt() and 0xff
    kb = c[p + 8].toInt() and 0xff
    channels = c[p + 9].toInt() and 0xff
    val sampleRate = be32(c, p + 20)
    if (compatibleVersion > 0) throw FormatException("ALAC: unsupported version $compatibleVersion")
    if (bitDepth != 16 && bitDepth != 20 && bitDepth != 24 && bitDepth != 32) {
      throw FormatException("ALAC: unsupported bit depth $bitDepth")
    }
    if (channels !in 1..8) throw FormatException("ALAC: unsupported channel count $channels")
    // Real files use 4096 (352 for old iTunes); the cap only stops a bad cookie from exhausting memory.
    if (frameLength !in 1..65536) throw FormatException("ALAC: bad frame length $frameLength")
    if (sampleRate <= 0) throw FormatException("ALAC: bad sample rate $sampleRate")

    framesPerPacket = frameLength
    info = StreamInfo(sampleRate, channels, bitDepth, false, -1L, channelMaskFor(channels))
    predictor = IntArray(frameLength + 32)
    mixU = IntArray(frameLength + 32)
    mixV = IntArray(frameLength + 32)
    shiftBuf = IntArray(frameLength * 2)
    out = IntArray(frameLength * channels)
  }

  /**
   * Decodes one ALAC packet. Returns interleaved samples sign-extended at bitsPerSample.
   * The returned block's array is reused and overwritten by the next call.
   */
  fun decode(packet: ByteArray, offset: Int, length: Int): PcmBlock {
    if (offset < 0 || length < 0 || offset + length > packet.size) throw FormatException("ALAC: bad packet range")
    if (buf.size < length + PAD) buf = ByteArray(length + PAD)
    System.arraycopy(packet, offset, buf, 0, length)
    java.util.Arrays.fill(buf, length, length + PAD, 0)
    bitPos = 0
    bitEnd = length * 8

    var numSamples = framesPerPacket
    var channelIndex = 0
    loop@ while (true) {
      if (bitPos >= bitEnd) throw FormatException("ALAC: ran off the end of the packet")
      when (read(3)) {
        ID_SCE, ID_LFE -> {
          numSamples = decodeElement(channelIndex, false, numSamples)
          channelIndex += 1
        }
        ID_CPE -> {
          if (channelIndex + 2 > channels) break@loop // more channels than the cookie says: zero-fill the rest
          numSamples = decodeElement(channelIndex, true, numSamples)
          channelIndex += 2
        }
        ID_DSE -> {
          read(4) // element instance tag
          val align = read(1)
          var count = read(8)
          if (count == 255) count += read(8)
          if (align != 0) bitPos = (bitPos + 7) and 7.inv()
          skip(count * 8)
        }
        ID_FIL -> {
          var count = read(4)
          if (count == 15) count += read(8) - 1
          skip(count * 8)
        }
        ID_END -> break@loop
        else -> throw FormatException("ALAC: unsupported element") // CCE, PCE
      }
      if (channelIndex >= channels) break
    }
    // Channels the packet did not carry are silent.
    for (ch in channelIndex until channels) {
      var j = ch
      for (i in 0 until numSamples) { out[j] = 0; j += channels }
    }
    return PcmBlock(out, numSamples)
  }

  /** Decodes one SCE/LFE (mono) or CPE (pair) element into [out] at [channelIndex]; returns its frame count. */
  private fun decodeElement(channelIndex: Int, pair: Boolean, frames: Int): Int {
    read(4) // element instance tag
    if (read(12) != 0) throw FormatException("ALAC: bad element header")
    val header = read(4)
    val partialFrame = header ushr 3
    var bytesShifted = (header ushr 1) and 3
    if (bytesShifted == 3) throw FormatException("ALAC: bad shift")
    val escape = header and 1
    var numSamples = frames
    if (partialFrame != 0) {
      numSamples = read(32)
      if (numSamples < 0 || numSamples > framesPerPacket) throw FormatException("ALAC: bad partial frame length")
    }
    val numCh = if (pair) 2 else 1
    var mixBits = 0
    var mixRes = 0

    if (escape == 0) {
      // Pairs carry one extra bit: the side channel (L - R) needs it.
      val chanBits = bitDepth - bytesShifted * 8 + (if (pair) 1 else 0)
      mixBits = read(8)
      mixRes = read(8).toByte().toInt()
      val hU = read(8); val modeU = hU ushr 4; val denShiftU = hU and 15
      val pU = read(8); val pbFactorU = pU ushr 5; val numU = pU and 31
      for (i in 0 until numU) coefsU[i] = read(16).toShort().toInt()
      var modeV = 0; var denShiftV = 0; var pbFactorV = 0; var numV = 0
      if (pair) {
        val hV = read(8); modeV = hV ushr 4; denShiftV = hV and 15
        val pV = read(8); pbFactorV = pV ushr 5; numV = pV and 31
        for (i in 0 until numV) coefsV[i] = read(16).toShort().toInt()
      }
      // The shifted-off low bytes come first; remember where and skip them for now.
      val shiftStart = bitPos
      if (bytesShifted != 0) skip(bytesShifted * 8 * numCh * numSamples)

      dynDecomp((pb * pbFactorU) / 4, numSamples, chanBits)
      if (modeU != 0) unpcBlock(predictor, predictor, numSamples, coefsU, 31, chanBits, 0)
      unpcBlock(predictor, mixU, numSamples, coefsU, numU, chanBits, denShiftU)
      if (pair) {
        dynDecomp((pb * pbFactorV) / 4, numSamples, chanBits)
        if (modeV != 0) unpcBlock(predictor, predictor, numSamples, coefsV, 31, chanBits, 0)
        unpcBlock(predictor, mixV, numSamples, coefsV, numV, chanBits, denShiftV)
      }

      if (bytesShifted != 0) {
        val afterAudio = bitPos
        bitPos = shiftStart
        val n = bytesShifted * 8
        for (i in 0 until numSamples * numCh) shiftBuf[i] = read(n)
        bitPos = afterAudio
      }
    } else {
      // Uncompressed frame: samples stored verbatim, interleaved for pairs.
      val chanBits = if (pair) bitDepth else bitDepth - bytesShifted * 8
      if (bitEnd - bitPos < chanBits.toLong() * numCh * numSamples) throw FormatException("ALAC: truncated frame")
      val s = 32 - chanBits
      for (i in 0 until numSamples) {
        mixU[i] = (read(chanBits) shl s) shr s
        if (pair) mixV[i] = (read(chanBits) shl s) shr s
      }
      bytesShifted = 0
    }

    // Unmix, put back the shifted-off bits (Apple only does this for 24/32-bit), sign-extend at bitDepth.
    val shift = if (bitDepth >= 24) bytesShifted * 8 else 0
    val outShift = 32 - bitDepth
    val stride = channels
    var o = channelIndex
    if (!pair) {
      for (j in 0 until numSamples) {
        var l = mixU[j]
        if (shift != 0) l = (l shl shift) or shiftBuf[j]
        out[o] = (l shl outShift) shr outShift
        o += stride
      }
    } else {
      for (j in 0 until numSamples) {
        var l: Int
        var r: Int
        if (mixRes != 0) {
          val v = mixV[j]
          l = mixU[j] + v - ((mixRes * v) shr mixBits)
          r = l - v
        } else {
          l = mixU[j]
          r = mixV[j]
        }
        if (shift != 0) {
          l = (l shl shift) or shiftBuf[2 * j]
          r = (r shl shift) or shiftBuf[2 * j + 1]
        }
        out[o] = (l shl outShift) shr outShift
        out[o + 1] = (r shl outShift) shr outShift
        o += stride
      }
    }
    return numSamples
  }

  /** Adaptive Golomb decode of [numSamples] residuals into [predictor] (ag_dec.c dyn_decomp). */
  private fun dynDecomp(pbLocal: Int, numSamples: Int, maxSize: Int) {
    val b = buf
    val wb = (1 shl kb) - 1
    var pos = bitPos
    var mbv = mb
    var zmode = 0
    var c = 0
    // Values below are uint32 in Apple's code: hence ushr and the unsigned compares.
    while (c < numSamples) {
      if (pos >= bitEnd) throw FormatException("ALAC: ran off the end of the packet")
      var k = 31 - Integer.numberOfLeadingZeros((mbv ushr 9) + 3)
      if (k > kb) k = kb
      val m = (1 shl k) - 1

      // dyn_get_32bit: unary prefix, then k bits, or an escape of maxSize raw bits.
      val w = peek32(b, pos)
      var n: Int
      val pre = Integer.numberOfLeadingZeros(w.inv())
      if (pre >= 9) {
        n = if (maxSize >= 32) peek32(b, pos + 9) else peek32(b, pos + 9) ushr (32 - maxSize)
        pos += 9 + maxSize
      } else {
        pos += pre + 1
        n = pre
        if (k != 1) {
          val v = (w shl (pre + 1)) ushr (32 - k)
          n = pre * m
          if (v >= 2) {
            n += v - 1
            pos += k
          } else {
            pos += k - 1
          }
        }
      }

      // Least significant bit is the sign.
      val nd = n + zmode
      predictor[c++] = ((nd + 1) ushr 1) * ((-(nd and 1)) or 1)
      mbv = pbLocal * nd + mbv - ((pbLocal * mbv) ushr 9)
      if ((n ushr 16) != 0) mbv = 0xffff // n > 0xffff
      zmode = 0

      // Low mean: a run of zeros follows.
      if (((mbv shl 2) ushr 9) == 0 && c < numSamples) {
        zmode = 1
        val kz = Integer.numberOfLeadingZeros(mbv) - 24 + ((mbv + 16) ushr 6)
        val mz = ((1 shl kz) - 1) and wb
        // dyn_get: like above but the escape is 16 bits and k == 1 is not special.
        val wz = peek32(b, pos)
        val prez = Integer.numberOfLeadingZeros(wz.inv())
        val run: Int
        if (prez >= 9) {
          run = peek32(b, pos + 9) ushr 16
          pos += 9 + 16
        } else {
          pos += prez + 1
          val v = (wz shl (prez + 1)) ushr (32 - kz)
          pos += kz
          if (v < 2) {
            run = prez * mz
            pos -= 1
          } else {
            run = prez * mz + v - 1
          }
        }
        if (run < 0 || c + run > numSamples) throw FormatException("ALAC: bad zero run")
        for (j in 0 until run) predictor[c++] = 0
        if (run >= 65535) zmode = 0
        mbv = 0
      }
    }
    if (pos > bitEnd) throw FormatException("ALAC: ran off the end of the packet")
    bitPos = pos
  }

  /** Reads n (0..32) bits, checked against the packet end. */
  private fun read(n: Int): Int {
    if (n == 0) return 0
    if (bitPos + n > bitEnd) throw FormatException("ALAC: ran off the end of the packet")
    val w = peek32(buf, bitPos)
    bitPos += n
    return if (n == 32) w else w ushr (32 - n)
  }

  private fun skip(bits: Int) {
    if (bits < 0 || bitEnd - bitPos < bits) throw FormatException("ALAC: ran off the end of the packet")
    bitPos += bits
  }

  companion object {
    private const val ID_SCE = 0
    private const val ID_CPE = 1
    private const val ID_LFE = 3
    private const val ID_DSE = 4
    private const val ID_FIL = 6
    private const val ID_END = 7
    private const val PAD = 16
    private const val FRMA = 0x66726d61 // 'frma'
    private const val ALAC = 0x616c6163 // 'alac'

    /**
     * WAVE speaker mask of the standard ALAC layout for [channels]. ALAC bitstream order
     * differs from WAVE order for 3+ channels:
     * 3: C L R, 4: C L R Cs, 5: C L R Ls Rs, 6: C L R Ls Rs LFE, 7: C L R Ls Rs Cs LFE,
     * 8: C Lc Rc L R Ls Rs LFE.
     */
    fun channelMaskFor(channels: Int): Int = when (channels) {
      1 -> 0x4 // FC
      2 -> 0x3 // FL FR
      3 -> 0x7 // FL FR FC
      4 -> 0x107 // FL FR FC BC
      5 -> 0x37 // FL FR FC BL BR
      6 -> 0x3F // FL FR FC LFE BL BR
      7 -> 0x13F // FL FR FC LFE BL BR BC
      8 -> 0xFF // FL FR FC LFE BL BR FLC FRC
      else -> 0
    }

    private fun fourcc(b: ByteArray, at: Int): Int = if (at + 4 <= b.size) be32(b, at) else 0

    private fun be32(b: ByteArray, at: Int): Int =
      ((b[at].toInt() and 0xff) shl 24) or ((b[at + 1].toInt() and 0xff) shl 16) or
        ((b[at + 2].toInt() and 0xff) shl 8) or (b[at + 3].toInt() and 0xff)

    /** 32 bits starting at bit [pos], MSB first. Needs 5 readable bytes from pos / 8. */
    private fun peek32(b: ByteArray, pos: Int): Int {
      val i = pos ushr 3
      val s = pos and 7
      val w = be32(b, i)
      return if (s == 0) w else (w shl s) or ((b[i + 4].toInt() and 0xff) ushr (8 - s))
    }

    private fun sign(i: Int): Int = ((-i) ushr 31) or (i shr 31)

    /** Adaptive FIR predictor (dp_dec.c unpc_block); [coefs] are int16 values and adapt in place. */
    private fun unpcBlock(pc: IntArray, out: IntArray, num: Int, coefs: IntArray, numActive: Int, chanBits: Int, denShift: Int) {
      val chanShift = if (chanBits >= 32) 0 else 32 - chanBits
      val denHalf = (1 shl denShift) ushr 1
      out[0] = pc[0]
      if (numActive == 0) {
        if (num > 1 && pc !== out) System.arraycopy(pc, 1, out, 1, num - 1)
        return
      }
      if (numActive == 31) {
        // First-difference integration; safe in place.
        var prev = out[0]
        for (j in 1 until num) {
          prev = ((pc[j] + prev) shl chanShift) shr chanShift
          out[j] = prev
        }
        return
      }
      for (j in 1..numActive) out[j] = ((pc[j] + out[j - 1]) shl chanShift) shr chanShift
      val lim = numActive + 1
      for (j in lim until num) {
        val top = out[j - lim]
        var sum = 0
        var p = j - 1
        for (k in 0 until numActive) { sum += coefs[k] * (out[p] - top); p-- }
        var del = pc[j]
        var del0 = del
        val sg = sign(del)
        del += top + ((sum + denHalf) shr denShift)
        out[j] = (del shl chanShift) shr chanShift
        // Nudge the coefficients toward the residual's sign, newest tap first.
        if (sg > 0) {
          var k = numActive - 1
          while (k >= 0) {
            val dd = top - out[j - 1 - k]
            val sgn = sign(dd)
            coefs[k] = ((coefs[k] - sgn) shl 16) shr 16
            del0 -= (numActive - k) * ((sgn * dd) shr denShift)
            if (del0 <= 0) break
            k--
          }
        } else if (sg < 0) {
          var k = numActive - 1
          while (k >= 0) {
            val dd = top - out[j - 1 - k]
            val sgn = sign(dd)
            coefs[k] = ((coefs[k] + sgn) shl 16) shr 16
            del0 -= (numActive - k) * ((-sgn * dd) shr denShift)
            if (del0 >= 0) break
            k--
          }
        }
      }
    }
  }
}
