package expo.modules.musemetadata.playback

import android.os.Handler
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.Util
import androidx.media3.decoder.CryptoConfig
import androidx.media3.decoder.DecoderException
import androidx.media3.decoder.DecoderInputBuffer
import androidx.media3.decoder.SimpleDecoder
import androidx.media3.decoder.SimpleDecoderOutputBuffer
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DecoderAudioRenderer
import expo.modules.musemetadata.formats.AlacDecoder
import expo.modules.musemetadata.formats.FormatException
import java.nio.ByteOrder

/**
 * Apple Lossless (.m4a) on every phone: Media3 reads the MP4, Muse decodes
 * (formats/AlacDecoder.kt, bit-exact with Apple's decoder) at the file's own
 * depth. Placed before the phone's decoders, which many phones lack for ALAC
 * and some cut to 16-bit.
 */
internal class AlacRenderer(handler: Handler?, listener: AudioRendererEventListener?, sink: AudioSink) :
  DecoderAudioRenderer<AlacMediaDecoder>(handler, listener, sink) {

  override fun getName() = "MuseAlac"

  override fun supportsFormatInternal(format: Format): Int {
    if (!MimeTypes.AUDIO_ALAC.equals(format.sampleMimeType, ignoreCase = true)) return C.FORMAT_UNSUPPORTED_TYPE
    val cookie = format.initializationData.firstOrNull() ?: return C.FORMAT_UNSUPPORTED_SUBTYPE
    val decoder = runCatching { AlacDecoder(cookie) }.getOrNull() ?: return C.FORMAT_UNSUPPORTED_SUBTYPE
    return if (sinkSupportsFormat(outputFormat(decoder))) C.FORMAT_HANDLED else C.FORMAT_UNSUPPORTED_SUBTYPE
  }

  override fun createDecoder(format: Format, cryptoConfig: CryptoConfig?): AlacMediaDecoder =
    AlacMediaDecoder(format.initializationData.first(), format.maxInputSize)

  override fun getOutputFormat(decoder: AlacMediaDecoder): Format = outputFormat(decoder.alac)

  private fun outputFormat(alac: AlacDecoder): Format = Util.getPcmFormat(
    encodingFor(alac.info.bitsPerSample),
    alac.info.channels,
    alac.info.sampleRate,
  )
}

private fun encodingFor(bits: Int): Int = when {
  bits <= 16 -> C.ENCODING_PCM_16BIT
  bits <= 24 -> C.ENCODING_PCM_24BIT
  else -> C.ENCODING_PCM_32BIT
}

internal class AlacMediaDecoder(cookie: ByteArray, maxInputSize: Int) :
  SimpleDecoder<DecoderInputBuffer, SimpleDecoderOutputBuffer, DecoderException>(
    // Empty slots: SimpleDecoder fills them through createInputBuffer/createOutputBuffer.
    @Suppress("UNCHECKED_CAST") (arrayOfNulls<DecoderInputBuffer>(BUFFERS) as Array<DecoderInputBuffer>),
    @Suppress("UNCHECKED_CAST") (arrayOfNulls<SimpleDecoderOutputBuffer>(BUFFERS) as Array<SimpleDecoderOutputBuffer>),
  ) {
  val alac = try {
    AlacDecoder(cookie)
  } catch (error: FormatException) {
    throw DecoderException("Bad ALAC config", error)
  }
  private val channels = alac.info.channels
  private val bits = alac.info.bitsPerSample
  private val width = if (bits <= 16) 2 else if (bits <= 24) 3 else 4
  private val shift = width * 8 - bits
  /** ALAC channel order -> WAVE position, for 3 or more channels. */
  private val wave: IntArray = WAVE_ORDER[channels] ?: IntArray(channels) { it }
  private var packet = ByteArray(0)

  init {
    if (maxInputSize != Format.NO_VALUE) setInitialInputBufferSize(maxInputSize)
  }

  override fun getName() = "MuseAlac"

  override fun createInputBuffer() = DecoderInputBuffer(DecoderInputBuffer.BUFFER_REPLACEMENT_MODE_NORMAL)

  override fun createOutputBuffer() = SimpleDecoderOutputBuffer { releaseOutputBuffer(it) }

  override fun createUnexpectedDecodeException(error: Throwable) = DecoderException("ALAC decode failed", error)

  override fun decode(inputBuffer: DecoderInputBuffer, outputBuffer: SimpleDecoderOutputBuffer, reset: Boolean): DecoderException? {
    val data = inputBuffer.data ?: return null
    val length = data.remaining()
    if (packet.size < length) packet = ByteArray(length)
    data.get(packet, 0, length)
    val block = try {
      alac.decode(packet, 0, length)
    } catch (error: FormatException) {
      return DecoderException("Damaged ALAC packet", error)
    }
    val out = outputBuffer.init(inputBuffer.timeUs, block.frames * channels * width).order(ByteOrder.LITTLE_ENDIAN)
    val samples = block.samples
    for (frame in 0 until block.frames) {
      val base = frame * channels
      // Write channel `i` of the frame at its WAVE position.
      for (position in 0 until channels) {
        val v = samples[base + sourceFor(position)] shl shift
        when (width) {
          2 -> out.putShort(v.toShort())
          3 -> { out.put(v.toByte()); out.put((v shr 8).toByte()); out.put((v shr 16).toByte()) }
          else -> out.putInt(v)
        }
      }
    }
    out.flip()
    return null
  }

  /** The ALAC channel that belongs at WAVE `position`. */
  private val inverse = IntArray(channels).also { inverse -> wave.forEachIndexed { alacIndex, wavePos -> inverse[wavePos] = alacIndex } }
  private fun sourceFor(position: Int) = inverse[position]

  private companion object {
    const val BUFFERS = 16

    // From the decoder's notes: WAVE position of each ALAC output channel.
    val WAVE_ORDER = mapOf(
      3 to intArrayOf(2, 0, 1),
      4 to intArrayOf(2, 0, 1, 3),
      5 to intArrayOf(2, 0, 1, 3, 4),
      6 to intArrayOf(2, 0, 1, 4, 5, 3),
      7 to intArrayOf(2, 0, 1, 4, 5, 6, 3),
      8 to intArrayOf(2, 6, 7, 0, 1, 4, 5, 3),
    )
  }
}
