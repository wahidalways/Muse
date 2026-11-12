package expo.modules.musemetadata.playback

import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.ParsableByteArray
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.TrackOutput
import expo.modules.musemetadata.formats.ReadAt
import expo.modules.musemetadata.formats.StreamInfo

// Shared by Muse's own extractors (AIFF, DSD, APE, WavPack): they decode in
// the extractor and hand Media3 plain PCM, which every phone plays.

/** Labels the output stage reads (Format.label survives the renderer). */
internal const val LABEL_DOP = "muse|dop"

/** The PCM encoding a stream plays as: its own depth, odd depths moved up into whole bytes. */
internal fun pcmEncodingFor(stream: StreamInfo): Int = when {
  stream.isFloat -> C.ENCODING_PCM_FLOAT
  stream.bitsPerSample <= 8 -> C.ENCODING_PCM_8BIT
  stream.bitsPerSample <= 16 -> C.ENCODING_PCM_16BIT
  stream.bitsPerSample <= 24 -> C.ENCODING_PCM_24BIT
  else -> C.ENCODING_PCM_32BIT
}

internal fun bytesPerSample(encoding: Int): Int = when (encoding) {
  C.ENCODING_PCM_8BIT -> 1
  C.ENCODING_PCM_16BIT -> 2
  C.ENCODING_PCM_24BIT -> 3
  else -> 4
}

/**
 * Writes PCM to Media3 in small samples with exact timestamps. After a seek,
 * frames before the target are dropped here, so playback starts on the exact
 * sample instead of the start of a long codec frame.
 */
internal class PcmOut(
  private val output: TrackOutput,
  val sampleRate: Int,
  val channels: Int,
  val encoding: Int,
  /** Bits the decoder's ints carry; they are moved up to fill [encoding]'s container. */
  sourceBits: Int,
) {
  private val width = bytesPerSample(encoding)
  private val shift = if (encoding == C.ENCODING_PCM_FLOAT) 0 else width * 8 - sourceBits.coerceIn(1, width * 8)
  private var buffer = ByteArray(0)
  private val holder = ParsableByteArray()

  /** Index of the next frame written (its timestamp). */
  var nextFrame = 0L
    private set

  /** Frames before this index are dropped (the seek target). */
  private var startFrame = 0L

  fun format(builder: Format.Builder.() -> Unit = {}): Format =
    Format.Builder()
      .setSampleMimeType(MimeTypes.AUDIO_RAW)
      .setPcmEncoding(encoding)
      .setSampleRate(sampleRate)
      .setChannelCount(channels)
      .setMaxInputSize(MAX_FRAMES * channels * width)
      .apply(builder)
      .build()

  /** The next write starts at frame `at`; anything earlier than `target` is dropped. */
  fun seekTo(at: Long, target: Long) {
    nextFrame = at
    startFrame = target
  }

  /** The next write is frame `at` (for formats whose frames say where they start). */
  fun at(frame: Long) {
    nextFrame = frame
  }

  /** Interleaved ints (sign-extended at the source depth). */
  fun writeInts(samples: IntArray, frames: Int) {
    var from = skipFrames(frames)
    while (from < frames) {
      val count = minOf(MAX_FRAMES, frames - from)
      val bytes = count * channels * width
      ensure(bytes)
      var d = 0
      val end = (from + count) * channels
      var i = from * channels
      while (i < end) {
        var v = samples[i++] shl shift
        when (width) {
          1 -> buffer[d++] = (v + 128).toByte() // Media3's 8-bit PCM is unsigned
          2 -> { buffer[d++] = v.toByte(); buffer[d++] = (v shr 8).toByte() }
          3 -> { buffer[d++] = v.toByte(); buffer[d++] = (v shr 8).toByte(); buffer[d++] = (v shr 16).toByte() }
          else -> {
            if (encoding == C.ENCODING_PCM_FLOAT) v = samples[i - 1] // raw float bits, no shift
            buffer[d++] = v.toByte(); buffer[d++] = (v shr 8).toByte(); buffer[d++] = (v shr 16).toByte(); buffer[d++] = (v shr 24).toByte()
          }
        }
      }
      emit(bytes, count)
      from += count
    }
  }

  /** Interleaved floats (for [C.ENCODING_PCM_FLOAT]). */
  fun writeFloats(samples: FloatArray, frames: Int) {
    var from = skipFrames(frames)
    while (from < frames) {
      val count = minOf(MAX_FRAMES, frames - from)
      val bytes = count * channels * 4
      ensure(bytes)
      var d = 0
      for (i in from * channels until (from + count) * channels) {
        val v = java.lang.Float.floatToRawIntBits(samples[i])
        buffer[d++] = v.toByte(); buffer[d++] = (v shr 8).toByte(); buffer[d++] = (v shr 16).toByte(); buffer[d++] = (v shr 24).toByte()
      }
      emit(bytes, count)
      from += count
    }
  }

  /** Little-endian PCM bytes already in [encoding]. */
  fun writeBytes(bytes: ByteArray, frames: Int) {
    val frameBytes = channels * width
    var from = skipFrames(frames)
    while (from < frames) {
      val count = minOf(MAX_FRAMES, frames - from)
      ensure(count * frameBytes)
      System.arraycopy(bytes, from * frameBytes, buffer, 0, count * frameBytes)
      emit(count * frameBytes, count)
      from += count
    }
  }

  /** How many leading frames of a block of `frames` fall before the seek target. */
  private fun skipFrames(frames: Int): Int {
    val skip = (startFrame - nextFrame).coerceIn(0L, frames.toLong()).toInt()
    nextFrame += skip
    return skip
  }

  private fun ensure(bytes: Int) {
    if (buffer.size < bytes) buffer = ByteArray(bytes)
  }

  private fun emit(bytes: Int, frames: Int) {
    holder.reset(buffer, bytes)
    output.sampleData(holder, bytes)
    output.sampleMetadata(nextFrame * 1_000_000L / sampleRate, C.BUFFER_FLAG_KEY_FRAME, bytes, 0, null)
    nextFrame += frames
  }

  companion object {
    /** About 90 ms at 44.1 kHz per sample: short enough for quick seeks and steady buffering. */
    const val MAX_FRAMES = 4096
  }
}

/**
 * Header reads through Media3's input, by peeking ahead of where it is. Reads
 * behind the current spot, or far ahead (so a header parser never pulls the
 * whole song into memory), come back null: parsers treat that as "not there".
 */
internal fun peekReader(input: ExtractorInput, limit: Long = 4L shl 20): ReadAt = reader@{ position, length ->
  val ahead = position - input.position
  if (ahead < 0 || length < 0 || ahead + length > limit) return@reader null
  input.resetPeekPosition()
  if (ahead > 0 && !input.advancePeekPosition(ahead.toInt(), true)) return@reader null
  val bytes = ByteArray(length)
  // Asking past the end is "not there", like everywhere else a parser reads.
  try {
    if (!input.peekFully(bytes, 0, length, true)) null else bytes
  } catch (_: java.io.EOFException) {
    null
  }
}

/** The input's length, or a huge number when the source does not say. */
internal fun lengthOf(input: ExtractorInput): Long = if (input.length == C.LENGTH_UNSET.toLong()) Long.MAX_VALUE / 4 else input.length
