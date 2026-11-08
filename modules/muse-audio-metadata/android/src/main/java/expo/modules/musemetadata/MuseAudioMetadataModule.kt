package expo.modules.musemetadata

import android.content.BroadcastReceiver
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
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
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

// Not public constants before Android 10, but the columns exist on the files
// table on every version. expo-media-library uses the same ones for albums.
private const val BUCKET_ID = "bucket_id"
private const val BUCKET_DISPLAY_NAME = "bucket_display_name"
private const val ARTWORK_SIZE = 512
private val ALBUM_ART_URI: Uri = Uri.parse("content://media/external/audio/albumart")

class MuseAudioMetadataModule : Module() {
  /** Headphones or Bluetooth audio went away. Registered only while JS listens. */
  private var noisyReceiver: BroadcastReceiver? = null
  /** Media volume changes (buttons, other apps). Registered only while JS listens. */
  private var volumeObserver: ContentObserver? = null

  override fun definition() = ModuleDefinition {
    Name("MuseAudioMetadata")

    Events("onAudioBecomingNoisy", "onVolumeChange")

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
        override fun onChange(selfChange: Boolean) {
          val audio = audioManager() ?: return
          sendEvent("onVolumeChange", mapOf("volume" to mediaVolume(audio)))
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
    val albumId = resolver.query(
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.Audio.Media.ALBUM_ID),
      "${MediaStore.Audio.Media._ID} = ?",
      arrayOf(trackId),
      null,
    )?.use { result ->
      if (result.moveToFirst()) result.longOrNull(MediaStore.Audio.Media.ALBUM_ID) else null
    }?.takeIf { it > 0 }

    val directory = File(cacheDir, "muse-artwork").apply { mkdirs() }
    // Per song: Android groups untagged files in one folder into one album,
    // so an album-keyed file showed the first song's cover on all of them.
    val file = File(directory, "track-$trackId.jpg")
    if (file.exists() && file.length() > 0) {
      return Uri.fromFile(file).toString()
    }

    val bitmap = loadArtworkBitmap(resolver, trackRowId, albumId) ?: return null
    val partial = File(directory, "${file.name}.part")
    FileOutputStream(partial).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
    if (!partial.renameTo(file)) {
      partial.delete()
      return null
    }
    return Uri.fromFile(file).toString()
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
  private fun readEmbeddedPicture(resolver: ContentResolver, trackUri: Uri): Bitmap? {
    val bytes = runCatching {
      resolver.openFileDescriptor(trackUri, "r")?.use { descriptor ->
        val retriever = MediaMetadataRetriever()
        try {
          retriever.setDataSource(descriptor.fileDescriptor)
          retriever.embeddedPicture
        } finally {
          retriever.release()
        }
      }
    }.getOrNull() ?: return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= ARTWORK_SIZE) {
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
          break
        }
      } finally {
        extractor.release()
      }
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
      "size" to size,
    )
  }

  /**
   * Hue (0-360) and colorfulness (0-1) of a song's cover, from its saved small
   * JPEG shrunk to about 32x32. Each pixel counts by how colorful it is, so a
   * bright spot on a grey cover still decides the hue, and hues are averaged
   * around the color wheel, so red and pink do not average to green.
   */
  private fun readArtworkColor(resolver: ContentResolver, cacheDir: File, trackId: String): Map<String, Double>? {
    val uri = readArtworkFile(resolver, cacheDir, trackId) ?: return null
    val path = Uri.parse(uri).path ?: return null
    val bitmap = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = 16 })
      ?: return null
    try {
      val hsv = FloatArray(3)
      var x = 0.0
      var y = 0.0
      var weight = 0.0
      val pixels = bitmap.width * bitmap.height
      for (px in 0 until bitmap.width) {
        for (py in 0 until bitmap.height) {
          Color.colorToHSV(bitmap.getPixel(px, py), hsv)
          val colorfulness = (hsv[1] * hsv[2]).toDouble()
          val angle = Math.toRadians(hsv[0].toDouble())
          x += cos(angle) * colorfulness
          y += sin(angle) * colorfulness
          weight += colorfulness
        }
      }
      if (pixels == 0 || weight == 0.0) {
        return null
      }
      val hue = (Math.toDegrees(atan2(y, x)) + 360.0) % 360.0
      return mapOf("hue" to hue, "colorfulness" to weight / pixels)
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

  /** `length` bytes at `position`, or null if the file is shorter. */
  private fun readAt(channel: FileChannel, position: Long, length: Int): ByteArray? {
    if (length < 0 || position < 0 || position + length > channel.size()) {
      return null
    }
    val buffer = ByteBuffer.allocate(length)
    var offset = position
    while (buffer.hasRemaining()) {
      val read = channel.read(buffer, offset)
      if (read <= 0) {
        return null
      }
      offset += read
    }
    return buffer.array()
  }

  private fun u8(bytes: ByteArray, at: Int): Int = bytes[at].toInt() and 0xFF

  private fun int32(bytes: ByteArray, at: Int): Int =
    (u8(bytes, at) shl 24) or (u8(bytes, at + 1) shl 16) or (u8(bytes, at + 2) shl 8) or u8(bytes, at + 3)

  private fun int32le(bytes: ByteArray, at: Int): Int =
    u8(bytes, at) or (u8(bytes, at + 1) shl 8) or (u8(bytes, at + 2) shl 16) or (u8(bytes, at + 3) shl 24)

  private fun syncsafe(bytes: ByteArray, at: Int): Int =
    (u8(bytes, at) shl 21) or (u8(bytes, at + 1) shl 14) or (u8(bytes, at + 2) shl 7) or u8(bytes, at + 3)

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

  /** A top-level box's content as [start, end) file offsets. */
  private fun mp4BoxInFile(channel: FileChannel, type: String): Pair<Long, Long>? {
    var position = 0L
    val fileSize = channel.size()
    repeat(1_000) {
      if (position + 8 > fileSize) {
        return null
      }
      val header = readAt(channel, position, 16.coerceAtMost((fileSize - position).toInt())) ?: return null
      var size = int32(header, 0).toLong() and 0xFFFFFFFFL
      var headerSize = 8
      if (size == 1L && header.size >= 16) {
        size = ByteBuffer.wrap(header, 8, 8).long
        headerSize = 16
      } else if (size == 0L) {
        size = fileSize - position
      }
      if (size < headerSize) {
        return null
      }
      if (String(header, 4, 4, Charsets.ISO_8859_1) == type) {
        return Pair(position + headerSize, position + size)
      }
      position += size
    }
    return null
  }

  /** A child box's content as [start, end) offsets within `data`. */
  private fun mp4Box(data: ByteArray, from: Int, to: Int, type: String): Pair<Int, Int>? {
    var position = from
    while (position + 8 <= to) {
      val size = int32(data, position)
      if (size < 8 || position + size > to) {
        return null
      }
      if (String(data, position + 4, 4, Charsets.ISO_8859_1) == type) {
        return Pair(position + 8, position + size)
      }
      position += size
    }
    return null
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
