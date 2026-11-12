package expo.modules.musemetadata.playback

import android.content.Context
import android.net.Uri
import android.os.Handler
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.RenderersFactory
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorsFactory

/**
 * What expo-audio builds its player from (patches/expo-audio+*.patch looks
 * this class up by name, so R8 keeps it: app.json extraProguardRules).
 */
object MusePlayback {
  @JvmStatic
  fun renderersFactory(context: Context): RenderersFactory {
    MuseOutput.load(context)
    return MuseRenderersFactory(context.applicationContext)
  }

  @JvmStatic
  fun extractorsFactory(): ExtractorsFactory = MuseExtractorsFactory()
}

/** Hi-Res float output, Muse's output stage, and Muse's ALAC decoder first. */
internal class MuseRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
  init {
    setEnableAudioFloatOutput(MuseOutput.hiRes)
    // Float output skips Media3's own speed step, so speed goes to Android's track instead.
    setEnableAudioOutputPlaybackParameters(true)
  }

  override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioOutputPlaybackParameters: Boolean): AudioSink =
    DefaultAudioSink.Builder(context)
      .setEnableFloatOutput(enableFloatOutput)
      .setEnableAudioOutputPlaybackParameters(enableAudioOutputPlaybackParameters)
      .setAudioOutputProvider(MuseAudioOutputProvider(context))
      .build()

  override fun buildAudioRenderers(
    context: Context,
    extensionRendererMode: Int,
    mediaCodecSelector: MediaCodecSelector,
    enableDecoderFallback: Boolean,
    audioSink: AudioSink,
    eventHandler: Handler,
    eventListener: AudioRendererEventListener,
    out: ArrayList<Renderer>,
  ) {
    out.add(AlacRenderer(eventHandler, eventListener, audioSink))
    super.buildAudioRenderers(context, extensionRendererMode, mediaCodecSelector, enableDecoderFallback, audioSink, eventHandler, eventListener, out)
  }
}

/** Media3's readers plus Muse's for AIFF, DSD, APE and WavPack (tried first: their checks are a few bytes). */
internal class MuseExtractorsFactory : ExtractorsFactory {
  private val defaults = DefaultExtractorsFactory()

  private fun ours(): Array<Extractor> = arrayOf(AiffExtractor(), DsdExtractor(), ApeExtractor(), WavPackExtractor())

  override fun createExtractors(): Array<Extractor> = ours() + defaults.createExtractors()

  override fun createExtractors(uri: Uri, responseHeaders: Map<String, List<String>>): Array<Extractor> =
    ours() + defaults.createExtractors(uri, responseHeaders)
}
