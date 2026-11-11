package expo.modules.musemetadata

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioFormat
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.provider.BaseColumns
import android.provider.MediaStore
import android.util.Size
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.channels.FileChannel
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

// Not public constants before Android 10, but the columns exist on the files
// table on every version. expo-media-library uses the same ones for albums.
private const val BUCKET_ID = "bucket_id"
private const val BUCKET_DISPLAY_NAME = "bucket_display_name"
private const val ARTWORK_SIZE = 512
/** Album art for songs without a picture of their own is asked for at up to this size. */
private const val FULL_ARTWORK_SIZE = 4096
/** Pictures with more pixels than this (4000 x 4000) are scaled down: Android cannot draw bitmaps over about 100 MB. */
private const val MAX_FULL_PIXELS = 16_000_000L
/** Longest side of the lock screen's picture. Android shows it at about 1000 px at most. */
private const val LOCK_SCREEN_SIZE = 1440
/** Slices of the color wheel a cover's colors are tallied in (15 degrees each). */
private const val HUE_SLICES = 24
/** A second color counts when it covers at least this share of the main one's area. */
private const val SECOND_COLOR_SHARE = 0.25
private val ALBUM_ART_URI: Uri = Uri.parse("content://media/external/audio/albumart")
/** Launcher aliases made by plugins/withAppIcons.js; keep in step with plugins/app-icons.json. */
private val APP_ICON_IDS = listOf("muse", "light", "lime", "mono", "paper", "ocean")
/** Outputs that count as headphones coming back (not the speaker, not HDMI). */
private val HEADPHONE_TYPES = setOf(
  AudioDeviceInfo.TYPE_WIRED_HEADSET,
  AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
  AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
  AudioDeviceInfo.TYPE_USB_HEADSET,
  // TYPE_BLE_HEADSET (API 31) by value, so older SDKs still compile.
  26,
)

class MuseAudioMetadataModule : Module() {
  /** Headphones or Bluetooth audio went away. Registered only while JS listens. */
  private var noisyReceiver: BroadcastReceiver? = null
  /** Media volume changes (buttons, other apps). Registered only while JS listens. */
  private var volumeObserver: ContentObserver? = null
  /** Headphones or Bluetooth audio came back. Registered only while JS listens. */
  private var deviceCallback: AudioDeviceCallback? = null

  override fun definition() = ModuleDefinition {
    Name("MuseAudioMetadata")

    Events("onAudioBecomingNoisy", "onVolumeChange", "onHeadphonesConnected")

    OnStartObserving("onHeadphonesConnected") {
      val audio = audioManager() ?: return@OnStartObserving
      if (deviceCallback != null) {
        return@OnStartObserving
      }
      val callback = object : AudioDeviceCallback() {
        // Android reports every device already connected right after
        // registering; only the ones that arrive later are a reconnect.
        private var primed = false

        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
          if (!primed) {
            primed = true
            return
          }
          if (addedDevices.any { it.isSink && it.type in HEADPHONE_TYPES }) {
            sendEvent("onHeadphonesConnected", emptyMap<String, Any>())
          }
        }
      }
      audio.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
      deviceCallback = callback
    }

    OnStopObserving("onHeadphonesConnected") {
      val callback = deviceCallback ?: return@OnStopObserving
      deviceCallback = null
      runCatching { audioManager()?.unregisterAudioDeviceCallback(callback) }
    }

    // Switches the launcher icon: enables one alias, then turns the others off,
    // so there is never a moment with no launcher entry. Throws (and changes
    // nothing) when this build has no such alias, such as Expo Go.
    Function("setAppIcon") { id: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot change its icon right now.")
      val packageManager = context.packageManager
      val alias = { name: String -> ComponentName(context.packageName, "${context.packageName}.MuseIcon_$name") }
      packageManager.getActivityInfo(alias(id), PackageManager.MATCH_DISABLED_COMPONENTS)
      packageManager.setComponentEnabledSetting(
        alias(id),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP,
      )
      APP_ICON_IDS.filter { it != id }.forEach { other ->
        packageManager.setComponentEnabledSetting(
          alias(other),
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP,
        )
      }
    }

    // Muse has no crash reporting and testers have no cable for the phone's
    // log, so a crash's reason is kept for the next launch to show.
    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      if (previous !is CrashRecorder) {
        Thread.setDefaultUncaughtExceptionHandler(CrashRecorder(crashFile(context), previous))
      }
    }

    // The last crash's report, once (it is deleted as it is read); null when there was none.
    Function("takeLastCrash") {
      val file = appContext.reactContext?.let(::crashFile) ?: return@Function null
      if (!file.isFile) {
        return@Function null
      }
      val report = runCatching { file.readText() }.getOrNull()
      file.delete()
      report
    }

    // Ends Muse's process after a backup restore. Closing the screen is not
    // enough: media playback keeps the process (and its old saved values in
    // memory) alive, and they would be written back over the restored ones.
    Function("closeApp") {
      android.os.Process.killProcess(android.os.Process.myPid())
    }

    // True when this build has the icon aliases (a Muse build made with the plugin).
    Function("canSetAppIcon") {
      val context = appContext.reactContext ?: return@Function false
      runCatching {
        context.packageManager.getActivityInfo(
          ComponentName(context.packageName, "${context.packageName}.MuseIcon_muse"),
          PackageManager.MATCH_DISABLED_COMPONENTS,
        )
      }.isSuccess
    }

    // The phone's media volume, 0 to 1: the same one the volume buttons move.
    Function("getVolume") {
      val audio = audioManager() ?: return@Function null
      mediaVolume(audio)
    }

    Function("setVolume") { volume: Double ->
      val audio = audioManager() ?: return@Function
      val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      val index = Math.round(volume.coerceIn(0.0, 1.0) * max).toInt()
      // Flag 0: no system volume panel, the slider is the feedback.
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
    }

    OnStartObserving("onVolumeChange") {
      val context = appContext.reactContext ?: return@OnStartObserving
      if (volumeObserver != null) {
        return@OnStartObserving
      }
      val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        // Every system setting lands here (auto brightness writes many a
        // minute); only a new media volume is sent to JS.
        private var lastVolume = -1.0

        override fun onChange(selfChange: Boolean) {
          val audio = audioManager() ?: return
          val volume = mediaVolume(audio)
          if (volume != lastVolume) {
            lastVolume = volume
            sendEvent("onVolumeChange", mapOf("volume" to volume))
          }
        }
      }
      context.contentResolver.registerContentObserver(Settings.System.CONTENT_URI, true, observer)
      volumeObserver = observer
    }

    OnStopObserving("onVolumeChange") {
      val observer = volumeObserver ?: return@OnStopObserving
      volumeObserver = null
      runCatching { appContext.reactContext?.contentResolver?.unregisterContentObserver(observer) }
    }

    // Lyrics saved inside the song file, or null when it has none.
    AsyncFunction("getLyrics") { trackId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readLyrics(context.contentResolver, trackId)
    }

    OnStartObserving("onAudioBecomingNoisy") {
      val context = appContext.reactContext ?: return@OnStartObserving
      if (noisyReceiver != null) {
        return@OnStartObserving
      }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
            sendEvent("onAudioBecomingNoisy", emptyMap<String, Any>())
          }
        }
      }
      val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
      // A protected system broadcast, so it reaches a non-exported receiver.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
      noisyReceiver = receiver
    }

    OnStopObserving("onAudioBecomingNoisy") {
      val receiver = noisyReceiver ?: return@OnStopObserving
      noisyReceiver = null
      runCatching { appContext.reactContext?.unregisterReceiver(receiver) }
    }

    // Format, bitrate, sample rate and channels of one song, for the player.
    AsyncFunction("getAudioDetails") { trackId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readAudioDetails(context.contentResolver, trackId)
    }

    // Runs off the UI thread (AsyncFunction default queue).
    AsyncFunction("getAudioLibrary") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readAudioLibrary(context.contentResolver)
    }

    // A cheap fingerprint of the whole media library: Android raises each
    // volume's generation on every added, changed or removed file. Muse
    // compares it with the last scan and only rescans when it moved. Null
    // before Android 11, which has no generation, so callers scan instead.
    AsyncFunction("getLibraryVersion") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
        return@AsyncFunction null
      }
      val volumes = MediaStore.getExternalVolumeNames(context).sorted()
      buildString {
        append(MediaStore.getVersion(context))
        volumes.forEach { volume ->
          append('|').append(volume).append('=').append(MediaStore.getGeneration(context, volume))
        }
      }
    }

    // The cover's main hue, for the Dynamic accent. Null without a cover.
    AsyncFunction("getArtworkColor") { trackId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readArtworkColor(context.contentResolver, context.cacheDir, trackId)
    }

    AsyncFunction("getArtworkFile") { trackId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readArtworkFile(context.contentResolver, context.cacheDir, trackId)
    }

    // The list-size cover made from the best picture in the file.
    AsyncFunction("getCoverThumb") { trackId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readBestThumb(context.contentResolver, context.cacheDir, trackId)
    }

    // The cover at its full size: the best picture in the file, or Android's own choice.
    AsyncFunction("getFullCover") { trackId: String, best: Boolean ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readFullCover(context.contentResolver, context.cacheDir, trackId, best)
    }

    // Every picture in the file, full size, for Change cover.
    AsyncFunction("getFilePictures") { trackId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      readAllPictures(context.contentResolver, context.cacheDir, trackId)
    }

    // The main hue of any image file, such as a cover picked for a song.
    AsyncFunction("getImageColor") { uri: String ->
      Uri.parse(uri).path?.let { path -> colorOf(path) }
    }

    // A file:// picture the lock screen can take: expo-audio decodes it at full size.
    AsyncFunction("getLockScreenCover") { uri: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Muse cannot access the Android media library.")
      Uri.parse(uri).path?.let { path -> lockScreenCopy(context.cacheDir, File(path)) }
    }
  }

  /**
   * Every audio file with its folder and tags, in two queries total.
   *
   * Folder and song identity match expo-media-library exactly (folder =
   * BUCKET_ID / BUCKET_DISPLAY_NAME from the files table, song = _ID, uri =
   * file:// + DATA), so saved folder rules, history and queues stay valid.
   */
  private fun readAudioLibrary(resolver: ContentResolver): List<Map<String, Any?>> {
    val tagsById = readAudioTags(resolver)
    val tracks = mutableListOf<Map<String, Any?>>()
    val cursor = resolver.query(
      MediaStore.Files.getContentUri("external"),
      arrayOf(
        BaseColumns._ID,
        MediaStore.MediaColumns.DATA,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.DATE_ADDED,
        MediaStore.MediaColumns.DATE_MODIFIED,
        BUCKET_ID,
        BUCKET_DISPLAY_NAME,
      ),
      "${MediaStore.Files.FileColumns.MEDIA_TYPE} = ${MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO}",
      null,
      null,
    ) ?: throw IllegalStateException("Muse could not read your music library.")

    cursor.use { result ->
      while (result.moveToNext()) {
        val id = result.rawStringOrNull(BaseColumns._ID) ?: continue
        val folderId = result.rawStringOrNull(BUCKET_ID) ?: continue
        // expo-media-library skips folders without a name, so Muse does too.
        val folderTitle = result.rawStringOrNull(BUCKET_DISPLAY_NAME) ?: continue
        val data = result.rawStringOrNull(MediaStore.MediaColumns.DATA)
        val tags = tagsById[id]
        val filename = result.rawStringOrNull(MediaStore.MediaColumns.DISPLAY_NAME)
          ?: data?.substringAfterLast('/')
          ?: id
        val uri = if (data != null) {
          "file://$data"
        } else {
          ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id.toLong())
            .toString()
        }
        val directory = tags?.directory ?: data?.substringBeforeLast('/', "")?.plus("/")

        tracks.add(
          mapOf(
            "id" to id,
            "uri" to uri,
            "filename" to filename,
            "folderId" to folderId,
            "folderTitle" to folderTitle,
            "directory" to directory,
            "title" to tags?.title,
            "artist" to tags?.artist,
            "album" to tags?.album,
            "albumArtist" to tags?.albumArtist,
            "year" to tags?.year,
            "trackNumber" to tags?.trackNumber,
            "genre" to tags?.genre,
            "duration" to tags?.duration,
            // When the file arrived in the media library (seconds).
            "dateAdded" to result.longOrNull(MediaStore.MediaColumns.DATE_ADDED)
              ?.takeIf { it > 0 },
            // The file's own last-modified time from the filesystem (seconds),
            // as Poweramp uses. MediaStore records it at scan time; when it is
            // missing, read it from the file.
            "dateModified" to (
              result.longOrNull(MediaStore.MediaColumns.DATE_MODIFIED)?.takeIf { it > 0 }
                ?: data?.let { path ->
                  runCatching { File(path).lastModified() }.getOrNull()
                    ?.takeIf { it > 0 }
                    ?.div(1000)
                }
            ),
            "albumArtUri" to tags?.albumId?.let {
              ContentUris.withAppendedId(ALBUM_ART_URI, it).toString()
            },
          ),
        )
      }
    }
    return tracks
  }

  private class AudioTags(
    val title: String?,
    val artist: String?,
    val album: String?,
    val albumId: Long?,
    val albumArtist: String?,
    val year: Int?,
    val trackNumber: Int?,
    val duration: Double?,
    val directory: String?,
    val genre: String?,
  )

  private fun readAudioTags(resolver: ContentResolver): Map<String, AudioTags> {
    val isQOrLater = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    // Android 11 added a genre column. Older versions keep genres in their
    // own table, read once up front.
    val isROrLater = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val legacyGenres = if (isROrLater) emptyMap<String, String>() else readLegacyGenres(resolver)
    val projection = buildList {
      add(MediaStore.Audio.Media._ID)
      add(MediaStore.Audio.Media.TITLE)
      add(MediaStore.Audio.Media.ARTIST)
      add(MediaStore.Audio.Media.ALBUM)
      add(MediaStore.Audio.Media.ALBUM_ID)
      add(MediaStore.Audio.Media.YEAR)
      add(MediaStore.Audio.Media.TRACK)
      add(MediaStore.Audio.Media.DURATION)
      if (isQOrLater) {
        add(MediaStore.Audio.AudioColumns.ALBUM_ARTIST)
        add(MediaStore.MediaColumns.RELATIVE_PATH)
      }
      if (isROrLater) {
        add(MediaStore.Audio.AudioColumns.GENRE)
      }
    }.toTypedArray()
    val tags = HashMap<String, AudioTags>()
    resolver.query(
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
      projection,
      null,
      null,
      null,
    )?.use { result ->
      while (result.moveToNext()) {
        val id = result.rawStringOrNull(MediaStore.Audio.Media._ID) ?: continue
        tags[id] = AudioTags(
          title = result.stringOrNull(MediaStore.Audio.Media.TITLE),
          artist = result.stringOrNull(MediaStore.Audio.Media.ARTIST),
          album = result.stringOrNull(MediaStore.Audio.Media.ALBUM),
          albumId = result.longOrNull(MediaStore.Audio.Media.ALBUM_ID)?.takeIf { it > 0 },
          albumArtist = if (isQOrLater) {
            result.stringOrNull(MediaStore.Audio.AudioColumns.ALBUM_ARTIST)
          } else {
            null
          },
          year = result.longOrNull(MediaStore.Audio.Media.YEAR)?.takeIf { it > 0 }?.toInt(),
          trackNumber = result.longOrNull(MediaStore.Audio.Media.TRACK)
            ?.takeIf { it > 0 }
            ?.toInt(),
          duration = result.longOrNull(MediaStore.Audio.Media.DURATION)?.div(1000.0),
          directory = if (isQOrLater) {
            result.stringOrNull(MediaStore.MediaColumns.RELATIVE_PATH)
          } else {
            null
          },
          genre = if (isROrLater) {
            result.stringOrNull(MediaStore.Audio.AudioColumns.GENRE)
          } else {
            legacyGenres[id]
          },
        )
      }
    }
    return tags
  }

  /**
   * Genre names by song id from the genres table, for Android 10 and older.
   * Genres are optional, so any failure just leaves songs without one.
   */
  private fun readLegacyGenres(resolver: ContentResolver): Map<String, String> {
    val genres = HashMap<String, String>()
    runCatching {
      resolver.query(
        MediaStore.Audio.Genres.EXTERNAL_CONTENT_URI,
        arrayOf(MediaStore.Audio.Genres._ID, MediaStore.Audio.Genres.NAME),
        null,
        null,
        null,
      )?.use { result ->
        while (result.moveToNext()) {
          val genreId = result.longOrNull(MediaStore.Audio.Genres._ID) ?: continue
          val name = result.stringOrNull(MediaStore.Audio.Genres.NAME) ?: continue
          resolver.query(
            MediaStore.Audio.Genres.Members.getContentUri("external", genreId),
            arrayOf(MediaStore.Audio.Genres.Members.AUDIO_ID),
            null,
            null,
            null,
          )?.use { members ->
            while (members.moveToNext()) {
              val audioId = members.rawStringOrNull(MediaStore.Audio.Genres.Members.AUDIO_ID)
                ?: continue
              genres.putIfAbsent(audioId, name)
            }
          }
        }
      }
    }
    return genres
  }

  /**
   * A small cached JPEG of the song's album art, as a file:// uri, or null if
   * the song has no art. The lock screen loads artwork through java.net.URL,
   * which cannot open content:// uris, so it needs a real file.
   */
  private fun readArtworkFile(resolver: ContentResolver, cacheDir: File, trackId: String): String? {
    val trackRowId = trackId.toLongOrNull() ?: return null
    // Per song: Android groups untagged files in one folder into one album,
    // so an album-keyed file showed the first song's cover on all of them.
    val file = File(artworkDirectory(cacheDir), "track-$trackId.jpg")
    if (file.exists() && file.length() > 0) {
      return Uri.fromFile(file).toString()
    }

    val bitmap = loadArtworkBitmap(resolver, trackRowId, albumIdOf(resolver, trackId)) ?: return null
    val saved = writeAtomically(file) { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
    bitmap.recycle()
    return if (saved) Uri.fromFile(file).toString() else null
  }

  private fun albumIdOf(resolver: ContentResolver, trackId: String): Long? =
    resolver.query(
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.Audio.Media.ALBUM_ID),
      "${MediaStore.Audio.Media._ID} = ?",
      arrayOf(trackId),
      null,
    )?.use { result ->
      if (result.moveToFirst()) result.longOrNull(MediaStore.Audio.Media.ALBUM_ID) else null
    }?.takeIf { it > 0 }

  /** Saved covers live under cache/muse-artwork (Settings › Storage clears it); full-size ones in "full". */
  private fun artworkDirectory(cacheDir: File, child: String? = null): File {
    val root = File(cacheDir, "muse-artwork")
    return (if (child == null) root else File(root, child)).apply { mkdirs() }
  }

  /** Writes through a .part file, so a half-written cover is never picked up. */
  private fun writeAtomically(file: File, write: (FileOutputStream) -> Unit): Boolean {
    val partial = File(file.parentFile, "${file.name}.part")
    val saved = runCatching {
      FileOutputStream(partial).use(write)
      partial.renameTo(file)
    }.getOrDefault(false)
    if (!saved) {
      partial.delete()
    }
    return saved
  }

  private fun trackUriOf(trackId: String): Uri? =
    trackId.toLongOrNull()?.let { ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, it) }

  /** Every picture in the song's tags (FilePictures.kt). */
  private fun picturesOf(resolver: ContentResolver, trackId: String): List<FilePicture> {
    val uri = trackUriOf(trackId) ?: return emptyList()
    return runCatching {
      resolver.openFileDescriptor(uri, "r")?.use { descriptor ->
        // Not closed itself: `use` closes the descriptor under it.
        readFilePictures(FileInputStream(descriptor.fileDescriptor).channel)
      }
    }.getOrNull() ?: emptyList()
  }

  /**
   * The list-size cover made from the best picture in the file (see
   * bestPicture). A file whose pictures Muse cannot read gets Android's.
   */
  private fun readBestThumb(resolver: ContentResolver, cacheDir: File, trackId: String): String? {
    val file = File(artworkDirectory(cacheDir), "best-$trackId.jpg")
    if (file.exists() && file.length() > 0) {
      return Uri.fromFile(file).toString()
    }
    val best = bestPicture(picturesOf(resolver, trackId)) ?: return readArtworkFile(resolver, cacheDir, trackId)
    val bitmap = decodeScaled(best.bytes, ARTWORK_SIZE) ?: return readArtworkFile(resolver, cacheDir, trackId)
    val saved = writeAtomically(file) { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
    bitmap.recycle()
    return if (saved) Uri.fromFile(file).toString() else null
  }

  /**
   * The cover at its full stored size, never re-compressed: the best picture
   * in the file (`best`), or the one Android picks. With no picture in the
   * file, the album's art as big as Android has it.
   */
  private fun readFullCover(resolver: ContentResolver, cacheDir: File, trackId: String, best: Boolean): Map<String, Any>? {
    val directory = artworkDirectory(cacheDir, "full")
    val name = if (best) "best-$trackId" else "file-$trackId"
    directory.listFiles()?.firstOrNull { it.nameWithoutExtension == name && it.length() > 0 }?.let {
      return describeImage(it)
    }
    val bytes = (if (best) bestPicture(picturesOf(resolver, trackId))?.bytes else null)
      ?: trackUriOf(trackId)?.let { embeddedBytes(resolver, it) }
    if (bytes != null) {
      val picture = FilePicture(-1, bytes)
      val file = File(directory, "$name.${picture.extension}")
      return if (savePicture(picture, file)) describeImage(file) else null
    }
    val bitmap = albumArtBitmap(resolver, trackId) ?: return null
    val file = File(directory, "$name.jpg")
    val saved = writeAtomically(file) { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }
    bitmap.recycle()
    return if (saved) describeImage(file) else null
  }

  /** Every picture in the file at full size, in file order, for Change cover. */
  private fun readAllPictures(resolver: ContentResolver, cacheDir: File, trackId: String): List<Map<String, Any>> {
    val pictures = picturesOf(resolver, trackId)
    val best = bestPicture(pictures)
    val directory = artworkDirectory(cacheDir, "full")
    return pictures.mapIndexedNotNull { index, picture ->
      val file = File(directory, "pic-$trackId-$index.${picture.extension}")
      if ((!file.exists() || file.length() == 0L) && !savePicture(picture, file)) {
        return@mapIndexedNotNull null
      }
      mapOf(
        "uri" to Uri.fromFile(file).toString(),
        "width" to picture.width,
        "height" to picture.height,
        "type" to picture.type,
        "best" to (picture === best),
      )
    }
  }

  /**
   * Writes a picture exactly as stored. Only one too big for Android to draw
   * (over MAX_FULL_PIXELS) is scaled down, by halves, and saved as JPEG.
   */
  private fun savePicture(picture: FilePicture, file: File): Boolean {
    if (picture.area <= MAX_FULL_PIXELS) {
      return writeAtomically(file) { it.write(picture.bytes) }
    }
    var sample = 2
    while (picture.area / (sample.toLong() * sample) > MAX_FULL_PIXELS) {
      sample *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = runCatching {
      BitmapFactory.decodeByteArray(picture.bytes, 0, picture.bytes.size, options)
    }.getOrNull() ?: return false
    return writeAtomically(file) { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }.also { bitmap.recycle() }
  }

  /**
   * The picture at most LOCK_SCREEN_SIZE on its longest side: itself when it
   * already is, else a JPEG copy in cache/muse-artwork/lock, made once. Null
   * when it cannot be read.
   */
  private fun lockScreenCopy(cacheDir: File, source: File): String? {
    if (!source.isFile) {
      return null
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(source.path, bounds)
    val longest = maxOf(bounds.outWidth, bounds.outHeight)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return null
    }
    if (longest <= LOCK_SCREEN_SIZE) {
      return Uri.fromFile(source).toString()
    }
    // Named by folder, name and change time, so a replaced picture gets a new copy.
    val file = File(
      artworkDirectory(cacheDir, "lock"),
      "${source.parentFile?.name}-${source.nameWithoutExtension}-${source.lastModified()}.jpg",
    )
    if (file.exists() && file.length() > 0) {
      return Uri.fromFile(file).toString()
    }
    // Halves first (cheap, while decoding), then the exact size.
    var sample = 1
    while (longest / (sample * 2) >= LOCK_SCREEN_SIZE) {
      sample *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val decoded = runCatching { BitmapFactory.decodeFile(source.path, options) }.getOrNull() ?: return null
    val scale = LOCK_SCREEN_SIZE.toFloat() / maxOf(decoded.width, decoded.height)
    val bitmap = if (scale < 1f) {
      runCatching {
        Bitmap.createScaledBitmap(
          decoded,
          (decoded.width * scale).toInt().coerceAtLeast(1),
          (decoded.height * scale).toInt().coerceAtLeast(1),
          true,
        )
      }.getOrNull() ?: decoded
    } else {
      decoded
    }
    val saved = writeAtomically(file) { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
    if (bitmap !== decoded) {
      bitmap.recycle()
    }
    decoded.recycle()
    return if (saved) Uri.fromFile(file).toString() else null
  }

  private fun describeImage(file: File): Map<String, Any> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "width" to bounds.outWidth.coerceAtLeast(0),
      "height" to bounds.outHeight.coerceAtLeast(0),
    )
  }

  /** The album's art at the biggest size Android keeps, for songs with no picture of their own. */
  private fun albumArtBitmap(resolver: ContentResolver, trackId: String): Bitmap? {
    val albumId = albumIdOf(resolver, trackId) ?: return null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return runCatching {
        resolver.loadThumbnail(
          ContentUris.withAppendedId(MediaStore.Audio.Albums.EXTERNAL_CONTENT_URI, albumId),
          Size(FULL_ARTWORK_SIZE, FULL_ARTWORK_SIZE),
          null,
        )
      }.getOrNull()
    }
    return runCatching {
      resolver.openInputStream(ContentUris.withAppendedId(ALBUM_ART_URI, albumId))?.use {
        BitmapFactory.decodeStream(it)
      }
    }.getOrNull()
  }

  private fun loadArtworkBitmap(resolver: ContentResolver, trackRowId: Long, albumId: Long?): Bitmap? {
    val trackUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, trackRowId)
    // The song's own embedded cover first; the album's only as a fallback.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val size = Size(ARTWORK_SIZE, ARTWORK_SIZE)
      return runCatching { resolver.loadThumbnail(trackUri, size, null) }.getOrNull()
        ?: albumId?.let { id ->
          runCatching {
            resolver.loadThumbnail(
              ContentUris.withAppendedId(MediaStore.Audio.Albums.EXTERNAL_CONTENT_URI, id),
              size,
              null,
            )
          }.getOrNull()
        }
    }

    readEmbeddedPicture(resolver, trackUri)?.let { return it }
    val id = albumId ?: return null
    return runCatching {
      resolver.openInputStream(ContentUris.withAppendedId(ALBUM_ART_URI, id))?.use {
        BitmapFactory.decodeStream(it)
      }
    }.getOrNull()
  }

  /** Android 9 and older: the cover embedded in the file, scaled near ARTWORK_SIZE. */
  private fun readEmbeddedPicture(resolver: ContentResolver, trackUri: Uri): Bitmap? =
    embeddedBytes(resolver, trackUri)?.let { decodeScaled(it, ARTWORK_SIZE) }

  /** The one embedded picture Android picks, as stored in the file. */
  private fun embeddedBytes(resolver: ContentResolver, trackUri: Uri): ByteArray? =
    runCatching {
      resolver.openFileDescriptor(trackUri, "r")?.use { descriptor ->
        val retriever = MediaMetadataRetriever()
        try {
          retriever.setDataSource(descriptor.fileDescriptor)
          retriever.embeddedPicture
        } finally {
          retriever.release()
        }
      }
    }.getOrNull()

  /** Decodes at the smallest power-of-two step that stays at or above `size`. */
  private fun decodeScaled(bytes: ByteArray, size: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= size) {
      sample *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }.getOrNull()
  }

  /**
   * The container type, size and length come from MediaStore (and the bitrate
   * on Android 11+); the codec, sample rate and channels from the file's first
   * audio track. With no bitrate recorded, it is the file's average.
   */
  private fun readAudioDetails(resolver: ContentResolver, trackId: String): Map<String, Any?>? {
    val rowId = trackId.toLongOrNull() ?: return null
    val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, rowId)
    var mimeType: String? = null
    var size: Long? = null
    var durationMs: Long? = null
    var bitrate: Long? = null
    val projection = buildList {
      add(MediaStore.Audio.Media.MIME_TYPE)
      add(MediaStore.Audio.Media.SIZE)
      add(MediaStore.Audio.Media.DURATION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        add(MediaStore.Audio.Media.BITRATE)
      }
    }
    resolver.query(uri, projection.toTypedArray(), null, null, null)?.use { result ->
      if (result.moveToFirst()) {
        mimeType = result.stringOrNull(MediaStore.Audio.Media.MIME_TYPE)
        size = result.longOrNull(MediaStore.Audio.Media.SIZE)
        durationMs = result.longOrNull(MediaStore.Audio.Media.DURATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          bitrate = result.longOrNull(MediaStore.Audio.Media.BITRATE)?.takeIf { it > 0 }
        }
      }
    } ?: return null

    var codec: String? = null
    var sampleRate: Int? = null
    var channels: Int? = null
    var bitDepth: Int? = null
    runCatching {
      val extractor = MediaExtractor()
      try {
        resolver.openFileDescriptor(uri, "r")?.use { descriptor ->
          extractor.setDataSource(descriptor.fileDescriptor)
        }
        for (index in 0 until extractor.trackCount) {
          val format = extractor.getTrackFormat(index)
          val trackMime = format.getString(MediaFormat.KEY_MIME) ?: continue
          if (!trackMime.startsWith("audio/")) {
            continue
          }
          codec = trackMime
          if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
            sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          }
          if (format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
            channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          }
          if (bitrate == null && format.containsKey(MediaFormat.KEY_BIT_RATE)) {
            bitrate = format.getInteger(MediaFormat.KEY_BIT_RATE).toLong().takeIf { it > 0 }
          }
          bitDepth = extractorBitDepth(format)
          break
        }
      } finally {
        extractor.release()
      }
    }
    // FLAC and WAV state it in the header, for phones whose extractor does not.
    if (bitDepth == null) {
      bitDepth = runCatching {
        resolver.openFileDescriptor(uri, "r")?.use { descriptor ->
          readBitDepth(FileInputStream(descriptor.fileDescriptor).channel)
        }
      }.getOrNull()
    }
    val bytes = size
    val length = durationMs
    if (bitrate == null && bytes != null && length != null && length > 0) {
      bitrate = bytes * 8 * 1000 / length
    }
    return mapOf(
      "mimeType" to mimeType,
      "codec" to codec,
      "bitrate" to bitrate,
      "sampleRate" to sampleRate,
      "channels" to channels,
      "bitDepth" to bitDepth,
      "size" to size,
    )
  }

  /**
   * Bits per sample as the extractor reports it: "bits-per-sample" (FLAC,
   * ALAC on newer Android) or the PCM encoding (WAV). Null for lossy codecs.
   */
  private fun extractorBitDepth(format: MediaFormat): Int? {
    if (format.containsKey("bits-per-sample")) {
      return runCatching { format.getInteger("bits-per-sample") }.getOrNull()?.takeIf { it in 4..64 }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
      return when (runCatching { format.getInteger(MediaFormat.KEY_PCM_ENCODING) }.getOrNull()) {
        AudioFormat.ENCODING_PCM_8BIT -> 8
        AudioFormat.ENCODING_PCM_16BIT -> 16
        AudioFormat.ENCODING_PCM_24BIT_PACKED -> 24
        AudioFormat.ENCODING_PCM_32BIT, AudioFormat.ENCODING_PCM_FLOAT -> 32
        else -> null
      }
    }
    return null
  }

  /**
   * Hue (0-360) and colorfulness (0-1) of a song's cover, from its saved small
   * JPEG shrunk to about 32x32. Each pixel counts by how colorful it is, so a
   * bright spot on a grey cover still decides the hue, and hues are averaged
   * around the color wheel, so red and pink do not average to green.
   */
  private fun readArtworkColor(resolver: ContentResolver, cacheDir: File, trackId: String): Map<String, Double>? {
    val uri = readArtworkFile(resolver, cacheDir, trackId) ?: return null
    return Uri.parse(uri).path?.let { colorOf(it) }
  }

  /**
   * The colors of an image file, measured on a small copy (see readArtworkColor):
   * its main hue, a clearly different second hue when there is enough of one,
   * how saturated the main color is, and how bright the image is overall.
   * Hues are tallied in slices of the color wheel, each pixel by how colorful
   * it is, so a red and blue cover keeps its red and its blue instead of
   * averaging them into a purple it never had.
   */
  private fun colorOf(path: String): Map<String, Double>? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    // About 32 pixels a side is plenty for its colors, at any cover size.
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 32) {
      sample *= 2
    }
    val bitmap = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: return null
    try {
      val hsv = FloatArray(3)
      // Per slice: colorful area, the direction of its hues (to average them
      // around the wheel) and its saturation.
      val amount = DoubleArray(HUE_SLICES)
      val x = DoubleArray(HUE_SLICES)
      val y = DoubleArray(HUE_SLICES)
      val saturation = DoubleArray(HUE_SLICES)
      var brightness = 0.0
      val pixels = bitmap.width * bitmap.height
      for (px in 0 until bitmap.width) {
        for (py in 0 until bitmap.height) {
          Color.colorToHSV(bitmap.getPixel(px, py), hsv)
          val colorfulness = (hsv[1] * hsv[2]).toDouble()
          val slice = (hsv[0] / 360f * HUE_SLICES).toInt().coerceIn(0, HUE_SLICES - 1)
          val angle = Math.toRadians(hsv[0].toDouble())
          amount[slice] += colorfulness
          x[slice] += cos(angle) * colorfulness
          y[slice] += sin(angle) * colorfulness
          saturation[slice] += hsv[1] * colorfulness
          brightness += hsv[2]
        }
      }
      val total = amount.sum()
      if (pixels == 0 || total == 0.0) {
        return null
      }
      // A slice with its two neighbours, so a color on a slice edge counts whole.
      fun window(slice: Int) = (-1..1).map { (slice + it + HUE_SLICES) % HUE_SLICES }
      fun area(slice: Int) = window(slice).sumOf { amount[it] }
      fun hueAt(slice: Int): Double {
        val parts = window(slice)
        return (Math.toDegrees(atan2(parts.sumOf { y[it] }, parts.sumOf { x[it] })) + 360.0) % 360.0
      }
      val main = (0 until HUE_SLICES).maxByOrNull { area(it) } ?: return null
      val colors = mutableMapOf(
        "hue" to hueAt(main),
        "colorfulness" to total / pixels,
        "saturation" to window(main).sumOf { saturation[it] } / area(main),
        "lightness" to brightness / pixels,
      )
      // Three slices (45 degrees) away at least: another color, not a shade of the first.
      val second = (0 until HUE_SLICES)
        .filter { minOf(abs(it - main), HUE_SLICES - abs(it - main)) >= 3 }
        .maxByOrNull { area(it) }
      if (second != null && area(second) >= area(main) * SECOND_COLOR_SHARE) {
        colors["secondHue"] = hueAt(second)
      }
      return colors
    } finally {
      bitmap.recycle()
    }
  }

  private fun audioManager(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun mediaVolume(audio: AudioManager): Double {
    val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    return if (max <= 0) 0.0 else audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
  }

  // ---------------------------------------------------------------------------
  // Lyrics. Only the tag area is read, never the audio, and anything that does
  // not parse cleanly just means "no lyrics".

  private fun readLyrics(resolver: ContentResolver, trackId: String): String? {
    val rowId = trackId.toLongOrNull() ?: return null
    val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, rowId)
    return runCatching {
      resolver.openFileDescriptor(uri, "r")?.use { descriptor ->
        // Not closed itself: closing it would close the descriptor, which
        // `use` above already closes.
        lyricsFrom(FileInputStream(descriptor.fileDescriptor).channel)
      }
    }.getOrNull()?.replace("\u0000", "")?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun lyricsFrom(channel: FileChannel): String? {
    val head = readAt(channel, 0, 12) ?: return null
    return when {
      head[0] == 'I'.code.toByte() && head[1] == 'D'.code.toByte() && head[2] == '3'.code.toByte() ->
        id3Lyrics(channel, head)
      String(head, 0, 4, Charsets.ISO_8859_1) == "fLaC" -> flacLyrics(channel)
      String(head, 4, 4, Charsets.ISO_8859_1) == "ftyp" -> mp4Lyrics(channel)
      else -> null
    }
  }

  /** MP3: the USLT frame of an ID3v2.2, 2.3 or 2.4 tag. */
  private fun id3Lyrics(channel: FileChannel, header: ByteArray): String? {
    val version = u8(header, 3)
    val size = syncsafe(header, 6)
    if (version !in 2..4 || size <= 0 || size > 32_000_000) {
      return null
    }
    val tag = readAt(channel, 10, size) ?: return null
    var position = 0
    if (version >= 3 && (u8(header, 5) and 0x40) != 0 && size >= 4) {
      // Extended header: v2.4 counts its own size, v2.3 does not.
      position = if (version == 4) syncsafe(tag, 0) else int32(tag, 0) + 4
    }
    val idLength = if (version == 2) 3 else 4
    val headerLength = if (version == 2) 6 else 10
    while (position + headerLength <= size) {
      if (tag[position].toInt() == 0) {
        break // padding
      }
      val id = String(tag, position, idLength, Charsets.ISO_8859_1)
      val frameSize = when (version) {
        2 -> (u8(tag, position + 3) shl 16) or (u8(tag, position + 4) shl 8) or u8(tag, position + 5)
        4 -> syncsafe(tag, position + 4)
        else -> int32(tag, position + 4)
      }
      val start = position + headerLength
      if (frameSize <= 0 || start + frameSize > size) {
        break
      }
      if (id == "USLT" || id == "ULT") {
        return usltText(tag, start, frameSize)
      }
      position = start + frameSize
    }
    return null
  }

  /** A USLT frame: encoding, language, a description, then the lyrics. */
  private fun usltText(data: ByteArray, start: Int, length: Int): String? {
    if (length < 5) {
      return null
    }
    val end = start + length
    val encoding = u8(data, start)
    val charset = when (encoding) {
      1 -> Charsets.UTF_16
      2 -> Charsets.UTF_16BE
      3 -> Charsets.UTF_8
      else -> Charsets.ISO_8859_1
    }
    val wide = encoding == 1 || encoding == 2
    // Skip the description: it ends at a 0 byte (or a 00 00 pair for UTF-16).
    var position = start + 4
    while (position < end) {
      if (wide) {
        if (position + 1 < end && data[position].toInt() == 0 && data[position + 1].toInt() == 0) {
          position += 2
          break
        }
        position += 2
      } else {
        if (data[position].toInt() == 0) {
          position += 1
          break
        }
        position += 1
      }
    }
    if (position >= end) {
      return null
    }
    // UTF-16 text has its own byte-order mark; decode with one if the frame omits it.
    val text = String(data, position, end - position, charset)
    return text.trimStart('\uFEFF')
  }

  /** FLAC: the LYRICS (or UNSYNCEDLYRICS) Vorbis comment. */
  private fun flacLyrics(channel: FileChannel): String? {
    var position = 4L
    repeat(64) {
      val header = readAt(channel, position, 4) ?: return null
      val isLast = (u8(header, 0) and 0x80) != 0
      val type = u8(header, 0) and 0x7F
      val length = (u8(header, 1) shl 16) or (u8(header, 2) shl 8) or u8(header, 3)
      if (type == 4) {
        val block = readAt(channel, position + 4, length) ?: return null
        return vorbisLyrics(block)
      }
      if (isLast) {
        return null
      }
      position += 4 + length
    }
    return null
  }

  private fun vorbisLyrics(block: ByteArray): String? {
    if (block.size < 8) {
      return null
    }
    var position = 4 + int32le(block, 0)
    if (position + 4 > block.size) {
      return null
    }
    val count = int32le(block, position)
    position += 4
    repeat(count.coerceIn(0, 10_000)) {
      if (position + 4 > block.size) {
        return null
      }
      val length = int32le(block, position)
      if (length < 0 || position + 4 + length > block.size) {
        return null
      }
      val comment = String(block, position + 4, length, Charsets.UTF_8)
      val key = comment.substringBefore('=')
      if (key.equals("LYRICS", ignoreCase = true) || key.equals("UNSYNCEDLYRICS", ignoreCase = true)) {
        return comment.substringAfter('=')
      }
      position += 4 + length
    }
    return null
  }

  /** MP4/M4A: moov > udta > meta > ilst > (c)lyr > data. */
  private fun mp4Lyrics(channel: FileChannel): String? {
    val moov = mp4BoxInFile(channel, "moov") ?: return null
    val length = (moov.second - moov.first).toInt()
    if (length <= 0 || length > 16_000_000) {
      return null
    }
    val data = readAt(channel, moov.first, length) ?: return null
    val udta = mp4Box(data, 0, data.size, "udta") ?: return null
    val meta = mp4Box(data, udta.first, udta.second, "meta") ?: return null
    // meta is a "full box": 4 bytes of version and flags come first.
    val ilst = mp4Box(data, meta.first + 4, meta.second, "ilst") ?: return null
    val lyrics = mp4Box(data, ilst.first, ilst.second, "\u00A9lyr") ?: return null
    val text = mp4Box(data, lyrics.first, lyrics.second, "data") ?: return null
    // data: 4 bytes type, 4 bytes locale, then UTF-8 text.
    val start = text.first + 8
    return if (start < text.second) String(data, start, text.second - start, Charsets.UTF_8) else null
  }

  /** Trimmed value, with blanks and MediaStore's "<unknown>" treated as missing. */
  private fun Cursor.stringOrNull(column: String): String? {
    return rawStringOrNull(column)
      ?.trim()
      ?.takeIf(String::isNotEmpty)
      ?.takeIf { !it.equals("<unknown>", ignoreCase = true) }
  }

  private fun Cursor.rawStringOrNull(column: String): String? {
    val index = getColumnIndex(column)
    if (index < 0 || isNull(index)) {
      return null
    }
    return getString(index)
  }

  private fun Cursor.longOrNull(column: String): Long? {
    val index = getColumnIndex(column)
    return if (index < 0 || isNull(index)) null else getLong(index)
  }
}

private fun crashFile(context: Context) = File(context.filesDir, "last-crash.txt")

/** Writes the crash's reason to a file, then lets Android close Muse as usual. */
private class CrashRecorder(
  private val file: File,
  private val previous: Thread.UncaughtExceptionHandler?,
) : Thread.UncaughtExceptionHandler {
  override fun uncaughtException(thread: Thread, error: Throwable) {
    runCatching {
      val phone = "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}"
      file.writeText("$phone, thread ${thread.name}\n${error.stackTraceToString()}".take(20_000))
    }
    previous?.uncaughtException(thread, error)
  }
}
