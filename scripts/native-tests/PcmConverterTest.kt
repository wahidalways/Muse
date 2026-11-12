// Checks formats/PcmConverter.kt byte for byte: the sample conversion behind
// bit-perfect output and the DoP guard that keeps DSD from playing as noise.
// Run: bash scripts/native-tests/run.sh
import expo.modules.musemetadata.formats.PcmConverter
import java.nio.ByteBuffer
import java.nio.ByteOrder

var failures = 0
fun check(name: String, ok: Boolean, detail: () -> String = { "" }) {
  println((if (ok) "PASS " else "FAIL ") + name + (if (ok) "" else "  " + detail()))
  if (!ok) failures++
}

fun hex(bytes: ByteArray) = bytes.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }

/** 24-bit samples as the floats Media3 hands over with Hi-Res on. */
fun floats(vararg samples24: Int): ByteBuffer {
  val buffer = ByteBuffer.allocate(samples24.size * 4).order(ByteOrder.LITTLE_ENDIAN)
  for (sample in samples24) buffer.putFloat(sample / 8388608f)
  buffer.flip()
  return buffer
}

fun shorts(vararg samples: Int): ByteBuffer {
  val buffer = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
  for (sample in samples) buffer.putShort(sample.toShort())
  buffer.flip()
  return buffer
}

internal fun run(converter: PcmConverter, input: ByteBuffer, samples: Int, outBytes: Int): ByteArray {
  val out = ByteBuffer.allocate(samples * outBytes).order(ByteOrder.LITTLE_ENDIAN)
  converter.convert(input, samples, out)
  return out.array()
}

/** 24-bit little-endian bytes of these samples. */
fun le24(vararg samples: Int) = ByteArray(samples.size * 3).also { bytes ->
  samples.forEachIndexed { i, s -> bytes[i * 3] = s.toByte(); bytes[i * 3 + 1] = (s shr 8).toByte(); bytes[i * 3 + 2] = (s shr 16).toByte() }
}

fun expect(name: String, actual: ByteArray, expected: ByteArray) =
  check(name, actual.contentEquals(expected)) { "got ${hex(actual)}, want ${hex(expected)}" }

fun main() {
  // PCM: every 24-bit value comes out exactly, including both ends of the range.
  val edges = intArrayOf(0, 1, -1, 0x123456, -0x123456, 8388607, -8388608)
  expect(
    "float to 24-bit is exact",
    run(PcmConverter(fromFloat = true, outBytes = 3, outFloat = false, dop = false, channels = 1), floats(*edges), edges.size, 3),
    le24(*edges),
  )
  val wide = run(PcmConverter(fromFloat = true, outBytes = 4, outFloat = false, dop = false, channels = 1), floats(*edges), edges.size, 4)
  val wideInts = IntArray(edges.size) { ByteBuffer.wrap(wide).order(ByteOrder.LITTLE_ENDIAN).getInt(it * 4) }
  check("float to 32-bit keeps the 24 bits on top", wideInts.contentEquals(IntArray(edges.size) { edges[it] shl 8 })) { wideInts.joinToString() }
  expect(
    "16-bit to 24-bit pads below",
    run(PcmConverter(fromFloat = false, outBytes = 3, outFloat = false, dop = false, channels = 1), shorts(0x1234, -1, -32768), 3, 3),
    le24(0x123400, -0x100, -0x800000),
  )
  check("clips past full scale", PcmConverter.floatToInt32(1.5f) == Int.MAX_VALUE && PcmConverter.floatToInt32(-1.5f) == Int.MIN_VALUE)

  // DoP, stereo: intact frames pass untouched.
  val intact = intArrayOf(0x05AABB, 0x05CCDD, 0xFA1122 - 0x1000000, 0xFA3344 - 0x1000000)
  expect(
    "intact DoP passes as is",
    run(PcmConverter(fromFloat = true, outBytes = 3, outFloat = false, dop = true, channels = 2), floats(*intact), 4, 3),
    le24(*intact),
  )
  // A broken frame (channels disagree) becomes DSD silence under the marker the DAC expects next.
  val broken = intArrayOf(0x05AABB, 0x05CCDD, 0x123456, 0x05EEFF)
  expect(
    "broken DoP frame becomes DSD silence",
    run(PcmConverter(fromFloat = true, outBytes = 3, outFloat = false, dop = true, channels = 2), floats(*broken), 4, 3),
    le24(0x05AABB, 0x05CCDD, 0xFA6969 - 0x1000000, 0xFA6969 - 0x1000000),
  )
  val broken32 = run(PcmConverter(fromFloat = true, outBytes = 4, outFloat = false, dop = true, channels = 2), floats(0x05AABB, 0x05CCDD, 1, 2), 4, 4)
  expect("broken DoP frame in 32-bit", broken32.copyOfRange(8, 16), byteArrayOf(0, 0x69, 0x69, 0xFA.toByte(), 0, 0x69, 0x69, 0xFA.toByte()))
  // No room for the marker (16-bit or float out): plain silence, and no crash.
  expect(
    "DoP into 16-bit is silence",
    run(PcmConverter(fromFloat = true, outBytes = 2, outFloat = false, dop = true, channels = 2), floats(*intact), 4, 2),
    ByteArray(8),
  )
  expect(
    "DoP into float is silence",
    run(PcmConverter(fromFloat = true, outBytes = 4, outFloat = true, dop = true, channels = 2), floats(*intact), 4, 4),
    ByteArray(16),
  )

  if (failures > 0) {
    println("$failures failed")
    kotlin.system.exitProcess(1)
  }
  println("PcmConverter checks passed")
}
