// Test-only Monkey's Audio ENCODER, ported from the SDK's compress path (BitArray.cpp,
// APECompressCore.cpp, APECompressCreate.cpp, Prepare.cpp, NewPredictor.cpp CPredictorCompress,
// NNFilterGeneric.cpp CompressGeneric). Copyright 2000-2026 Matthew T. Ashland, 3-clause BSD.
// Purpose: make APE files in every level / depth / channel layout. ffmpeg decodes them and
// must return the source PCM (that validates this encoder), then the Muse decoder is checked
// against ffmpeg. Not shipped.
import java.io.File
import java.util.zip.CRC32

const val MASK = 0xFFFFFFFFL
val TOTAL = longArrayOf(0, 19578, 36160, 48417, 56323, 60899, 63265, 64435, 64971, 65232, 65351, 65416,
  65447, 65466, 65476, 65482, 65485, 65488, 65490) + LongArray(46) { 65491L + it }
val WIDTH = LongArray(64) { TOTAL[it + 1] - TOTAL[it] }

class RangeEncoder {
  var out = ByteArray(1 shl 16)
  var bytePos = 0 // logical byte index (frames are concatenated logically, then word-swapped)
  private var low = 0L; private var range = 0L; private var buffer = 0L; private var help = 0L

  private fun ensure(n: Int) { if (bytePos + n + 16 > out.size) out = out.copyOf(maxOf(out.size * 2, bytePos + n + 16)) }
  private fun putc(v: Long) { ensure(1); out[bytePos++] = v.toByte() }
  fun putU32(v: Long) { putc(v ushr 24); putc(v ushr 16); putc(v ushr 8); putc(v) }

  fun flush() { low = 0; range = 1L shl 31; buffer = 0; help = 0 }

  private fun normalize() {
    while (range <= (1L shl 23)) {
      if (low < (0xFFL shl 23)) {
        putc(buffer); while (help > 0) { putc(0xFF); help-- }
        buffer = (low ushr 23) and 0xFF
      } else if (low and (1L shl 31) != 0L) {
        putc(buffer + 1); ensure(help.toInt()); bytePos += help.toInt(); help = 0 // carry turns the 0xFFs into zeros
        buffer = (low ushr 23) and 0xFF
      } else help++
      low = (low shl 8) and ((1L shl 31) - 1)
      range = (range shl 8) and MASK
    }
  }
  private fun encodeFast(width: Long, total: Long, shift: Int) { normalize(); val t = range ushr shift; range = (t * width) and MASK; low = (low + t * total) and MASK }
  private fun encodeDirect(value: Long, shift: Int) { normalize(); range = range ushr shift; low = (low + range * value) and MASK }

  fun encode(v: Long, state: LongArray, ch: Int) {
    val n = if (v > 0) v * 2 - 1 else -v * 2
    var pivot = maxOf(state[ch] ushr 5, 1L)
    var overflow = n / pivot
    if (overflow > MASK) {
      pivot = 32768; overflow = n / pivot
      encodeFast(WIDTH[63], TOTAL[63], 16); encodeDirect(0, 16); encodeDirect(1, 16)
    }
    val base = n - overflow * pivot
    val k = state[ch]
    state[ch] = (k + (((n + 1) / 2) and MASK) - (((k + 16) and MASK) ushr 5)) and MASK
    if (overflow < 63) encodeFast(WIDTH[overflow.toInt()], TOTAL[overflow.toInt()], 16)
    else { encodeFast(WIDTH[63], TOTAL[63], 16); encodeDirect((overflow ushr 16) and 0xFFFF, 16); encodeDirect(overflow and 0xFFFF, 16) }
    if (pivot >= 65536) {
      var bits = 0; while ((pivot ushr bits) > 0) bits++
      val split = 1L shl (bits - 16)
      val a = pivot / split + 1
      normalize(); var t = range / a; range = t; low = (low + t * (base / split)) and MASK
      normalize(); t = range / split; range = t; low = (low + t * (base % split)) and MASK
    } else {
      normalize(); val t = range / pivot; range = t; low = (low + t * base) and MASK
    }
  }

  fun finish() {
    normalize()
    val t = (low ushr 23) + 1
    if (t > 0xFF) { putc(buffer + 1); while (help > 0) { putc(0); help-- } }
    else { putc(buffer); while (help > 0) { putc(0xFF); help-- } }
    putc(t and 0xFF); putc(0); putc(0); putc(0)
  }
}

fun sat16(v: Long): Int { val s = v.toShort().toLong(); return if (s == v) s.toInt() else ((v shr 63).toInt() xor 0x7FFF).toShort().toInt() }

/** NN filter compress, both templates: wide = CNNFilter<int64,int>. */
class NNEnc(val order: Int, val shift: Int, val wide: Boolean) {
  val m = IntArray(order); val input = IntArray(512 + order); val delta = IntArray(512 + order)
  var pos = order; var avg = 0L
  fun flush() { m.fill(0); input.fill(0, 0, order + 1); delta.fill(0, 0, order + 1); pos = order; avg = 0 }
  fun compress(nIn: Long): Long {
    val base = pos - order
    val out: Long
    if (wide) {
      var dot = 0L; for (i in 0 until order) dot += (input[base + i] * m[i]).toLong()
      out = nIn - ((dot + (1L shl (shift - 1))) shr shift)
      if (out < 0) for (i in 0 until order) m[i] += delta[base + i] else if (out > 0) for (i in 0 until order) m[i] -= delta[base + i]
    } else {
      var dot = 0; for (i in 0 until order) dot += input[base + i] * m[i]
      out = (nIn.toInt() - ((dot + (1 shl (shift - 1))) shr shift)).toLong()
      if (out < 0) for (i in 0 until order) m[i] = (m[i] + delta[base + i]).toShort().toInt()
      else if (out > 0) for (i in 0 until order) m[i] = (m[i] - delta[base + i]).toShort().toInt()
    }
    // APE_UPDATE_DELTA_NEW(nInput)
    if (wide) {
      val v = nIn; val a = if (v < 0) -v else v
      delta[pos] = (if (a > avg * 3) ((v shr 25) and 64) - 32 else if (a > (avg * 4) / 3) ((v shr 26) and 32) - 16 else if (a > 0) ((v shr 27) and 16) - 8 else 0).toInt()
      avg += (a - avg) / 16
    } else {
      val v = nIn.toInt(); val a = if (v < 0) -v else v; val av = avg.toInt()
      delta[pos] = if (a > av * 3) ((v shr 25) and 64) - 32 else if (a > (av * 4) / 3) ((v shr 26) and 32) - 16 else if (a > 0) ((v shr 27) and 16) - 8 else 0
      avg = (av + (a - av) / 16).toLong()
    }
    delta[pos - 1] = delta[pos - 1] shr 1; delta[pos - 2] = delta[pos - 2] shr 1; delta[pos - 8] = delta[pos - 8] shr 1
    input[pos] = sat16(if (wide) nIn else nIn.toInt().toLong())
    pos++
    if (pos == 512 + order) { System.arraycopy(input, 512, input, 0, order); System.arraycopy(delta, 512, delta, 0, order); pos = order }
    return out
  }
}

/** CPredictorCompress; wide = <int64,int> (32-bit), else <int,short> with 32-bit wrapping. */
class PredEnc(level: Int, val wide: Boolean) {
  val nn: List<NNEnc> = when (level) {
    1000 -> listOf(); 2000 -> listOf(NNEnc(16, 11, wide)); 3000 -> listOf(NNEnc(64, 11, wide))
    4000 -> listOf(NNEnc(256, 13, wide), NNEnc(32, 10, wide))
    else -> listOf(NNEnc(1280, 15, wide), NNEnc(256, 13, wide), NNEnc(16, 11, wide))
  }
  val p = LongArray(256 + 10); val ad = LongArray(256 + 9); val m = LongArray(9)
  var pp = 10; var pa = 9; var idx = 0; var lastA = 0; var lastB = 0
  fun w(x: Long) = if (wide) x else x.toInt().toLong() // INTTYPE wrap
  fun flush() {
    nn.forEach { it.flush() }; p.fill(0, 0, 11); ad.fill(0, 0, 10); m.fill(0)
    m[8] = 360; m[7] = 317; m[6] = -109; m[5] = 98; pp = 10; pa = 9; idx = 0; lastA = 0; lastB = 0
  }
  fun compress(a: Int, b: Int): Long {
    if (idx == 256) { System.arraycopy(p, pp - 10, p, 0, 10); pp = 10; System.arraycopy(ad, pa - 9, ad, 0, 9); pa = 9; idx = 0 }
    val nA = w(a.toLong() - ((lastA.toLong() * 31) shr 5)); lastA = a
    val nB = w(b.toLong() - ((lastB.toLong() * 31) shr 5)); lastB = b
    p[pp] = nA; p[pp - 2] = w(p[pp - 1] - p[pp - 2]); p[pp - 5] = nB; p[pp - 6] = w(p[pp - 5] - p[pp - 6])
    val predA = w(p[pp - 1] * m[8] + p[pp - 2] * m[7] + p[pp - 3] * m[6] + p[pp - 4] * m[5])
    val predB = w(p[pp - 5] * m[4] + p[pp - 6] * m[3] + p[pp - 7] * m[2] + p[pp - 8] * m[1] + p[pp - 9] * m[0])
    var out = w(nA - w((w(predA + (predB shr 1))) shr 10))
    fun sgn(x: Long) = if (x != 0L) ((x shr 30) and 2) - 1 else 0L
    ad[pa] = sgn(p[pp - 1]); ad[pa - 1] = sgn(p[pp - 2]); ad[pa - 4] = sgn(p[pp - 5]); ad[pa - 5] = sgn(p[pp - 6])
    val dir = if (out < 0) 1L else if (out > 0) -1L else 0L
    for (k in 0 until 9) m[k] = w(m[k] + ad[pa - 8 + k] * dir)
    for (f in nn) out = f.compress(out)
    pp++; pa++; idx++
    return out
  }
}

/** Interleaved signed samples -> .ape bytes (file version 3990, WAV header synthesized on decode). */
fun encodeApe(pcm: IntArray, channels: Int, bits: Int, rate: Int, level: Int, float: Boolean = false): ByteArray {
  val bpf = when (level) { 4000 -> 73728 * 4; 5000 -> 73728 * 16; else -> 73728 }
  val total = pcm.size / channels
  val frames = (total + bpf - 1) / bpf
  val bps = bits / 8
  val enc = RangeEncoder()
  val seek = IntArray(frames)
  val preds = Array(channels) { PredEnc(level, bits == 32) }
  val state = LongArray(channels)
  val data = Array(channels) { IntArray(bpf) }
  val raw = ByteArray(bpf * channels * bps)
  for (fi in 0 until frames) {
    val start = fi * bpf; val n = minOf(bpf, total - start)
    // WAV bytes for the CRC, and the SDK's Prepare (x = R + y/2, y = L - R for pairs)
    var o = 0
    for (i in 0 until n * channels) {
      val v = pcm[start * channels + i]
      when (bits) { 8 -> raw[o++] = (v + 128).toByte(); else -> for (b in 0 until bps) raw[o++] = (v shr (8 * b)).toByte() }
    }
    val crc = CRC32().apply { update(raw, 0, n * channels * bps) }.value
    fun s(i: Int, ch: Int) = pcm[(start + i) * channels + ch]
    var special = 0
    val pairs = BooleanArray(channels)
    if (channels == 2 && bits != 0) { pairs[0] = true }
    else if (channels == 4 && bits >= 16 && bits != 32) { pairs[0] = true; pairs[2] = true }
    else if (channels >= 6 && bits >= 16 && bits != 32) { pairs[0] = true; pairs[4] = true; if (channels >= 8) pairs[6] = true }
    for (i in 0 until n) {
      var ch = 0
      while (ch < channels) {
        if (pairs[ch]) { val r = s(i, ch); val l = s(i, ch + 1); data[ch + 1][i] = l - r; data[ch][i] = r + (l - r) / 2; ch += 2 }
        else { data[ch][i] = s(i, ch); ch++ }
      }
    }
    if (bits == 16 && channels == 2) {
      var lp = 0; var rp = 0
      for (i in 0 until n) { lp = maxOf(lp, Math.abs(s(i, 1))); rp = maxOf(rp, Math.abs(s(i, 0))) }
      if (lp == 0) special = special or 1
      if (rp == 0) special = special or 2
      if ((0 until n).all { data[1][it] == 0 }) special = special or 4
    } else if (bits == 16 && channels == 1) {
      if ((0 until n).all { data[0][it] == 0 }) special = 1
    }
    // frames start where the previous one ended (logical byte stream)
    seek[fi] = enc.bytePos
    var c = (crc ushr 1)
    if (special != 0) c = c or 0x80000000L
    enc.putU32(c)
    if (special != 0) enc.putU32(special.toLong())
    if (special != 0) println("  frame $fi special=$special")
    for (ch in 0 until channels) { preds[ch].flush(); state[ch] = 16384 }
    enc.flush()
    if (channels == 2) {
      val ex = !(special and 1 != 0 && special and 2 != 0); val ey = ex && special and 4 == 0
      if (ex && ey) {
        var lastX = 0
        for (z in 0 until n) {
          enc.encode(preds[1].compress(data[1][z], lastX), state, 1)
          enc.encode(preds[0].compress(data[0][z], data[1][z]), state, 0)
          lastX = data[0][z]
        }
      } else if (ex) for (z in 0 until n) enc.encode(preds[0].compress(data[0][z], 0), state, 0)
    } else if (channels == 1) {
      if (special == 0) for (z in 0 until n) enc.encode(preds[0].compress(data[0][z], 0), state, 0)
    } else {
      for (z in 0 until n) for (ch in 0 until channels) enc.encode(preds[ch].compress(data[ch][z], 0), state, ch)
    }
    enc.finish()
  }
  // trailing word, then store the logical stream as little-endian 32-bit words
  val dataLen = enc.bytePos / 4 * 4 + 4 // the SDK ends with one word holding the last 0..3 bytes
  val stream = enc.out.copyOf(dataLen)
  for (i in 0 until dataLen step 4) { var t = stream[i]; stream[i] = stream[i + 3]; stream[i + 3] = t; t = stream[i + 1]; stream[i + 1] = stream[i + 2]; stream[i + 2] = t }
  val head = 52 + 24 + frames * 4
  val f = java.io.ByteArrayOutputStream()
  fun u16(v: Int) { f.write(v and 0xFF); f.write((v shr 8) and 0xFF) }
  fun u32(v: Long) { u16((v and 0xFFFF).toInt()); u16(((v shr 16) and 0xFFFF).toInt()) }
  f.write(if (float) "MACF".toByteArray() else "MAC ".toByteArray()); u16(3990); u16(13460)
  u32(52); u32(24); u32(frames * 4L); u32(0); u32(dataLen.toLong()); u32(0); u32(0); f.write(ByteArray(16))
  u16(level); u16(32 or (if (float) 1 shl 12 else 0)); u32(bpf.toLong()); u32((total - (frames - 1).toLong() * bpf)); u32(frames.toLong())
  u16(bits); u16(channels); u32(rate.toLong())
  for (s in seek) u32(head.toLong() + s)
  f.write(stream)
  return f.toByteArray()
}

fun floatTransform(v: Int): Int {
  var out = (v and 0xC3FFFFFF.toInt()) or ((v and 0x3C000000).inv() xor 0xC3FFFFFF.toInt())
  if (out < 0) out = out.inv() or Int.MIN_VALUE
  return out
}

/** Deterministic test signal: tones + noise, with silent, pseudo-stereo and full-scale stretches. */
fun signal(seconds: Double, rate: Int, channels: Int, bits: Int, seed: Long, segSeconds: Double = 0.5): IntArray {
  val n = (seconds * rate).toInt()
  val out = IntArray(n * channels)
  val r = java.util.Random(seed)
  val max = if (bits == 32) Int.MAX_VALUE.toDouble() else ((1L shl (bits - 1)) - 1).toDouble()
  val min = if (bits == 32) Int.MIN_VALUE.toLong() else -(1L shl (bits - 1))
  for (i in 0 until n) {
    val t = i.toDouble() / rate
    val seg = (t / segSeconds).toInt() % 7
    for (ch in 0 until channels) {
      val tone = 0.4 * Math.sin(2 * Math.PI * (220.0 * (ch + 1) + 40 * Math.sin(t)) * t) + 0.2 * Math.sin(2 * Math.PI * 3150.0 * t + ch)
      var v = when (seg) {
        0, 1, 4 -> tone + 0.05 * r.nextGaussian()
        2 -> 0.0 // silence
        3 -> if (ch == 0 || channels != 2) tone else Double.NaN // pseudo stereo: copy of channel 0
        5 -> r.nextDouble() * 2 - 1 // full-scale noise
        else -> if (Math.sin(2 * Math.PI * 100 * t) > 0) 1.2 else -1.2 // clipped square
      }
      val s = if (v.isNaN()) out[i * channels] else maxOf(min, minOf(max.toLong(), Math.round(v * max))).toInt()
      out[i * channels + ch] = s
    }
  }
  return out
}

fun main(args: Array<String>) {
  val dir = File(args[0]); dir.mkdirs()
  data class Case(val name: String, val ch: Int, val bits: Int, val level: Int, val secs: Double, val rate: Int = 44100, val float: Boolean = false, val seg: Double = 0.5)
  val cases = listOf(
    Case("s16-c1000", 2, 16, 1000, 4.0), Case("s16-c2000", 2, 16, 2000, 4.0), Case("s16-c3000", 2, 16, 3000, 4.0),
    Case("s16-c4000", 2, 16, 4000, 8.0), Case("s16-c5000", 2, 16, 5000, 30.0),
    Case("m16-c3000", 1, 16, 3000, 4.0), Case("m16-c5000", 1, 16, 5000, 4.0),
    Case("s8-c2000", 2, 8, 2000, 4.0), Case("m8-c1000", 1, 8, 1000, 4.0), Case("s8-c4000", 2, 8, 4000, 4.0),
    Case("s24-c1000", 2, 24, 1000, 4.0, 96000), Case("s24-c2000", 2, 24, 2000, 4.0, 96000), Case("s24-c3000", 2, 24, 3000, 4.0),
    Case("s24-c4000", 2, 24, 4000, 8.0), Case("s24-c5000", 2, 24, 5000, 30.0), Case("m24-c4000", 1, 24, 4000, 4.0),
    Case("s32-c1000", 2, 32, 1000, 4.0), Case("s32-c2000", 2, 32, 2000, 4.0), Case("s32-c4000", 2, 32, 4000, 8.0),
    Case("s32-c5000", 2, 32, 5000, 4.0), Case("m32-c3000", 1, 32, 3000, 4.0),
    Case("f32-c2000", 2, 32, 2000, 4.0, float = true),
    Case("ch3-16-c2000", 3, 16, 2000, 3.0), Case("ch4-16-c3000", 4, 16, 3000, 3.0), Case("ch6-16-c2000", 6, 16, 2000, 3.0),
    Case("ch7-24-c2000", 7, 24, 2000, 2.0), Case("ch8-24-c4000", 8, 24, 4000, 3.0), Case("ch4-24-c2000", 4, 24, 2000, 3.0),
    Case("s16-special-c2000", 2, 16, 2000, 30.0, seg = 4.0), Case("m16-special-c3000", 1, 16, 3000, 30.0, seg = 4.0),
    Case("ch6-8-c2000", 6, 8, 2000, 2.0), Case("ch6-32-c2000", 6, 32, 2000, 2.0),
  )
  val only = if (args.size > 1) args[1].split(",").toSet() else null
  for (c in cases) {
    if (only != null && c.name !in only) continue
    val t0 = System.nanoTime()
    var pcm = signal(c.secs, c.rate, c.ch, c.bits, c.name.hashCode().toLong(), c.seg)
    if (c.float) pcm = IntArray(pcm.size) { java.lang.Float.floatToRawIntBits((pcm[it].toDouble() / Int.MAX_VALUE).toFloat()) }
    val coded = if (c.float) IntArray(pcm.size) { floatTransform(pcm[it]) } else pcm
    File(dir, "${c.name}.ape").writeBytes(encodeApe(coded, c.ch, c.bits, c.rate, c.level, c.float))
    // expected PCM as ffmpeg prints it: s16le for <= 16 bits (8-bit shifted up), s32le otherwise
    val wide = c.bits > 16
    val exp = ByteArray(pcm.size * if (wide) 4 else 2)
    for (i in pcm.indices) {
      val v = when (c.bits) { 8, 24 -> pcm[i] shl 8; else -> pcm[i] }
      if (wide) for (b in 0 until 4) exp[i * 4 + b] = (v shr (8 * b)).toByte() else { exp[i * 2] = v.toByte(); exp[i * 2 + 1] = (v shr 8).toByte() }
    }
    File(dir, "${c.name}.pcm").writeBytes(exp)
    println("${c.name}: ${pcm.size / c.ch} frames, ${File(dir, "${c.name}.ape").length()} bytes, ${(System.nanoTime() - t0) / 1_000_000} ms")
  }
}
