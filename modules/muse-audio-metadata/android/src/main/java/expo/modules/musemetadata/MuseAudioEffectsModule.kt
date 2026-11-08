package expo.modules.musemetadata

import android.content.Intent
import android.media.audiofx.AudioEffect
import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.os.Build
import android.provider.Settings
import androidx.annotation.OptIn
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.sharedobjects.SharedRef
import java.lang.ref.WeakReference

/** Phone makers' Dolby apps. Listed in this module's manifest <queries> so they are visible. */
private val DOLBY_PACKAGES = listOf(
  "com.dolby.daxappui",
  "com.dolby.dax2appUI",
  "com.dolby.ds1appUI",
  "com.motorola.dolby.dolbyui",
)

private const val MAX_FAILED_IN_A_ROW = 5

/** The equalizer, already turned into band values by JS (src/equalizer/sound.ts). */
class EffectsConfig : Record {
  @Field val enabled: Boolean = false
  /** Upper edge of each band, in Hz, rising. */
  @Field val cutoffs: List<Double> = emptyList()
  /** Gain of each band in dB, headroom included. */
  @Field val gains: List<Double> = emptyList()
}

/**
 * Muse's equalizer, attached to the player's own audio session so it changes
 * only Muse's audio. DynamicsProcessing (Android 9+) takes the bands exactly;
 * older phones get the basic Equalizer. Off means no effect exists at all.
 * Also hands Muse's session to the phone's own equalizer, and keeps the
 * player alive after a song fails (see `sessionListener`).
 */
@OptIn(UnstableApi::class)
class MuseAudioEffectsModule : Module() {
  private var player: WeakReference<ExoPlayer>? = null
  /** The session the effect sits on; 0 when there is none. */
  private var session = 0
  private var dynamics: DynamicsProcessing? = null
  private var dynamicsBands = 0
  private var equalizer: Equalizer? = null
  /** The session the phone's equalizer was told about. */
  @Volatile private var announcedSession = 0
  /** The last settings, re-applied when the player gets a new audio session. */
  private var lastConfig: EffectsConfig? = null
  /** Songs skipped in a row because they failed, so a queue of only broken files stops. */
  private var failedInARow = 0

  private val sessionListener = object : Player.Listener {
    override fun onAudioSessionIdChanged(audioSessionId: Int) {
      announce(audioSessionId)
      lastConfig?.let { applyConfig(it) }
    }

    // expo-audio's playlist calls prepare() only once. After any error (a broken or
    // missing file) ExoPlayer sits idle and every later play() does nothing until the
    // app restarts. So: skip a song that fails mid-play, and prepare again on play.
    override fun onPlayerError(error: PlaybackException) {
      val exo = player?.get() ?: return
      if (exo.playWhenReady && exo.hasNextMediaItem() && failedInARow < MAX_FAILED_IN_A_ROW) {
        failedInARow += 1
        exo.seekToNextMediaItem()
        exo.prepare()
      } else {
        // Left idle; the next play below prepares it.
        exo.pause()
      }
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      val exo = player?.get() ?: return
      if (playWhenReady && exo.playbackState == Player.STATE_IDLE && exo.mediaItemCount > 0) {
        failedInARow = 0
        exo.prepare()
      }
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      if (isPlaying) {
        failedInARow = 0
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MuseAudioEffects")

    AsyncFunction("attach") { ref: SharedRef<*> ->
      val exo = ref.ref as? ExoPlayer ?: return@AsyncFunction false
      player?.get()?.removeListener(sessionListener)
      exo.addListener(sessionListener)
      player = WeakReference(exo)
      announce(exo.audioSessionId)
      lastConfig?.let { applyConfig(it) }
      true
    }.runOnQueue(Queues.MAIN)

    // Main thread: ExoPlayer may only be read on its own looper.
    AsyncFunction("apply") { config: EffectsConfig ->
      lastConfig = config
      applyConfig(config)
    }.runOnQueue(Queues.MAIN)

    // The phone's equalizer for Muse's session (Samsung, Xiaomi, Wavelet...), else
    // its Dolby app, else sound settings. Plain tries: no <queries> needed.
    Function("openPhoneEqualizer") {
      val context = appContext.currentActivity ?: appContext.reactContext ?: return@Function false
      val panel = Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL)
        .putExtra(AudioEffect.EXTRA_AUDIO_SESSION, announcedSession)
        .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
        .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)
      val dolby = DOLBY_PACKAGES.firstNotNullOfOrNull { context.packageManager.getLaunchIntentForPackage(it) }
      listOfNotNull(panel, dolby, Intent(Settings.ACTION_SOUND_SETTINGS)).any { intent ->
        attempt { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } != null
      }
    }

    OnDestroy {
      // May run off the main thread, where ExoPlayer refuses; the player is going away anyway.
      attempt { player?.get()?.removeListener(sessionListener) }
      release()
      announce(0)
    }
  }

  /** Tells the phone's equalizer apps which session is Muse's music. */
  private fun announce(id: Int) {
    if (id == announcedSession) {
      return
    }
    val context = appContext.reactContext ?: return
    fun send(action: String, sessionId: Int) = attempt {
      context.sendBroadcast(
        Intent(action)
          .putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sessionId)
          .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
          .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC),
      )
    }
    if (announcedSession != 0) {
      send(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION, announcedSession)
    }
    if (id != 0) {
      send(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION, id)
    }
    announcedSession = id
  }

  private fun applyConfig(config: EffectsConfig): Boolean {
    if (!config.enabled) {
      release()
      return true
    }
    val id = player?.get()?.audioSessionId ?: 0
    // 0 would be the phone's global output mix: never touch other apps' sound.
    if (id == 0) {
      return false
    }
    if (id != session || (dynamics != null && dynamicsBands != config.cutoffs.size)) {
      create(id, config.cutoffs.size)
    }
    applyBands(config)
    return true
  }

  private fun create(id: Int, bands: Int) {
    release()
    session = id
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && bands > 0) {
      dynamics = attempt {
        val config = DynamicsProcessing.Config.Builder(
          DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
          2,
          true, bands, // pre-EQ: the bands
          false, 0, // no compressor
          false, 0, // no post-EQ
          false, // no limiter
        ).build()
        DynamicsProcessing(0, id, config)
      }
      dynamicsBands = if (dynamics != null) bands else 0
    }
    if (dynamics == null) {
      equalizer = attempt { Equalizer(0, id) }
    }
  }

  private fun applyBands(config: EffectsConfig) {
    val cutoffs = config.cutoffs
    val gains = config.gains
    dynamics?.let { dp ->
      attempt {
        for (index in 0 until minOf(dynamicsBands, cutoffs.size, gains.size)) {
          dp.setPreEqBandAllChannelsTo(
            index,
            DynamicsProcessing.EqBand(true, cutoffs[index].toFloat(), gains[index].toFloat()),
          )
        }
        dp.setEnabled(true)
      }
    }
    equalizer?.let { eq ->
      attempt {
        val range = eq.bandLevelRange
        for (band in 0 until eq.numberOfBands) {
          val centerHz = eq.getCenterFreq(band.toShort()) / 1000.0
          val gain = gainAt(centerHz, cutoffs, gains)
          val level = (gain * 100).toInt().coerceIn(range[0].toInt(), range[1].toInt())
          eq.setBandLevel(band.toShort(), level.toShort())
        }
        eq.setEnabled(true)
      }
    }
  }

  private fun release() {
    attempt { dynamics?.release() }
    attempt { equalizer?.release() }
    dynamics = null
    dynamicsBands = 0
    equalizer = null
    session = 0
  }

  /** The band gain whose range holds `hz`. */
  private fun gainAt(hz: Double, cutoffs: List<Double>, gains: List<Double>): Double {
    val index = cutoffs.indexOfFirst { hz <= it }
    return gains.getOrNull(if (index == -1) gains.size - 1 else index) ?: 0.0
  }

  /** Audio effects throw on phones that lack them or when another app holds them. */
  private inline fun <T> attempt(block: () -> T): T? = try {
    block()
  } catch (_: Exception) {
    null
  }
}
