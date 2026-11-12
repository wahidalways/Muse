package expo.modules.musemetadata.playback

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioMixerAttributes
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.media3.common.C
import androidx.media3.exoplayer.audio.AudioOutput
import androidx.media3.exoplayer.audio.AudioOutputProvider
import androidx.media3.exoplayer.audio.AudioTrackAudioOutputProvider
import androidx.media3.exoplayer.audio.ForwardingAudioOutput
import androidx.media3.exoplayer.audio.ForwardingAudioOutputProvider
import expo.modules.musemetadata.formats.PcmConverter
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Where Muse's sound goes, and how.
 *
 * Hi-Res: 24-bit and float songs reach Android at full precision (float
 * output), instead of being cut to 16-bit as Media3 does by default.
 *
 * Bit-perfect (Android 14+, USB DAC): Muse asks Android for a bit-perfect
 * mixer in the song's exact rate and depth, then writes whole-number samples
 * the DAC takes as they are. Volume, EQ and fades must not touch the samples
 * then; the output pins volume to 1 as a last guard. One known limit: Media3
 * fades in the first 20 ms after a start or seek, which Muse cannot turn off.
 */
object MuseOutput {
  @Volatile var hiRes = true
  @Volatile var bitPerfect = false
  @Volatile var dop = false

  /** What plays right now, for Song info and the Audio output settings page. */
  @Volatile var state: Map<String, Any?> = mapOf("mode" to "idle")
    private set

  private val listeners = mutableListOf<(Map<String, Any?>) -> Unit>()
  @Volatile private var context: Context? = null

  fun addListener(listener: (Map<String, Any?>) -> Unit) = synchronized(listeners) { listeners += listener }
  fun removeListener(listener: (Map<String, Any?>) -> Unit) = synchronized(listeners) { listeners -= listener }

  internal fun attach(context: Context) {
    this.context = context.applicationContext
  }

  @Volatile private var loaded = false

  /** Reads the saved choices once; the player is built before JS starts, so they live natively. */
  fun load(context: Context) {
    attach(context)
    if (loaded) return
    loaded = true
    val saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    hiRes = saved.getBoolean("hiRes", true)
    bitPerfect = saved.getBoolean("bitPerfect", false)
    dop = saved.getBoolean("dop", false)
  }

  fun save(context: Context, hiRes: Boolean, bitPerfect: Boolean, dop: Boolean) {
    attach(context)
    loaded = true
    this.hiRes = hiRes
    this.bitPerfect = bitPerfect
    this.dop = dop
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
      .putBoolean("hiRes", hiRes).putBoolean("bitPerfect", bitPerfect).putBoolean("dop", dop).apply()
  }

  private const val PREFERENCES = "muse-output"

  internal fun publish(next: Map<String, Any?>) {
    if (next == state) return
    state = next
    synchronized(listeners) { listeners.toList() }.forEach { runCatching { it(next) } }
  }

  /** Android can do bit-perfect at all (Android 14+). */
  val bitPerfectSupported: Boolean get() = Build.VERSION.SDK_INT >= 34

  internal fun audioManager(): AudioManager? = context?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  /** The connected USB DAC or headset, if any. */
  fun usbDevice(): AudioDeviceInfo? =
    audioManager()?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)?.firstOrNull {
      it.type == AudioDeviceInfo.TYPE_USB_DEVICE || it.type == AudioDeviceInfo.TYPE_USB_HEADSET
    }

  /** DoP can go out untouched: bit-perfect and DoP are on, and the DAC takes this rate in 24 or 32 bits. */
  fun canUseDop(rate: Int, channels: Int): Boolean {
    // Without Hi-Res, Media3 cuts samples to 16 bits first, which breaks DoP.
    if (!hiRes || !bitPerfect || !dop || !bitPerfectSupported) return false
    val device = usbDevice() ?: return false
    val manager = audioManager() ?: return false
    return Api34.bitPerfectFormats(manager, device).any {
      it.format.sampleRate == rate && it.format.channelCount == channels &&
        (it.format.encoding == AudioFormat.ENCODING_PCM_24BIT_PACKED || it.format.encoding == AudioFormat.ENCODING_PCM_32BIT)
    }
  }

  internal fun bitsOf(encoding: Int): Int = when (encoding) {
    AudioFormat.ENCODING_PCM_8BIT -> 8
    AudioFormat.ENCODING_PCM_16BIT -> 16
    AudioFormat.ENCODING_PCM_24BIT_PACKED -> 24
    AudioFormat.ENCODING_PCM_32BIT -> 32
    AudioFormat.ENCODING_PCM_FLOAT -> 32
    else -> 0
  }

  @RequiresApi(34)
  internal object Api34 {
    fun bitPerfectFormats(manager: AudioManager, device: AudioDeviceInfo): List<AudioMixerAttributes> =
      runCatching { manager.getSupportedMixerAttributes(device) }.getOrDefault(emptyList())
        .filter { it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT }
  }
}

/**
 * Media3's AudioTrack output, plus Muse's bit-perfect choice per song. The sink
 * keeps working in its own PCM (16-bit or float); when a bit-perfect mixer is
 * set, the AudioTrack is made in the DAC's integer format and
 * [ConvertingOutput] turns each sample into it exactly.
 */
internal class MuseAudioOutputProvider(
  context: Context,
  private val inner: AudioTrackAudioOutputProvider = AudioTrackAudioOutputProvider.Builder(context).build(),
) : ForwardingAudioOutputProvider(inner) {
  private class Plan(val encoding: Int, val device: AudioDeviceInfo?, val dop: Boolean, val silence: Boolean)

  /** The plan for each output config handed out (OutputConfig is a value type). */
  private val plans = object : LinkedHashMap<AudioOutputProvider.OutputConfig, Plan>() {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<AudioOutputProvider.OutputConfig, Plan>?) = size > 8
  }
  private var mixerDevice: AudioDeviceInfo? = null
  private var mixerAttributes: android.media.AudioAttributes? = null

  init {
    MuseOutput.attach(context)
  }

  override fun getOutputConfig(formatConfig: AudioOutputProvider.FormatConfig): AudioOutputProvider.OutputConfig {
    val config = super.getOutputConfig(formatConfig)
    val format = formatConfig.format
    val isDop = format.label == LABEL_DOP
    val isPcm = !config.isOffload && (config.encoding == C.ENCODING_PCM_16BIT || config.encoding == C.ENCODING_PCM_FLOAT)
    val sourceBits = if (format.pcmEncoding == C.ENCODING_PCM_FLOAT) (if (isDop) 24 else 32) else 16
    val base = mapOf(
      "sampleRate" to config.sampleRate,
      "channels" to format.channelCount,
      "pipelineBits" to if (config.encoding == C.ENCODING_PCM_FLOAT) 32 else 16,
      "float" to (config.encoding == C.ENCODING_PCM_FLOAT),
      "dop" to isDop,
    )
    var plan: Plan? = null
    var state: Map<String, Any?> = base + mapOf("mode" to if (config.encoding == C.ENCODING_PCM_FLOAT) "hiRes" else "standard")
    if (MuseOutput.bitPerfect && MuseOutput.bitPerfectSupported && isPcm) {
      val device = MuseOutput.usbDevice()
      val chosen = device?.let { choose(it, config.sampleRate, format.channelCount, config.encoding, formatConfig) }
      if (device == null) {
        clearMixer()
        state = state + ("note" to "noDac")
      } else if (chosen == null) {
        clearMixer()
        state = state + mapOf("note" to "dacRate", "device" to device.productName?.toString())
      } else {
        plan = Plan(chosen, device, isDop, silence = false)
        state = base + mapOf("mode" to "bitPerfect", "outputBits" to MuseOutput.bitsOf(chosen), "device" to device.productName?.toString())
      }
    } else {
      clearMixer()
    }
    // DoP that cannot reach a bit-perfect DAC would be noise: play silence instead.
    if (isDop && plan == null) {
      plan = Plan(config.encoding, null, dop = true, silence = true)
      state = state + mapOf("mode" to "dopBlocked")
    }
    plan?.let { synchronized(plans) { plans[config] = it } }
    MuseOutput.publish(state)
    return config
  }

  override fun getAudioOutput(config: AudioOutputProvider.OutputConfig): AudioOutput {
    val plan = synchronized(plans) { plans[config] } ?: return super.getAudioOutput(config)
    if (plan.silence) return SilentOutput(super.getAudioOutput(config))
    val inFrame = bytesPerSample(config.encoding)
    val outFrame = when (plan.encoding) {
      AudioFormat.ENCODING_PCM_16BIT -> 2
      AudioFormat.ENCODING_PCM_24BIT_PACKED -> 3
      else -> 4
    }
    val bufferSize = config.bufferSize / inFrame * outFrame
    val output = super.getAudioOutput(config.buildUpon().setEncoding(plan.encoding).setBufferSize(bufferSize).build())
    plan.device?.let { output.setPreferredDevice(it) }
    return ConvertingOutput(output, config.encoding, plan.encoding, plan.dop, Integer.bitCount(config.channelMask).coerceAtLeast(1))
  }

  override fun release() {
    clearMixer()
    super.release()
  }

  /** The DAC's bit-perfect format for this song, set as Android's preferred mixer. Null when it has none at this rate. */
  private fun choose(device: AudioDeviceInfo, rate: Int, channels: Int, encoding: Int, formatConfig: AudioOutputProvider.FormatConfig): Int? {
    if (Build.VERSION.SDK_INT < 34) return null
    val manager = MuseOutput.audioManager() ?: return null
    val offered = MuseOutput.Api34.bitPerfectFormats(manager, device).filter { it.format.sampleRate == rate && it.format.channelCount == channels }
    // 16-bit songs prefer 16-bit (then padded); deeper songs never go down to 16.
    val order = if (encoding == C.ENCODING_PCM_16BIT) {
      listOf(AudioFormat.ENCODING_PCM_16BIT, AudioFormat.ENCODING_PCM_24BIT_PACKED, AudioFormat.ENCODING_PCM_32BIT)
    } else {
      listOf(AudioFormat.ENCODING_PCM_24BIT_PACKED, AudioFormat.ENCODING_PCM_32BIT, AudioFormat.ENCODING_PCM_FLOAT)
    }
    val mixer = order.firstNotNullOfOrNull { wanted -> offered.firstOrNull { it.format.encoding == wanted } } ?: return null
    val attributes = formatConfig.audioAttributes.platformAudioAttributes
    if (mixerDevice?.id == device.id && runCatching { manager.getPreferredMixerAttributes(attributes, device) }.getOrNull() == mixer) {
      return mixer.format.encoding
    }
    val ok = runCatching { manager.setPreferredMixerAttributes(attributes, device, mixer) }.getOrDefault(false)
    if (!ok) return null
    mixerDevice = device
    mixerAttributes = attributes
    return mixer.format.encoding
  }

  private fun clearMixer() {
    val device = mixerDevice ?: return
    val attributes = mixerAttributes ?: return
    mixerDevice = null
    mixerAttributes = null
    if (Build.VERSION.SDK_INT >= 34) {
      runCatching { MuseOutput.audioManager()?.clearPreferredMixerAttributes(attributes, device) }
    }
  }
}

/**
 * Writes the sink's samples (16-bit or float) to an AudioTrack in the DAC's
 * format, exactly: a 24-bit sample carried as float comes back as the same
 * 24 bits. Volume stays at 1 so nothing scales the samples. For DoP, any
 * frame whose marker is not intact (Media3's start-up fade, or anything else
 * that touched it) is sent as DSD silence, never as noise.
 */
internal class ConvertingOutput(
  private val inner: AudioOutput,
  private val from: Int,
  private val to: Int,
  private val dop: Boolean,
  private val channels: Int,
) : ForwardingAudioOutput(inner) {
  private val inBytes = bytesPerSample(from)
  private val outBytes = when (to) {
    AudioFormat.ENCODING_PCM_16BIT -> 2
    AudioFormat.ENCODING_PCM_24BIT_PACKED -> 3
    else -> 4
  }
  private val identity = from == to || (from == C.ENCODING_PCM_FLOAT && to == AudioFormat.ENCODING_PCM_FLOAT)
  private var converted: ByteBuffer = ByteBuffer.allocateDirect(0)
  private var source: ByteBuffer? = null
  private var sourceStart = 0
  private val converter = PcmConverter(
    fromFloat = from == C.ENCODING_PCM_FLOAT,
    outBytes = outBytes,
    outFloat = to == AudioFormat.ENCODING_PCM_FLOAT,
    dop = dop,
    channels = channels,
  )

  override fun setVolume(volume: Float) = super.setVolume(1f)

  override fun write(buffer: ByteBuffer, encodedAccessUnitCount: Int, presentationTimeUs: Long): Boolean {
    if (identity && !dop) return super.write(buffer, encodedAccessUnitCount, presentationTimeUs)
    if (source !== buffer || converted.position() * inBytes / outBytes + sourceStart != buffer.position()) {
      convert(buffer)
    }
    val done = inner.write(converted, 1, presentationTimeUs)
    // Move the sink's buffer on by as many samples as reached the track.
    buffer.position(sourceStart + converted.position() / outBytes * inBytes)
    if (done) source = null
    return done
  }

  override fun flush() {
    source = null
    converter.reset()
    super.flush()
  }

  private fun convert(buffer: ByteBuffer) {
    val samples = buffer.remaining() / inBytes
    if (converted.capacity() < samples * outBytes) {
      converted = ByteBuffer.allocateDirect(samples * outBytes * 2).order(ByteOrder.nativeOrder())
    }
    converted.clear()
    converter.convert(buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN), samples, converted)
    converted.flip()
    source = buffer
    sourceStart = buffer.position()
  }
}

/** Plays silence in place of a stream that must not be heard as is (DoP without a DoP DAC). */
internal class SilentOutput(private val inner: AudioOutput) : ForwardingAudioOutput(inner) {
  private var zeros: ByteBuffer = ByteBuffer.allocateDirect(0)
  private var source: ByteBuffer? = null
  private var sourceStart = 0

  override fun write(buffer: ByteBuffer, encodedAccessUnitCount: Int, presentationTimeUs: Long): Boolean {
    if (source !== buffer || sourceStart + zeros.position() != buffer.position()) {
      val length = buffer.remaining()
      if (zeros.capacity() < length) zeros = ByteBuffer.allocateDirect(length * 2).order(ByteOrder.nativeOrder())
      zeros.clear()
      zeros.put(ByteArray(length))
      zeros.flip()
      source = buffer
      sourceStart = buffer.position()
    }
    val done = inner.write(zeros, 1, presentationTimeUs)
    buffer.position(sourceStart + zeros.position())
    if (done) source = null
    return done
  }

  override fun flush() {
    source = null
    super.flush()
  }
}
