// Monkey's Audio (APE) frame decoder: range decoder, channel decorrelation, CRC.
// Ported from the Monkey's Audio SDK 13.46 (APEDecompressCore.cpp, UnBitArray.cpp,
// UnBitArrayBase.cpp, Old/UnBitArrayOld.cpp, Prepare.cpp, FloatTransform.cpp).
// Copyright 2000-2026 Matthew T. Ashland. All rights reserved.
// Used under the 3-clause BSD license (see THIRD_PARTY_NOTICES).
package expo.modules.musemetadata.formats

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.zip.CRC32

class ApeDecoder(val info: ApeInfo) {
  private val channels = info.stream.channels
  private val bits = info.stream.bitsPerSample
  private val version = info.fileVersion
  private val predictors: Array<ApePredictor> = Array(channels) {
    when {
      version < 3950 -> ApePredictor3930(info.compressionLevel, version)
      bits == 32 -> ApePredictor3950Long(info.compressionLevel)
      else -> ApePredictor3950(info.compressionLevel, version, bits)
    }
  }
  private val coder = ApeRangeDecoder(version)
  private val kState = IntArray(channels * 2) // k, kSum per channel
  private val values = IntArray(maxOf(channels, 2))
  private val res = Array(channels) { LongArray(CHUNK) }
  private val samples = IntArray(info.blocksPerFrame * channels)
  private val block = PcmBlock(samples, info.blocksPerFrame)
  private val wav = ByteArray(CHUNK * channels * (bits / 8)) // current chunk as WAV bytes, for the CRC
  private var chunkStart = 0
  private val crc = CRC32()
  /** First pair index of each mid/side pair in the SDK's multichannel layout, else -1. */
  private val pairStart = multichannelPairs()
  private var useInterim = false
  // Insane spends almost all its time in NN filters, which are independent per channel: run the
  // channels on worker threads. Measured: lower levels lose more to the handoff than they gain.
  private val parallel = channels > 1 && info.compressionLevel >= 5000 && Runtime.getRuntime().availableProcessors() > 1
  private val pending = arrayOfNulls<Future<*>>(channels)

  fun decodeFrame(index: Int, bytes: ByteArray, length: Int): PcmBlock {
    if (index < 0 || index >= info.frameCount) throw FormatException("APE: frame $index out of range")
    val blocks = ApeFile.frameBlocks(info, index)
    val skip = ApeFile.alignSkip(info, index)
    if (decodeOnce(bytes, length, skip, blocks, useInterim)) return finish(blocks)
    // 24-bit files from Monkey's Audio 5.01-8.51 need interim maths; only a CRC miss tells
    if (bits == 24 && decodeOnce(bytes, length, skip, blocks, !useInterim)) {
      useInterim = !useInterim
      return finish(blocks)
    }
    throw FormatException("APE: frame $index failed its CRC check")
  }

  /** NN filters for every channel over residual chunk [0, n). */
  private fun filterAll(n: Int) {
    if (!parallel) {
      for (ch in 0 until channels) predictors[ch].filter(res[ch], n)
      return
    }
    for (ch in 1 until channels) {
      val p = predictors[ch]; val r = res[ch]
      pending[ch] = workers.submit(Runnable { p.filter(r, n) })
    }
    try {
      predictors[0].filter(res[0], n)
    } finally {
      // always wait for the workers: they write into this decoder's buffers
      var interrupted = false
      for (ch in 1 until channels) {
        while (true) {
          try { pending[ch]!!.get(); break } catch (e: InterruptedException) { interrupted = true }
        }
        pending[ch] = null
      }
      if (interrupted) Thread.currentThread().interrupt()
    }
  }

  private fun finish(blocks: Int): PcmBlock {
    if (info.stream.isFloat) {
      // undo the SDK's float-to-integer bit transform
      for (i in 0 until blocks * channels) {
        val v = samples[i]
        var out = (v and 0xC3FFFFFF.toInt()) or ((v and 0x3C000000).inv() xor 0xC3FFFFFF.toInt())
        if (out < 0) out = out.inv() or Int.MIN_VALUE
        samples[i] = out
      }
    }
    return if (blocks == block.frames) block else PcmBlock(samples, blocks)
  }

  /** Returns false on a CRC mismatch or a corrupt stream. */
  private fun decodeOnce(bytes: ByteArray, length: Int, skip: Int, blocks: Int, interim: Boolean): Boolean {
    val c = coder
    c.reset(bytes, length, skip)
    for (p in predictors) {
      if (p is ApePredictor3950) p.interim = interim
      p.flush()
    }
    var storedCrc = c.readUInt32()
    var special = 0
    if (storedCrc and 0x80000000.toInt() != 0) special = c.readUInt32()
    storedCrc = storedCrc and 0x7FFFFFFF
    for (ch in 0 until channels) { kState[ch * 2] = 10; kState[ch * 2 + 1] = 16384 }
    c.start()

    val silent = if (channels == 1) special and 1 != 0 else channels == 2 && special and 3 == 3
    val pseudoStereo = channels == 2 && special and 4 != 0
    crc.reset()
    try {
      // residuals for a chunk first, then each channel's NN filters, then stage 1 per sample
      val r0 = res[0]
      val r1 = if (channels > 1) res[1] else r0
      var lastX = 0
      var done = 0
      while (done < blocks) {
        val n = minOf(CHUNK, blocks - done)
        chunkStart = done
        if (silent) {
          values.fill(0)
          for (i in 0 until n) store(done + i)
        } else if (channels == 1 || pseudoStereo) {
          for (i in 0 until n) r0[i] = c.decode(kState, 0)
          predictors[0].filter(r0, n)
          values[1] = 0 // pseudo stereo: Y = 0
          for (i in 0 until n) { values[0] = predictors[0].predict(r0[i], 0); store(done + i) }
        } else if (channels == 2) {
          val p0 = predictors[0]; val p1 = predictors[1]
          if (version >= 3950) {
            for (i in 0 until n) { r1[i] = c.decode(kState, 1); r0[i] = c.decode(kState, 0) }
          } else {
            for (i in 0 until n) { r0[i] = c.decode(kState, 0); r1[i] = c.decode(kState, 1) }
          }
          filterAll(n)
          for (i in 0 until n) {
            if (version >= 3950) {
              // Y is predicted from the previous X, X from this Y
              val y = p1.predict(r1[i], lastX)
              lastX = p0.predict(r0[i], y)
              values[0] = lastX; values[1] = y
            } else {
              values[0] = p0.predict(r0[i], 0); values[1] = p1.predict(r1[i], 0)
            }
            store(done + i)
          }
        } else {
          for (i in 0 until n) for (ch in 0 until channels) res[ch][i] = c.decode(kState, ch)
          filterAll(n)
          for (i in 0 until n) {
            for (ch in 0 until channels) values[ch] = predictors[ch].predict(res[ch][i], 0)
            store(done + i)
          }
        }
        crc.update(wav, 0, n * channels * (bits / 8))
          done += n
      }
    } catch (e: ApeCorrupt) {
      return false
    }
    return (crc.value.toInt() ushr 1) == storedCrc
  }

  /** SDK Unprepare: undoes mid/side, writes block [i] to [samples] and its WAV bytes to [wav]. */
  private fun store(i: Int) {
    val v = values
    var o = i * channels
    var w = (i - chunkStart) * channels * (bits / 8)
    if (channels <= 2 || bits == 32) {
      if (channels == 2) {
        val first = v[0] - v[1] / 2
        val second = first + v[1]
        when (bits) {
          16 -> {
            if (first < -32768 || first > 32767 || second < -32768 || second > 32767) throw ApeCorrupt
            samples[o] = first; samples[o + 1] = second
            put16(w, first); put16(w + 2, second)
          }
          8 -> {
            val a = (first + 128) and 0xFF
            val b = (a + v[1]) and 0xFF
            samples[o] = a - 128; samples[o + 1] = b - 128
            wav[w] = a.toByte(); wav[w + 1] = b.toByte()
          }
          24 -> { samples[o] = put24(w, first); samples[o + 1] = put24(w + 3, second) }
          else -> { samples[o] = first; samples[o + 1] = second; put32(w, first); put32(w + 4, second) }
        }
      } else {
        for (ch in 0 until channels) {
          val x = v[ch]
          when (bits) {
            16 -> { val s = x.toShort().toInt(); samples[o] = s; put16(w, s) }
            8 -> { val a = (x + 128) and 0xFF; samples[o] = a - 128; wav[w] = a.toByte() }
            24 -> samples[o] = put24(w, x)
            else -> { samples[o] = x; put32(w, x) }
          }
          o++; w += bits / 8
        }
      }
      return
    }
    // 3+ channels at 8/16/24 bits
    var ch = 0
    while (ch < channels) {
      if (bits != 8 && pairStart[ch] == ch) {
        val first = v[ch] - v[ch + 1] / 2
        val second = if (pairStart[ch + 1] == -2) v[ch + 1] else first + v[ch + 1] // -2 marks a raw checked pair
        val a = if (pairStart[ch + 1] == -2) v[ch] else first
        if (bits == 16) {
          if (a < -32768 || a > 32767 || second < -32768 || second > 32767) throw ApeCorrupt
          samples[o] = a; samples[o + 1] = second
          put16(w, a); put16(w + 2, second)
        } else {
          samples[o] = put24Raw(w, a); samples[o + 1] = put24Raw(w + 3, second)
        }
        o += 2; w += 2 * (bits / 8); ch += 2
        continue
      }
      val x = v[ch]
      when (bits) {
        16 -> { val s = x.toShort().toInt(); samples[o] = s; put16(w, s) }
        8 -> { val a = (x + 128) and 0xFF; samples[o] = a - 128; wav[w] = a.toByte() }
        else -> samples[o] = put24Raw(w, x)
      }
      o++; w += bits / 8; ch++
    }
  }

  /**
   * Prepare.cpp's layout for 3+ channels: 4ch = two mid/side pairs; 6+ch = L/R pair,
   * C/LFE stored raw (but range-checked at 16 bits), surround pair, rear pair (8+),
   * the rest raw. Other counts are all raw. pairStart[ch] == ch starts a pair;
   * the partner of a raw-but-checked pair is marked -2.
   */
  private fun multichannelPairs(): IntArray {
    val p = IntArray(channels) { -1 }
    fun pair(a: Int, raw: Boolean = false) { p[a] = a; p[a + 1] = if (raw) -2 else a }
    if (channels == 4) { pair(0); pair(2) } else if (channels >= 6) {
      pair(0); pair(2, raw = true); pair(4)
      if (channels >= 8) pair(6)
    }
    return p
  }

  private fun put16(w: Int, s: Int) { wav[w] = s.toByte(); wav[w + 1] = (s shr 8).toByte() }
  private fun put32(w: Int, s: Int) {
    wav[w] = s.toByte(); wav[w + 1] = (s shr 8).toByte(); wav[w + 2] = (s shr 16).toByte(); wav[w + 3] = (s shr 24).toByte()
  }

  /** Stereo/mono 24-bit: the SDK maps negatives as (v + 0x800000) | 0x800000. */
  private fun put24(w: Int, v: Int): Int = put24Raw(w, if (v < 0) (v + 0x800000) or 0x800000 else v)

  private fun put24Raw(w: Int, t: Int): Int {
    wav[w] = t.toByte(); wav[w + 1] = (t shr 8).toByte(); wav[w + 2] = (t shr 16).toByte()
    return (t shl 8) shr 8
  }
}

private const val CHUNK = 4096 // residuals decoded ahead of the NN filters

/** Daemon threads that die after 60 s idle, shared by all decoders. */
private val workers: ExecutorService by lazy {
  Executors.newCachedThreadPool { r -> Thread(r, "ape-nn-filter").apply { isDaemon = true } }
}

/** Thrown inside a frame decode for data the SDK would reject (caught, reported as a CRC failure). */
internal object ApeCorrupt : RuntimeException() {
  override fun fillInStackTrace(): Throwable = this
}

/**
 * The SDK's range decoder. The bitstream is a run of little-endian 32-bit words read
 * MSB-first; every read here is byte-aligned, so reset() just swaps each word back into
 * reading order once per frame.
 * State is unsigned 32-bit in the SDK, kept in Longs here so division stays unsigned.
 */
internal class ApeRangeDecoder(private val version: Int) {
  private var data = ByteArray(0) // frame bytes in logical (word-swapped back) order
  private var limit = 0
  private var pos = 0
  private var low = 0L
  private var range = 0L
  private var buffer = 0L
  private val totals = if (version >= 3990) TOTAL_2 else TOTAL_1
  private val widths = if (version >= 3990) WIDTH_2 else WIDTH_1
  private val table = if (version >= 3990) TABLE_2 else TABLE_1
  private var pivot = 0L

  fun reset(bytes: ByteArray, length: Int, skip: Int) {
    val words = (length + 3) ushr 2
    if (data.size < words * 4) data = ByteArray(words * 4 + 1024)
    val d = data
    for (w in 0 until words) {
      val o = w * 4
      for (b in 0..3) d[o + b] = if (o + 3 - b < length) bytes[o + 3 - b] else 0
    }
    limit = words * 4; pos = skip
  }

  private fun byte(): Int {
    val p = pos++
    return if (p < limit) data[p].toInt() and 0xFF else 0 // the SDK zero-fills past the read
  }

  fun readUInt32(): Int = (byte() shl 24) or (byte() shl 16) or (byte() shl 8) or byte()

  /** FlushBitArray: a dummy byte, then the first 8 bits of the code value. */
  fun start() {
    byte()
    buffer = byte().toLong()
    low = buffer shr 1
    range = 1L shl 7
  }

  private fun normalize() {
    while (range <= BOTTOM) {
      if (range == 0L) throw ApeCorrupt
      buffer = ((buffer shl 8) or byte().toLong()) and MASK
      low = ((low shl 8) and MASK) or ((buffer shr 1) and 0xFF)
      range = range shl 8
    }
  }

  private fun decodeFast(shift: Int): Long {
    normalize()
    range = range ushr shift
    return low / range
  }

  private fun decodeWithUpdate(shift: Int): Long {
    normalize()
    range = range ushr shift
    if (range == 0L) throw ApeCorrupt
    val r = low / range
    low -= r * range
    return r
  }

  private fun decodeDivide(divisor: Long): Long {
    normalize()
    range /= divisor
    if (range == 0L) throw ApeCorrupt
    val r = low / range
    low -= r * range
    return r
  }

  /** Decodes one signed residual; [state] holds k and kSum at [ch]*2. */
  fun decode(state: IntArray, ch: Int): Long {
    val kSum = state[ch * 2 + 1].toLong() and MASK
    var value: Long
    if (version >= 3990) {
      pivot = maxOf(kSum ushr 5, 1L)
      val overflow = decodeOverflow()
      val base = if (pivot >= 65536) {
        val pivotBits = 64 - java.lang.Long.numberOfLeadingZeros(pivot)
        val split = 1L shl (pivotBits - 16)
        val a = decodeDivide(pivot / split + 1)
        val b = decodeDivide(split)
        a * split + b
      } else {
        decodeDivide(pivot)
      }
      value = base + overflow * pivot
    } else {
      // 3.93-3.98: model symbol is the overflow, k picks the extra bits
      val total = decodeFast(16)
      if (total >= 65536) throw ApeCorrupt
      var overflow = table[total.toInt()].toInt()
      low = (low - range * totals[overflow]) and MASK
      range = (range * widths[overflow]) and MASK
      val k = state[ch * 2]
      val tempK: Int
      if (overflow == 63) {
        tempK = decodeWithUpdate(5).toInt()
        overflow = 0
      } else {
        tempK = if (k < 1) 0 else k - 1
      }
      value = if (tempK <= 16 || version < 3910) {
        decodeWithUpdate(tempK)
      } else {
        val x1 = decodeWithUpdate(16)
        val x2 = decodeWithUpdate(tempK - 16)
        x1 or (x2 shl 16)
      }
      value += overflow.toLong() shl tempK
    }

    val newSum = (kSum + (((value + 1) / 2) and MASK) - (((kSum + 16) and MASK) ushr 5)) and MASK
    state[ch * 2 + 1] = newSum.toInt()
    val k = state[ch * 2]
    if (newSum < K_SUM_MIN[k]) state[ch * 2] = k - 1
    else if (K_SUM_MIN[k + 1] != 0L && newSum >= K_SUM_MIN[k + 1]) state[ch * 2] = k + 1

    return if (value and 1L != 0L) (value shr 1) + 1 else -(value shr 1)
  }

  private fun decodeOverflow(): Long {
    while (true) {
      val total = decodeFast(16)
      if (total >= 65536) throw ApeCorrupt
      val overflow = table[total.toInt()].toInt()
      low = (low - range * totals[overflow]) and MASK
      range = (range * widths[overflow]) and MASK
      if (overflow != 63) return overflow.toLong()
      // escape: a full 32-bit overflow value; 1 signals "retry with pivot 32768"
      val big = (((decodeWithUpdate(16) shl 16) and MASK) or decodeWithUpdate(16)) and MASK
      if (big != 1L) return big
      pivot = 32768
    }
  }

  companion object {
    private const val MASK = 0xFFFFFFFFL
    private const val BOTTOM = 1L shl 23

    // SDK RANGE_TOTAL_1/2 (65 entries; each tail counts up by one to 65536). Widths are the gaps.
    private val TOTAL_1 = longArrayOf(0, 14824, 28224, 39348, 47855, 53994, 58171, 60926, 62682, 63786, 64463, 64878,
      65126, 65276, 65365, 65419, 65450, 65469, 65480, 65487, 65491, 65493) + LongArray(43) { 65494L + it }
    private val TOTAL_2 = longArrayOf(0, 19578, 36160, 48417, 56323, 60899, 63265, 64435, 64971, 65232, 65351, 65416,
      65447, 65466, 65476, 65482, 65485, 65488, 65490) + LongArray(46) { 65491L + it }
    private val WIDTH_1 = LongArray(64) { TOTAL_1[it + 1] - TOTAL_1[it] }
    private val WIDTH_2 = LongArray(64) { TOTAL_2[it + 1] - TOTAL_2[it] }
    private val TABLE_1 = overflowTable(TOTAL_1)
    private val TABLE_2 = overflowTable(TOTAL_2)

    private val K_SUM_MIN = LongArray(32).also {
      for (i in 1..27) it[i] = 1L shl (i + 4)
    }

    /** total -> symbol lookup (SDK RangeOverflowTable). */
    private fun overflowTable(totals: LongArray): ByteArray {
      val t = ByteArray(65536)
      var s = 0
      for (z in 0 until 65536) {
        if (z >= totals[s + 1]) s++
        t[z] = s.toByte()
      }
      return t
    }
  }
}
