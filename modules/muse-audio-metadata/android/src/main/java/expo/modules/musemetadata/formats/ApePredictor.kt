// Monkey's Audio (APE) prediction stages: NN filters and the per-channel predictors.
// Ported from the Monkey's Audio SDK 13.46 (NewPredictor.cpp, NNFilter*.cpp/h,
// Interim.cpp, Old/NewPredictorOld.cpp, ScaledFirstOrderFilter.h).
// Copyright 2000-2026 Matthew T. Ashland. All rights reserved.
// Used under the 3-clause BSD license (see THIRD_PARTY_NOTICES).
//
// Bit-exactness notes: the SDK's `int` maths wraps at 32 bits and its `short`
// filter weights wrap at 16 bits; Kotlin Int does the same, and weights are
// re-wrapped to 16 bits after each update. 32-bit audio uses the SDK's int64
// template (the *Long classes), where some sign tests read bit 31 of a 64-bit
// value on purpose.
//
// Speed: the SDK runs NN filters sample by sample inside the predictor. They only
// see their own channel's residuals, so here each filter runs over a whole chunk
// of residuals at a time (same results, far friendlier to the JIT), then the cheap
// stage-1 predictor runs per sample.
package expo.modules.musemetadata.formats

private const val WINDOW = 256 // predictor roll-buffer window
private const val HISTORY = 8
private const val NN_WINDOW = 512

internal abstract class ApePredictor {
  abstract fun flush()
  /** Runs the NN filter cascade over residuals [res] (0 until [n]) in place. */
  abstract fun filter(res: LongArray, n: Int)
  /** Stage 1: [a] is a filtered residual, [b] the cross-channel input (0 when unused). */
  abstract fun predict(a: Long, b: Int): Int
}

/** (order, shift) pairs, largest filter first; decoding applies them last-to-first. */
internal fun nnFilterSpec(level: Int): IntArray = when (level) {
  1000 -> intArrayOf()
  2000 -> intArrayOf(16, 11)
  3000 -> intArrayOf(64, 11)
  4000 -> intArrayOf(256, 13, 32, 10)
  5000 -> intArrayOf(1024 + 256, 15, 256, 13, 16, 11)
  else -> throw FormatException("APE: unknown compression level $level")
}

private fun saturateShort(v: Int): Int {
  val s = v.toShort().toInt()
  return if (s == v) s else ((v shr 31) xor 0x7FFF).toShort().toInt()
}

private fun saturateShort(v: Long): Int {
  val s = v.toShort().toLong()
  return if (s == v) s.toInt() else ((v shr 63).toInt() xor 0x7FFF).toShort().toInt()
}

/** NN filter for 8/16/24-bit audio (SDK CNNFilter<int, short>). */
internal class ApeNNFilter(private val order: Int, private val shift: Int, private val newDelta: Boolean) {
  private val round = 1 shl (shift - 1)
  private val m = IntArray(order) // 16-bit weights, kept sign-extended
  private val input = IntArray(NN_WINDOW + order) // saturated 16-bit history
  private val delta = IntArray(NN_WINDOW + order)
  private val window = IntArray(order) // delta window copied to index 0, see run()
  private var pos = order
  private var average = 0
  /** Interim mode: see ApePredictor3950.interim. */
  var interim = false

  fun flush() {
    m.fill(0)
    input.fill(0, 0, order + 1)
    delta.fill(0, 0, order + 1)
    pos = order
    average = 0
  }

  fun run(buf: IntArray, n: Int) {
    val m = m; val input = input; val delta = delta; val order = order
    var pos = pos; var average = average
    for (s in 0 until n) {
      val nInput = buf[s]
      val base = pos - order
      var dot = 0
      for (i in 0 until order) dot += input[base + i] * m[i]
      val out = if (interim) (nInput + ((dot.toLong() + round) shr shift)).toInt() else nInput + ((dot + round) shr shift)

      // adapt the weights toward the sign of the residual (16-bit wrapping, like the SDK's shorts).
      // Copying the delta window first lets the JIT vectorize the update (no offset aliasing);
      // short filters skip the copy, it costs more than it saves there.
      if (nInput != 0) {
        if (order > 32) {
          System.arraycopy(delta, base, window, 0, order)
          if (nInput < 0) for (i in 0 until order) m[i] = ((m[i] + window[i]) shl 16) shr 16
          else for (i in 0 until order) m[i] = ((m[i] - window[i]) shl 16) shr 16
        } else {
          if (nInput < 0) for (i in 0 until order) m[i] = ((m[i] + delta[base + i]) shl 16) shr 16
          else for (i in 0 until order) m[i] = ((m[i] - delta[base + i]) shl 16) shr 16
        }
      }

      if (newDelta || interim) {
        val abs = if (out < 0) -out else out
        delta[pos] = when {
          abs > average * 3 -> ((out shr 25) and 64) - 32
          abs > (average * 4) / 3 -> ((out shr 26) and 32) - 16
          abs > 0 -> ((out shr 27) and 16) - 8
          else -> 0
        }
        average += (abs - average) / 16
        delta[pos - 1] = delta[pos - 1] shr 1
        delta[pos - 2] = delta[pos - 2] shr 1
        delta[pos - 8] = delta[pos - 8] shr 1
      } else {
        delta[pos] = if (out == 0) 0 else ((out shr 28) and 8) - 4
        delta[pos - 4] = delta[pos - 4] shr 1
        delta[pos - 8] = delta[pos - 8] shr 1
      }
      input[pos] = saturateShort(out)

      pos++
      if (pos == NN_WINDOW + order) {
        System.arraycopy(input, NN_WINDOW, input, 0, order)
        System.arraycopy(delta, NN_WINDOW, delta, 0, order)
        pos = order
      }
      buf[s] = out
    }
    this.pos = pos; this.average = average
  }
}

/** NN filter for 32-bit audio (SDK CNNFilter<int64, int>). */
internal class ApeNNFilterLong(private val order: Int, private val shift: Int) {
  private val round = 1L shl (shift - 1)
  private val m = IntArray(order)
  private val input = IntArray(NN_WINDOW + order)
  private val delta = IntArray(NN_WINDOW + order)
  private val window = IntArray(order)
  private var pos = order
  private var average = 0L

  fun flush() {
    m.fill(0)
    input.fill(0, 0, order + 1)
    delta.fill(0, 0, order + 1)
    pos = order
    average = 0
  }

  fun run(buf: LongArray, n: Int) {
    val m = m; val input = input; val delta = delta; val order = order
    var pos = pos; var average = average
    for (s in 0 until n) {
      val nInput = buf[s]
      val base = pos - order
      var dot = 0L
      for (i in 0 until order) dot += (input[base + i] * m[i]).toLong() // 32-bit product, 64-bit sum
      val out = nInput + ((dot + round) shr shift)

      if (nInput != 0L) {
        if (order > 32) {
          System.arraycopy(delta, base, window, 0, order)
          if (nInput < 0) for (i in 0 until order) m[i] += window[i] else for (i in 0 until order) m[i] -= window[i]
        } else {
          if (nInput < 0) for (i in 0 until order) m[i] += delta[base + i] else for (i in 0 until order) m[i] -= delta[base + i]
        }
      }

      val abs = if (out < 0) -out else out
      delta[pos] = when {
        abs > average * 3 -> ((out shr 25) and 64) - 32
        abs > (average * 4) / 3 -> ((out shr 26) and 32) - 16
        abs > 0 -> ((out shr 27) and 16) - 8
        else -> 0L
      }.toInt()
      average += (abs - average) / 16
      delta[pos - 1] = delta[pos - 1] shr 1
      delta[pos - 2] = delta[pos - 2] shr 1
      delta[pos - 8] = delta[pos - 8] shr 1
      input[pos] = saturateShort(out)

      pos++
      if (pos == NN_WINDOW + order) {
        System.arraycopy(input, NN_WINDOW, input, 0, order)
        System.arraycopy(delta, NN_WINDOW, delta, 0, order)
        pos = order
      }
      buf[s] = out
    }
    this.pos = pos; this.average = average
  }
}

private fun intFilters(level: Int, version: Int): Array<ApeNNFilter> {
  val spec = nnFilterSpec(level)
  val count = spec.size / 2
  return Array(count) { i -> ApeNNFilter(spec[(count - 1 - i) * 2], spec[(count - 1 - i) * 2 + 1], version >= 3980) }
}

/** Shared chunk plumbing for the 32-bit-maths predictors: residuals are truncated to Int first, as in the SDK. */
internal abstract class ApeIntPredictor(protected val filters: Array<ApeNNFilter>) : ApePredictor() {
  private var work = IntArray(0)

  override fun filter(res: LongArray, n: Int) {
    if (filters.isEmpty()) return // predict() truncates
    if (work.size < n) work = IntArray(n)
    val w = work
    for (i in 0 until n) w[i] = res[i].toInt()
    for (f in filters) f.run(w, n)
    for (i in 0 until n) res[i] = w[i].toLong()
  }
}

/** File versions 3950+ at 8/16/24 bits (SDK CPredictorDecompress3950toCurrent<int, short>). */
internal class ApePredictor3950(level: Int, version: Int, private val bits: Int) : ApeIntPredictor(intFilters(level, version)) {
  private val pA = IntArray(WINDOW + HISTORY)
  private val pB = IntArray(WINDOW + HISTORY)
  private val adaptA = IntArray(WINDOW + HISTORY)
  private val adaptB = IntArray(WINDOW + HISTORY)
  private val mA = IntArray(HISTORY)
  private val mB = IntArray(HISTORY)
  private var pos = HISTORY
  private var lastA = 0
  private var stage1A = 0
  private var stage1B = 0

  /**
   * Interim mode decodes 24-bit files from Monkey's Audio 5.01-8.51, which by accident
   * did part of the maths in 64 bits. The SDK only finds out from a CRC failure.
   */
  var interim = false
    set(value) {
      field = value
      for (f in filters) f.interim = value
    }

  override fun flush() {
    for (f in filters) f.flush()
    pA.fill(0, 0, HISTORY + 1); pB.fill(0, 0, HISTORY + 1)
    adaptA.fill(0, 0, HISTORY + 1); adaptB.fill(0, 0, HISTORY + 1)
    mA.fill(0); mB.fill(0)
    mA[0] = 360; mA[1] = 317; mA[2] = -109; mA[3] = 98
    pos = HISTORY
    lastA = 0; stage1A = 0; stage1B = 0
  }

  override fun predict(a: Long, b: Int): Int {
    if (pos == WINDOW + HISTORY) {
      System.arraycopy(pA, WINDOW, pA, 0, HISTORY); System.arraycopy(pB, WINDOW, pB, 0, HISTORY)
      System.arraycopy(adaptA, WINDOW, adaptA, 0, HISTORY); System.arraycopy(adaptB, WINDOW, adaptB, 0, HISTORY)
      pos = HISTORY
    }
    val nA = a.toInt()
    val p = pos
    val pA = pA; val pB = pB; val mA = mA; val mB = mB
    pA[p] = lastA
    pA[p - 1] = pA[p] - pA[p - 1]
    pB[p] = b - ((stage1B * 31) shr 5) // first-order filter of the other channel
    stage1B = b
    pB[p - 1] = pB[p] - pB[p - 1]

    val currentA = if (interim && bits > 16) {
      val predA = pA[p].toLong() * mA[0] + pA[p - 1].toLong() * mA[1] + pA[p - 2].toLong() * mA[2] + pA[p - 3].toLong() * mA[3]
      val predB = pB[p].toLong() * mB[0] + pB[p - 1].toLong() * mB[1] + pB[p - 2].toLong() * mB[2] +
        pB[p - 3].toLong() * mB[3] + pB[p - 4].toLong() * mB[4]
      nA + ((predA + (predB shr 1)) shr 10).toInt()
    } else {
      val predA = pA[p] * mA[0] + pA[p - 1] * mA[1] + pA[p - 2] * mA[2] + pA[p - 3] * mA[3]
      val predB = pB[p] * mB[0] + pB[p - 1] * mB[1] + pB[p - 2] * mB[2] + pB[p - 3] * mB[3] + pB[p - 4] * mB[4]
      nA + ((predA + (predB shr 1)) shr 10)
    }

    adaptA[p] = if (pA[p] != 0) ((pA[p] shr 30) and 2) - 1 else 0
    adaptA[p - 1] = if (pA[p - 1] != 0) ((pA[p - 1] shr 30) and 2) - 1 else 0
    adaptB[p] = if (pB[p] != 0) ((pB[p] shr 30) and 2) - 1 else 0
    adaptB[p - 1] = if (pB[p - 1] != 0) ((pB[p - 1] shr 30) and 2) - 1 else 0

    if (nA != 0) {
      val dir = if (nA < 0) 1 else -1
      val adaptA = adaptA; val adaptB = adaptB
      mA[0] += adaptA[p] * dir; mA[1] += adaptA[p - 1] * dir
      mA[2] += adaptA[p - 2] * dir; mA[3] += adaptA[p - 3] * dir
      mB[0] += adaptB[p] * dir; mB[1] += adaptB[p - 1] * dir; mB[2] += adaptB[p - 2] * dir
      mB[3] += adaptB[p - 3] * dir; mB[4] += adaptB[p - 4] * dir
    }

    stage1A = currentA + ((stage1A * 31) shr 5)
    lastA = currentA
    pos = p + 1
    return stage1A
  }
}

/** File versions 3950+ at 32 bits (SDK CPredictorDecompress3950toCurrent<int64, int>). */
internal class ApePredictor3950Long(level: Int) : ApePredictor() {
  private val filters: Array<ApeNNFilterLong>
  private val pA = LongArray(WINDOW + HISTORY)
  private val pB = LongArray(WINDOW + HISTORY)
  private val adaptA = LongArray(WINDOW + HISTORY)
  private val adaptB = LongArray(WINDOW + HISTORY)
  private val mA = LongArray(HISTORY)
  private val mB = LongArray(HISTORY)
  private var pos = HISTORY
  private var lastA = 0L
  private var stage1A = 0
  private var stage1B = 0

  init {
    val spec = nnFilterSpec(level)
    val count = spec.size / 2
    filters = Array(count) { i -> ApeNNFilterLong(spec[(count - 1 - i) * 2], spec[(count - 1 - i) * 2 + 1]) }
  }

  override fun flush() {
    for (f in filters) f.flush()
    pA.fill(0, 0, HISTORY + 1); pB.fill(0, 0, HISTORY + 1)
    adaptA.fill(0, 0, HISTORY + 1); adaptB.fill(0, 0, HISTORY + 1)
    mA.fill(0); mB.fill(0)
    mA[0] = 360; mA[1] = 317; mA[2] = -109; mA[3] = 98
    pos = HISTORY
    lastA = 0; stage1A = 0; stage1B = 0
  }

  override fun filter(res: LongArray, n: Int) {
    for (f in filters) f.run(res, n)
  }

  override fun predict(a: Long, b: Int): Int {
    if (pos == WINDOW + HISTORY) {
      System.arraycopy(pA, WINDOW, pA, 0, HISTORY); System.arraycopy(pB, WINDOW, pB, 0, HISTORY)
      System.arraycopy(adaptA, WINDOW, adaptA, 0, HISTORY); System.arraycopy(adaptB, WINDOW, adaptB, 0, HISTORY)
      pos = HISTORY
    }
    val nA = a
    val p = pos
    val pA = pA; val pB = pB; val mA = mA; val mB = mB
    pA[p] = lastA
    pA[p - 1] = pA[p] - pA[p - 1]
    pB[p] = b.toLong() - ((stage1B.toLong() * 31) shr 5)
    stage1B = b
    pB[p - 1] = pB[p] - pB[p - 1]

    val predA = pA[p] * mA[0] + pA[p - 1] * mA[1] + pA[p - 2] * mA[2] + pA[p - 3] * mA[3]
    val predB = pB[p] * mB[0] + pB[p - 1] * mB[1] + pB[p - 2] * mB[2] + pB[p - 3] * mB[3] + pB[p - 4] * mB[4]
    val currentA = nA + ((predA + (predB shr 1)) shr 10)

    // (x >> 30) & 2 on int64 reads bit 31, not the sign: kept as the SDK has it
    adaptA[p] = if (pA[p] != 0L) ((pA[p] shr 30) and 2) - 1 else 0
    adaptA[p - 1] = if (pA[p - 1] != 0L) ((pA[p - 1] shr 30) and 2) - 1 else 0
    adaptB[p] = if (pB[p] != 0L) ((pB[p] shr 30) and 2) - 1 else 0
    adaptB[p - 1] = if (pB[p - 1] != 0L) ((pB[p - 1] shr 30) and 2) - 1 else 0

    if (nA != 0L) {
      val dir = if (nA < 0) 1L else -1L
      val adaptA = adaptA; val adaptB = adaptB
      mA[0] += adaptA[p] * dir; mA[1] += adaptA[p - 1] * dir
      mA[2] += adaptA[p - 2] * dir; mA[3] += adaptA[p - 3] * dir
      mB[0] += adaptB[p] * dir; mB[1] += adaptB[p - 1] * dir; mB[2] += adaptB[p - 2] * dir
      mB[3] += adaptB[p - 3] * dir; mB[4] += adaptB[p - 4] * dir
    }

    stage1A = (currentA + ((stage1A.toLong() * 31) shr 5)).toInt()
    lastA = currentA
    pos = p + 1
    return stage1A
  }
}

/** File versions 3930..3949 (SDK CPredictorDecompress3930to3950). */
internal class ApePredictor3930(level: Int, version: Int) : ApeIntPredictor(intFilters(level, version)) {
  private val buffer = IntArray(WINDOW + HISTORY)
  private val m = IntArray(4)
  private var pos = HISTORY
  private var last = 0

  init {
    if (level >= 5000) throw FormatException("APE: insane level needs file version 3950+")
  }

  override fun flush() {
    for (f in filters) f.flush()
    buffer.fill(0, 0, HISTORY + 1)
    m[0] = 360; m[1] = 317; m[2] = -109; m[3] = 98
    pos = HISTORY
    last = 0
  }

  override fun predict(a: Long, b: Int): Int {
    if (pos == WINDOW + HISTORY) {
      System.arraycopy(buffer, WINDOW, buffer, 0, HISTORY)
      pos = HISTORY
    }
    val n = a.toInt()
    val buf = buffer; val m = m; val p = pos
    val p1 = buf[p - 1]
    val p2 = buf[p - 1] - buf[p - 2]
    val p3 = buf[p - 2] - buf[p - 3]
    val p4 = buf[p - 3] - buf[p - 4]
    buf[p] = n + ((p1 * m[0] + p2 * m[1] + p3 * m[2] + p4 * m[3]) shr 9)
    if (n != 0) {
      val dir = if (n < 0) 1 else -1
      m[0] += (((p1 shr 30) and 2) - 1) * dir
      m[1] += (((p2 shr 30) and 2) - 1) * dir
      m[2] += (((p3 shr 30) and 2) - 1) * dir
      m[3] += (((p4 shr 30) and 2) - 1) * dir
    }
    last = buf[p] + ((last * 31) shr 5)
    pos = p + 1
    return last
  }
}
