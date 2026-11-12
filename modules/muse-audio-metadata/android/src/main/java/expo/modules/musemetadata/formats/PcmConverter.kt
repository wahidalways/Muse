package expo.modules.musemetadata.formats

import java.nio.ByteBuffer

/**
 * Turns the player's samples (16-bit or float, little-endian) into the DAC's
 * format bit for bit: 16, 24 or 32-bit integers, or float. With `dop`, it
 * also guards DoP (DSD over PCM) frames: all channels share one marker byte,
 * 0x05 or 0xFA, alternating. An intact frame passes as is; a broken one
 * becomes DSD silence (0x69 bytes) under the marker the DAC expects next, and
 * an output with no room for the marker gets plain silence, so DSD is never
 * played as PCM noise. Pure Kotlin: scripts/native-tests runs it on a computer.
 */
internal class PcmConverter(
  private val fromFloat: Boolean,
  /** 2, 3 or 4. */
  private val outBytes: Int,
  /** 4-byte float out (only from float). */
  private val outFloat: Boolean,
  private val dop: Boolean,
  private val channels: Int,
) {
  private var nextMarker = 0x05

  /** After a seek: the next DoP frame may start with either marker. */
  fun reset() {
    nextMarker = 0x05
  }

  /** Converts `samples` samples from `input` (read from its position) into `out`, from its position. */
  fun convert(input: ByteBuffer, samples: Int, out: ByteBuffer) {
    val start = out.position()
    for (i in 0 until samples) {
      // Every sample as a 32-bit left-justified integer first.
      val wide: Int = if (fromFloat) {
        if (outFloat) java.lang.Float.floatToRawIntBits(input.float) else floatToInt32(input.float)
      } else {
        input.short.toInt() shl 16
      }
      when (outBytes) {
        2 -> out.putShort((wide shr 16).toShort())
        3 -> {
          out.put((wide shr 8).toByte()); out.put((wide shr 16).toByte()); out.put((wide shr 24).toByte())
        }
        else -> out.putInt(wide)
      }
    }
    if (dop) guardDop(out, start, samples)
  }

  private fun guardDop(out: ByteBuffer, start: Int, samples: Int) {
    val step = outBytes
    if (step < 3 || outFloat) {
      for (i in 0 until samples * step) out.put(start + i, 0)
      return
    }
    val frameBytes = step * channels
    for (frame in 0 until samples / channels) {
      val base = start + frame * frameBytes
      val top = out.get(base + step - 1).toInt() and 0xFF
      var intact = top == 0x05 || top == 0xFA
      for (channel in 1 until channels) {
        if ((out.get(base + channel * step + step - 1).toInt() and 0xFF) != top) intact = false
      }
      if (intact) {
        nextMarker = if (top == 0x05) 0xFA else 0x05
        continue
      }
      for (channel in 0 until channels) {
        val at = base + channel * step
        out.put(at + step - 1, nextMarker.toByte())
        out.put(at + step - 2, 0x69)
        out.put(at + step - 3, 0x69)
        if (step == 4) out.put(at, 0)
      }
      nextMarker = if (nextMarker == 0x05) 0xFA else 0x05
    }
  }

  companion object {
    /** Exact for anything that came from 24-bit PCM: the float holds those 24 bits. */
    fun floatToInt32(value: Float): Int {
      val scaled = value.toDouble() * 2147483648.0
      return when {
        scaled >= 2147483647.0 -> Int.MAX_VALUE
        scaled <= -2147483648.0 -> Int.MIN_VALUE
        else -> Math.round(scaled).toInt()
      }
    }
  }
}
