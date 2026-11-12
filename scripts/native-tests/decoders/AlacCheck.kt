// Test harness for AlacDecoder: bit-exact comparison against ffmpeg on desktop JVM.
import expo.modules.musemetadata.formats.AlacDecoder
import expo.modules.musemetadata.formats.FormatException
import java.io.ByteArrayOutputStream
import java.io.File

val DIR = File(System.getProperty("alac.dir") ?: ".")
val VEC = File(DIR, "vectors")

fun be32(b: ByteArray, at: Int): Int =
  ((b[at].toInt() and 0xff) shl 24) or ((b[at + 1].toInt() and 0xff) shl 16) or
    ((b[at + 2].toInt() and 0xff) shl 8) or (b[at + 3].toInt() and 0xff)
fun be64(b: ByteArray, at: Int): Long = (be32(b, at).toLong() shl 32) or (be32(b, at + 4).toLong() and 0xffffffffL)
fun fourcc(s: String) = be32(s.toByteArray(Charsets.ISO_8859_1), 0)

// ---------- tiny MP4 reader ----------
class Mp4(val cookieBody: ByteArray, val alacBox: ByteArray, val packets: List<ByteArray>)

fun readMp4(f: File): Mp4 {
  val d = f.readBytes()
  var stsd: ByteArray? = null; var sizes = IntArray(0); var chunkOffs = LongArray(0)
  val stsc = ArrayList<IntArray>()
  fun walk(start: Int, end: Int) {
    var p = start
    while (p + 8 <= end) {
      var size = be32(d, p).toLong() and 0xffffffffL
      val type = be32(d, p + 4)
      var hdr = 8
      if (size == 1L) { size = be64(d, p + 8); hdr = 16 }
      if (size == 0L) size = (end - p).toLong()
      val bEnd = (p + size).toInt()
      val body = p + hdr
      when (type) {
        fourcc("moov"), fourcc("trak"), fourcc("mdia"), fourcc("minf"), fourcc("stbl") -> if (stsd == null || type != fourcc("trak")) walk(body, bEnd)
        fourcc("stsd") -> if (stsd == null) stsd = d.copyOfRange(body + 8, bEnd)
        fourcc("stsz") -> {
          val ss = be32(d, body + 4); val n = be32(d, body + 8)
          sizes = IntArray(n) { if (ss != 0) ss else be32(d, body + 12 + 4 * it) }
        }
        fourcc("stsc") -> { val n = be32(d, body + 4); for (i in 0 until n) stsc.add(intArrayOf(be32(d, body + 8 + 12 * i), be32(d, body + 12 + 12 * i))) }
        fourcc("stco") -> { val n = be32(d, body + 4); chunkOffs = LongArray(n) { be32(d, body + 8 + 4 * it).toLong() and 0xffffffffL } }
        fourcc("co64") -> { val n = be32(d, body + 4); chunkOffs = LongArray(n) { be64(d, body + 8 + 8 * it) } }
      }
      p = bEnd
    }
  }
  walk(0, d.size)
  val e = stsd ?: error("no stsd")
  // e = one sample entry: size, 'alac', ...; find the inner 'alac' box after the audio sample entry fields.
  var i = 36
  while (be32(e, i + 4) != fourcc("alac")) i++
  val boxSize = be32(e, i)
  val alacBox = e.copyOfRange(i, i + boxSize)
  val body = alacBox.copyOfRange(12, boxSize) // exactly what Media3 puts in initializationData[0]
  // samples
  val pk = ArrayList<ByteArray>()
  var s = 0
  for (c in chunkOffs.indices) {
    val chunk = c + 1
    var per = 0
    for (en in stsc) if (en[0] <= chunk) per = en[1]
    var off = chunkOffs[c].toInt()
    for (k in 0 until per) { if (s >= sizes.size) break; pk.add(d.copyOfRange(off, off + sizes[s])); off += sizes[s]; s++ }
  }
  return Mp4(body, alacBox, pk)
}

// ---------- test-only ALAC writer (for depths/modes ffmpeg's encoder cannot make) ----------
class BitWriter {
  val out = ByteArrayOutputStream(); private var acc = 0L; private var n = 0
  fun put(v: Int, bits: Int) {
    if (bits == 0) return
    acc = (acc shl bits) or (v.toLong() and ((1L shl bits) - 1)); n += bits
    while (n >= 8) { out.write((acc ushr (n - 8)).toInt() and 0xff); n -= 8 }
  }
  fun align() { if (n > 0) put(0, 8 - n) }
}

class EncOpts(val escape: Boolean = false, val shift: Int = 0, val mode: Int = 0, val mixBits: Int = 2, val mixRes: Int = 1)

const val PB = 40; const val MB0 = 10; const val KB = 14

// Inverse of the decoder's adaptive Golomb state machine.
fun agEncode(bw: BitWriter, res: IntArray, num: Int, maxSize: Int) {
  val wb = (1 shl KB) - 1
  var mb = MB0; var zmode = 0; var c = 0
  while (c < num) {
    var k = 31 - Integer.numberOfLeadingZeros((mb ushr 9) + 3); if (k > KB) k = KB
    val m = (1 shl k) - 1
    val del = res[c]
    val nd = if (del >= 0) 2 * del else -2 * del - 1
    val n = nd - zmode
    check(n >= 0)
    val q = if (k == 1) n else n / m
    if (q >= 9) { bw.put(0x1ff, 9); bw.put(n, maxSize) }
    else {
      bw.put((1 shl (q + 1)) - 2, q + 1)
      if (k != 1) { val r = n % m; if (r == 0) bw.put(0, k - 1) else bw.put(r + 1, k) }
    }
    c++
    mb = PB * (n + zmode) + mb - ((PB * mb) ushr 9)
    if ((n ushr 16) != 0) mb = 0xffff
    zmode = 0
    if (((mb shl 2) ushr 9) == 0 && c < num) {
      zmode = 1
      val kz = Integer.numberOfLeadingZeros(mb) - 24 + ((mb + 16) ushr 6)
      val mz = ((1 shl kz) - 1) and wb
      var run = 0
      while (c + run < num && res[c + run] == 0 && run < 65535) run++
      val qz = run / mz
      if (qz >= 9) { bw.put(0x1ff, 9); bw.put(run, 16) }
      else { bw.put((1 shl (qz + 1)) - 2, qz + 1); val r = run % mz; if (r == 0) bw.put(0, kz - 1) else bw.put(r + 1, kz) }
      c += run
      if (run >= 65535) zmode = 0
      mb = 0
    }
  }
}

fun sext(v: Int, bits: Int) = if (bits >= 32) v else (v shl (32 - bits)) shr (32 - bits)

/** Encodes interleaved samples (ALAC channel order) into packets. */
fun encodeAlac(pcm: IntArray, ch: Int, bits: Int, frameLen: Int, optsFor: (Int) -> EncOpts): List<ByteArray> {
  val layout = arrayOf(intArrayOf(1), intArrayOf(2), intArrayOf(1, 2), intArrayOf(1, 2, 1), intArrayOf(1, 2, 2),
    intArrayOf(1, 2, 2, 1), intArrayOf(1, 2, 2, 1, 1), intArrayOf(1, 2, 2, 2, 1))[ch - 1]
  val total = pcm.size / ch
  val pk = ArrayList<ByteArray>()
  var f0 = 0; var idx = 0
  while (f0 < total) {
    val frames = minOf(frameLen, total - f0)
    val o = optsFor(idx++)
    val bw = BitWriter()
    var chan = 0
    for (el in layout) {
      val pair = el == 2
      bw.put(if (pair) 1 else 0, 3); bw.put(0, 4); bw.put(0, 12)
      val partial = if (frames < frameLen) 1 else 0
      bw.put((partial shl 3) or (o.shift shl 1) or (if (o.escape) 1 else 0), 4)
      if (partial == 1) bw.put(frames, 32)
      val nch = if (pair) 2 else 1
      fun s(i: Int, c: Int) = pcm[(f0 + i) * ch + chan + c]
      if (o.escape) {
        for (i in 0 until frames) for (c in 0 until nch) bw.put(s(i, c), bits)
      } else {
        val sb = o.shift * 8
        val chanBits = bits - sb + (if (pair) 1 else 0)
        val mixRes = if (pair) o.mixRes else 0
        val u = IntArray(frames); val v = IntArray(frames)
        for (i in 0 until frames) {
          val l = s(i, 0) shr sb
          if (pair) {
            val r = s(i, 1) shr sb
            val vv = l - r
            v[i] = vv; u[i] = if (mixRes != 0) r + ((mixRes * vv) shr o.mixBits) else l
            if (mixRes == 0) v[i] = r
          } else u[i] = l
        }
        bw.put(if (pair) o.mixBits else 0, 8); bw.put(mixRes and 0xff, 8)
        for (c in 0 until nch) { bw.put((o.mode shl 4) or 9, 8); bw.put((4 shl 5) or 0, 8) }
        if (sb != 0) for (i in 0 until frames) for (c in 0 until nch) bw.put(s(i, c), sb)
        for (c in 0 until nch) {
          val x = if (c == 0) u else v
          val res = if (o.mode == 0) x else IntArray(frames) { if (it == 0) x[0] else sext(x[it] - x[it - 1], chanBits) }
          agEncode(bw, res, frames, chanBits)
        }
      }
      chan += nch
    }
    bw.put(7, 3); bw.align()
    pk.add(bw.out.toByteArray())
    f0 += frames
  }
  return pk
}

fun cookie(frameLen: Int, bits: Int, ch: Int, rate: Int): ByteArray {
  val b = ByteArrayOutputStream()
  fun w32(v: Int) { b.write(v ushr 24); b.write(v ushr 16); b.write(v ushr 8); b.write(v) }
  w32(frameLen); b.write(0); b.write(bits); b.write(PB); b.write(MB0); b.write(KB); b.write(ch)
  b.write(0); b.write(255); w32(0); w32(0); w32(rate)
  return b.toByteArray()
}

/** Minimal MP4 that ffmpeg's mov demuxer accepts. */
fun writeMp4(f: File, cfg: ByteArray, packets: List<ByteArray>, rate: Int, ch: Int, bits: Int, frameLen: Int, totalFrames: Int) {
  fun box(type: String, vararg parts: ByteArray): ByteArray {
    val body = parts.fold(ByteArray(0)) { a, p -> a + p }
    val s = 8 + body.size
    return byteArrayOf((s ushr 24).toByte(), (s ushr 16).toByte(), (s ushr 8).toByte(), s.toByte()) + type.toByteArray() + body
  }
  fun i32(vararg v: Int) = ByteArray(4 * v.size) { (v[it / 4] ushr (24 - 8 * (it % 4))).toByte() }
  fun i16(vararg v: Int) = ByteArray(2 * v.size) { (v[it / 2] ushr (8 - 8 * (it % 2))).toByte() }
  val matrix = i32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)
  val ftyp = box("ftyp", "M4A ".toByteArray(), i32(0), "M4A mp42isom".toByteArray())
  val mdatBody = packets.fold(ByteArray(0)) { a, p -> a + p }
  val mdatOff = ftyp.size + 8
  val n = packets.size
  val last = totalFrames - (n - 1) * frameLen
  val alac = box("alac", i32(0), cfg)
  val entry = box("alac", ByteArray(6), i16(1, 0, 0), i32(0), i16(ch, if (bits == 16) 16 else 24, 0, 0), i32(minOf(rate, 65535) shl 16), alac)
  val stbl = box("stbl",
    box("stsd", i32(0, 1), entry),
    box("stts", *(if (last == frameLen) arrayOf(i32(0, 1, n, frameLen)) else arrayOf(i32(0, 2, n - 1, frameLen, 1, last)))),
    box("stsc", i32(0, 1, 1, n, 1)),
    box("stsz", i32(0, 0, n), *packets.map { i32(it.size) }.toTypedArray()),
    box("stco", i32(0, 1, mdatOff)))
  val minf = box("minf", box("smhd", i32(0, 0)), box("dinf", box("dref", i32(0, 1), box("url ", i32(1)))), stbl)
  val mdia = box("mdia", box("mdhd", i32(0, 0, 0, rate, totalFrames), i16(0x55c4, 0)),
    box("hdlr", i32(0, 0), "soun".toByteArray(), ByteArray(13)), minf)
  val tkhd = box("tkhd", i32(7, 0, 0, 1, 0, totalFrames, 0, 0), i16(0, 0, 0x100, 0), matrix, i32(0, 0))
  val mvhd = box("mvhd", i32(0, 0, 0, rate, totalFrames, 0x10000), i16(0x100), ByteArray(10), matrix, ByteArray(24), i32(2))
  val moov = box("moov", mvhd, box("trak", tkhd, mdia))
  f.writeBytes(ftyp + box("mdat", mdatBody) + moov)
}

// ---------- reference & compare ----------
fun run(vararg cmd: String): String {
  val p = ProcessBuilder(*cmd).redirectErrorStream(true).start()
  val out = p.inputStream.readBytes().toString(Charsets.UTF_8)
  if (p.waitFor() != 0) error("command failed: ${cmd.joinToString(" ")}\n${out.takeLast(800)}")
  return out
}

// ALAC bitstream channel -> WAVE (ffmpeg output) position.
val PERM = arrayOf(intArrayOf(0), intArrayOf(0, 1), intArrayOf(2, 0, 1), intArrayOf(2, 0, 1, 3), intArrayOf(2, 0, 1, 3, 4),
  intArrayOf(2, 0, 1, 4, 5, 3), intArrayOf(2, 0, 1, 4, 5, 6, 3), intArrayOf(2, 6, 7, 0, 1, 4, 5, 3))

fun decodeAll(cookie: ByteArray, packets: List<ByteArray>): Pair<AlacDecoder, IntArray> {
  val dec = AlacDecoder(cookie)
  val ch = dec.info.channels
  var all = IntArray(1 shl 16); var n = 0
  for (p in packets) {
    val blk = dec.decode(p, 0, p.size)
    val cnt = blk.frames * ch
    if (n + cnt > all.size) all = all.copyOf(maxOf(all.size * 2, n + cnt))
    System.arraycopy(blk.samples, 0, all, n, cnt); n += cnt
  }
  return dec to all.copyOf(n)
}

val results = ArrayList<String>()
var failures = 0

fun check(name: String, f: File, expectBits: Int? = null) {
  try {
    val mp4 = readMp4(f)
    val (dec, mine) = decodeAll(mp4.cookieBody, mp4.packets)
    // Other cookie forms must give the same stream.
    val frma = byteArrayOf(0, 0, 0, 12) + "frmaalac".toByteArray() + mp4.alacBox
    for (alt in listOf(mp4.alacBox, frma)) {
      val d2 = AlacDecoder(alt); check(d2.info.bitsPerSample == dec.info.bitsPerSample && d2.framesPerPacket == dec.framesPerPacket)
    }
    val info = dec.info
    val ch = info.channels; val bits = info.bitsPerSample
    if (expectBits != null && bits != expectBits) error("expected $expectBits bits, cookie says $bits")
    val raw = File(DIR, "ref.raw")
    run("ffmpeg", "-v", "error", "-y", "-i", f.path, "-f", "s32le", "-c:a", "pcm_s32le", raw.path)
    val rb = raw.readBytes()
    val ref = IntArray(rb.size / 4) { (rb[4 * it].toInt() and 0xff) or ((rb[4 * it + 1].toInt() and 0xff) shl 8) or ((rb[4 * it + 2].toInt() and 0xff) shl 16) or (rb[4 * it + 3].toInt() shl 24) }
    val perm = PERM[ch - 1]
    var bad = -1
    if (ref.size != mine.size) bad = -2
    else {
      val sh = 32 - bits
      var i = 0
      while (i < mine.size && bad < 0) {
        val fr = i / ch; val c = i % ch
        if ((mine[i] shl sh) != ref[fr * ch + perm[c]]) bad = i
        i++
      }
    }
    val tag = "%-34s %2d-bit %d ch %6d Hz %8d frames %5d pkts".format(name, bits, ch, info.sampleRate, mine.size / ch, mp4.packets.size)
    if (bad == -1) results.add("PASS $tag")
    else {
      failures++
      results.add("FAIL $tag " + if (bad == -2) "length mine=${mine.size} ref=${ref.size}" else "first diff at sample $bad (frame ${bad / ch} ch ${bad % ch}): mine=${mine[bad]} ref=${ref[(bad / ch) * ch + perm[bad % ch]] shr (32 - bits)}")
    }
  } catch (e: Throwable) {
    failures++; results.add("FAIL $name: $e"); e.printStackTrace()
  }
}

fun ff(name: String, vararg args: String): File {
  val f = File(VEC, "$name.m4a")
  if (!f.exists()) run("ffmpeg", "-v", "error", "-y", *args, f.path)
  return f
}

fun lavfi(expr: String, dur: String) = arrayOf("-f", "lavfi", "-i", expr, "-t", dur)
val MUSIC = "0.35*sin(2*PI*220*t)+0.2*sin(2*PI*331*t+sin(2*PI*3*t))+0.15*sin(2*PI*1760*t)*sin(2*PI*0.7*t)+0.05*(random(0)-0.5)"

fun ffmpegVectors() {
  val s16 = arrayOf("-c:a", "alac", "-sample_fmt", "s16p")
  val s24 = arrayOf("-c:a", "alac", "-sample_fmt", "s32p", "-bits_per_raw_sample", "24")
  check("inside.m4a (fate)", File(VEC, "inside.m4a"), 16)
  check("music stereo 44.1k", ff("m16_2_44k", *lavfi("aevalsrc=$MUSIC|$MUSIC*0.8:s=44100", "20"), *s16), 16)
  check("music stereo 44.1k 24", ff("m24_2_44k", *lavfi("aevalsrc=$MUSIC|0.9*sin(2*PI*300*t):s=44100", "10"), *s24), 24)
  check("sweep mono 48k", ff("sw16_1_48k", *lavfi("aevalsrc=0.8*sin(2*PI*(50+1500*t)*t):s=48000", "6"), *s16), 16)
  check("sweep mono 48k 24", ff("sw24_1_48k", *lavfi("aevalsrc=0.8*sin(2*PI*(50+1500*t)*t):s=48000", "6"), *s24), 24)
  check("music stereo 96k 24", ff("m24_2_96k", *lavfi("aevalsrc=$MUSIC|$MUSIC*0.5:s=96000", "10"), *s24), 24)
  check("pink noise stereo 192k 24", ff("n24_2_192k", *lavfi("anoisesrc=c=pink:r=192000:a=0.5", "4"), "-ac", "2", *s24), 24)
  check("white noise full-scale 16", ff("wn16_2_44k", *lavfi("anoisesrc=c=white:r=44100:a=1", "4"), "-ac", "2", *s16), 16)
  check("white noise full-scale 24", ff("wn24_2_48k", *lavfi("anoisesrc=c=white:r=48000:a=1", "3"), "-ac", "2", *s24), 24)
  check("silence stereo 16", ff("sil16_2", *lavfi("anullsrc=r=44100:cl=stereo", "3"), *s16), 16)
  check("silence mono 24", ff("sil24_1", *lavfi("anullsrc=r=48000:cl=mono", "3"), *s24), 24)
  check("clipped square-ish 16", ff("clip16_2", *lavfi("aevalsrc=3*sin(2*PI*100*t)|-3*sin(2*PI*150*t):s=44100", "5"), *s16), 16)
  check("clipped 24", ff("clip24_2", *lavfi("aevalsrc=3*sin(2*PI*100*t)|-3*sin(2*PI*150*t):s=44100", "5"), *s24), 24)
  check("short 441 frames", ff("short441", *lavfi("aevalsrc=$MUSIC|$MUSIC:s=44100", "0.01"), *s16), 16)
  check("1 frame", ff("one", *lavfi("aevalsrc=0.5|-0.5:s=44100", "0.0000227"), *s16), 16)
  check("4097 frames", ff("f4097", *lavfi("aevalsrc=$MUSIC|$MUSIC:s=44100", "0.0929"), "-af", "atrim=end_sample=4097", *s16), 16)
  check("odd 12345 frames 24 mono", ff("f12345", *lavfi("aevalsrc=$MUSIC:s=48000", "1"), "-af", "atrim=end_sample=12345", *s24), 24)
  for ((lo, hi) in listOf(1 to 1, 2 to 2, 8 to 8, 16 to 16, 30 to 30, 1 to 30)) {
    check("order $lo..$hi 16", ff("ord${lo}_${hi}_16", *lavfi("aevalsrc=$MUSIC|$MUSIC*0.7:s=44100", "4"), *s16, "-min_prediction_order", "$lo", "-max_prediction_order", "$hi"), 16)
    check("order $lo..$hi 24", ff("ord${lo}_${hi}_24", *lavfi("aevalsrc=$MUSIC|$MUSIC*0.7:s=96000", "3"), *s24, "-min_prediction_order", "$lo", "-max_prediction_order", "$hi"), 24)
  }
  for (lvl in 0..2) check("compression_level $lvl", ff("lvl$lvl", *lavfi("aevalsrc=$MUSIC|$MUSIC*0.6:s=44100", "4"), *s16, "-compression_level", "$lvl"), 16)
  val layouts = listOf("mono" to 1, "stereo" to 2, "3.0" to 3, "4.0" to 4, "5.0" to 5, "5.1" to 6, "6.1" to 7, "7.1" to 8)
  for ((lay, n) in layouts) {
    val exprs = (0 until n).joinToString("|") { "0.3*sin(2*PI*${110 * (it + 1)}*t)+0.05*(random($it)-0.5)" }
    check("$lay 16 48k", ff("mc16_$n", *lavfi("aevalsrc=$exprs:s=48000", "3"), "-af", "aformat=channel_layouts=${ffLayout(n)}", *s16), 16)
    check("$lay 24 44.1k", ff("mc24_$n", *lavfi("aevalsrc=$exprs:s=44100", "3"), "-af", "aformat=channel_layouts=${ffLayout(n)}", *s24), 24)
  }
}

fun ffLayout(n: Int) = arrayOf("mono", "stereo", "3.0", "4.0", "5.0", "5.1", "6.1(back)", "7.1(wide)")[n - 1]

// Deterministic music-like test signal at the given depth, with silence and clipping segments.
fun signal(frames: Int, ch: Int, bits: Int, seed: Int): IntArray {
  val max = if (bits >= 32) Int.MAX_VALUE.toDouble() else ((1L shl (bits - 1)) - 1).toDouble()
  var rnd = seed.toLong() * 2654435761L + 1
  val out = IntArray(frames * ch)
  for (i in 0 until frames) for (c in 0 until ch) {
    rnd = rnd * 6364136223846793005L + 1442695040888963407L
    val noise = ((rnd ushr 33).toDouble() / (1L shl 31) - 0.5)
    val t = i / 44100.0
    var x = 0.4 * Math.sin(2 * Math.PI * (110.0 * (c + 1)) * t) + 0.2 * Math.sin(2 * Math.PI * 1234.5 * t + c) * Math.sin(t * 3) + 0.02 * noise
    val seg = (i / 3000) % 6
    if (seg == 2) x = 0.0
    if (seg == 4) x *= 4.0
    if (seg == 5 && c == 0) x = noise * 2
    x = x.coerceIn(-1.0, 1.0)
    out[i * ch + c] = Math.round(x * max).coerceIn(-max.toLong() - 1, max.toLong()).toInt()
  }
  return out
}

fun synth(name: String, bits: Int, ch: Int, rate: Int, frames: Int, frameLen: Int = 4096, opts: (Int) -> EncOpts) {
  val f = File(VEC, "syn_$name.m4a")
  val pcm = signal(frames, ch, bits, name.hashCode())
  val pk = encodeAlac(pcm, ch, bits, frameLen, opts)
  writeMp4(f, cookie(frameLen, bits, ch, rate), pk, rate, ch, bits, frameLen, frames)
  check("synth $name", f, bits)
}

fun synthVectors() {
  val mixed = { i: Int -> when (i % 4) { 0 -> EncOpts(); 1 -> EncOpts(mode = 15); 2 -> EncOpts(escape = true); else -> EncOpts(mixRes = 0) } }
  synth("20 mono", 20, 1, 44100, 30001, opts = mixed)
  synth("20 stereo", 20, 2, 48000, 30001, opts = mixed)
  synth("20 5.1", 20, 6, 48000, 9000, opts = mixed)
  synth("32 mono shift2", 32, 1, 44100, 30001) { i -> if (i % 3 == 2) EncOpts(escape = true) else EncOpts(shift = 2, mode = (i % 2) * 15) }
  synth("32 stereo shift2", 32, 2, 96000, 30001) { i -> when (i % 4) { 0 -> EncOpts(shift = 2); 1 -> EncOpts(shift = 2, mode = 15, mixBits = 3, mixRes = 5); 2 -> EncOpts(shift = 2, mode = 15, mixRes = 0); else -> EncOpts(shift = 2, mixRes = 0) } }
  synth("32 7.1 shift2", 32, 8, 192000, 9000) { i -> EncOpts(shift = 2, mode = (i % 2) * 15) }
  synth("24 stereo shift2", 24, 2, 44100, 20000) { i -> EncOpts(shift = 2, mode = (i % 2) * 15) }
  synth("24 stereo shift1 mixed", 24, 2, 44100, 20000) { i -> when (i % 3) { 0 -> EncOpts(shift = 1, mixRes = 3, mixBits = 2); 1 -> EncOpts(escape = true); else -> EncOpts(mode = 15) } }
  synth("16 stereo frameLen 352", 16, 2, 44100, 10000, frameLen = 352, opts = mixed)
  synth("24 mono frameLen 16", 24, 1, 44100, 50, frameLen = 16, opts = mixed)
}

fun badInputs() {
  val good = readMp4(File(VEC, "m16_2_44k.m4a"))
  var ok = true
  fun expectFail(what: String, block: () -> Unit) {
    try { block(); results.add("FAIL bad input not rejected: $what"); ok = false; failures++ } catch (e: FormatException) { }
  }
  expectFail("short cookie") { AlacDecoder(ByteArray(10)) }
  expectFail("bit depth 8") { AlacDecoder(good.cookieBody.copyOf().also { it[5] = 8 }) }
  expectFail("9 channels") { AlacDecoder(good.cookieBody.copyOf().also { it[9] = 9 }) }
  // Truncated / garbage packets must throw FormatException, never crash.
  val dec = AlacDecoder(good.cookieBody)
  var rnd = java.util.Random(7)
  var crashes = 0
  for (t in 0 until 3000) {
    val p = good.packets[t % good.packets.size].copyOf()
    val len = if (t % 3 == 0) rnd.nextInt(p.size + 1) else p.size
    if (t % 3 != 0) for (k in 0 until 1 + rnd.nextInt(8)) p[rnd.nextInt(p.size)] = rnd.nextInt().toByte()
    try { dec.decode(p, 0, len) } catch (e: FormatException) { } catch (e: Throwable) { crashes++; if (crashes < 3) e.printStackTrace() }
  }
  if (crashes > 0) { ok = false; failures++ }
  results.add((if (ok) "PASS" else "FAIL") + " bad cookies rejected; 3000 corrupted/truncated packets -> crashes=$crashes")
}

fun speed(name: String, f: File) {
  val mp4 = readMp4(f)
  val dec = AlacDecoder(mp4.cookieBody)
  var frames = 0L
  for (w in 0 until 3) for (p in mp4.packets) dec.decode(p, 0, p.size) // warm-up
  val t0 = System.nanoTime()
  var reps = 0
  while (System.nanoTime() - t0 < 3_000_000_000L) { for (p in mp4.packets) frames += dec.decode(p, 0, p.size).frames; reps++ }
  val sec = (System.nanoTime() - t0) / 1e9
  results.add("SPEED %-28s %.0fx realtime".format(name, frames.toDouble() / dec.info.sampleRate / sec))
}

fun main() {
  VEC.mkdirs()
  ffmpegVectors()
  synthVectors()
  badInputs()
  speed("44.1k 16-bit stereo", File(VEC, "m16_2_44k.m4a"))
  speed("inside.m4a 44.1k 16 stereo", File(VEC, "inside.m4a"))
  speed("96k 24-bit stereo", File(VEC, "m24_2_96k.m4a"))
  results.forEach(::println)
  println(if (failures == 0) "ALL PASS (${results.count { it.startsWith("PASS") }})" else "FAILURES: $failures")
}
