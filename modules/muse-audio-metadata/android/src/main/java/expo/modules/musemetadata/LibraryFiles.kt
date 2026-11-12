package expo.modules.musemetadata

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import android.provider.MediaStore
import expo.modules.musemetadata.formats.ReadAt
import expo.modules.musemetadata.formats.TagValues
import expo.modules.musemetadata.formats.Tags
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.nio.channels.FileChannel
import java.security.MessageDigest

// Songs Android's media library cannot list or tag:
// - APE, WavPack, DSF and DFF have no MIME type on Android, so the media
//   library never lists them and Muse's audio permission cannot see them.
//   People pick folders for them (Android's folder picker); Muse scans those.
// - WAV and AIFF tags are skipped by Android's scanner, so Muse reads them.

/** Extensions only a picked folder can bring in. */
internal val PICKED_ONLY_EXTENSIONS = setOf("ape", "wv", "dsf", "dff")

/** Formats whose tags Muse always reads itself. */
private val SELF_TAGGED_EXTENSIONS = setOf("wav", "wave", "aif", "aiff", "aifc")

internal fun extensionOf(name: String): String = name.substringAfterLast('.', "").lowercase()

internal fun channelReader(channel: FileChannel): ReadAt = { position, length -> readAt(channel, position, length) }

/** Turns Muse's track ids into readable files: digits = media library row, "doc-..." = a picked-folder file. */
internal object TrackFiles {
  private const val MAP_FILE = "doc-tracks-v1.json"
  @Volatile private var docs: Map<String, String>? = null

  fun uriOf(context: Context, trackId: String): Uri? {
    trackId.toLongOrNull()?.let { return ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, it) }
    if (!trackId.startsWith("doc-")) return null
    return loaded(context)[trackId]?.let(Uri::parse)
  }

  fun remember(context: Context, map: Map<String, String>) {
    docs = map
    runCatching { File(context.filesDir, MAP_FILE).writeText(JSONObject(map).toString()) }
  }

  private fun loaded(context: Context): Map<String, String> = docs ?: runCatching {
    val json = JSONObject(File(context.filesDir, MAP_FILE).readText())
    json.keys().asSequence().associateWith { json.getString(it) }
  }.getOrDefault(emptyMap()).also { docs = it }

  /** Opens the song read-only and runs `block` on its channel; null when it cannot be read. */
  fun <T> withChannel(context: Context, trackId: String, block: (FileChannel) -> T?): T? {
    val uri = uriOf(context, trackId) ?: return null
    return runCatching {
      context.contentResolver.openFileDescriptor(uri, "r")?.use { descriptor ->
        // Not closed itself: `use` closes the descriptor under it.
        block(FileInputStream(descriptor.fileDescriptor).channel)
      }
    }.getOrNull()
  }
}

/**
 * Tags Muse read itself, kept between scans (a scan only reruns when the
 * library changed, but then every WAV would be opened again). Keyed by song
 * id, checked against the file's time and size.
 */
internal class FileTagCache(private val file: File) {
  private val old: JSONObject = runCatching { JSONObject(file.readText()) }.getOrDefault(JSONObject())
  private val next = JSONObject()

  fun get(id: String, stamp: String, read: () -> TagValues?): TagValues? {
    val saved = old.optJSONObject(id)
    val values = if (saved != null && saved.optString("stamp") == stamp) fromJson(saved) else read()
    if (values != null) next.put(id, toJson(values).put("stamp", stamp))
    return values
  }

  fun save() {
    runCatching { file.writeText(next.toString()) }
  }

  private fun toJson(values: TagValues) = JSONObject().apply {
    put("title", values.title); put("artist", values.artist); put("album", values.album)
    put("albumArtist", values.albumArtist); put("genre", values.genre); put("year", values.year)
    put("track", values.trackNumber); put("duration", values.durationSeconds)
  }

  private fun fromJson(json: JSONObject) = TagValues().apply {
    title = json.optString("title").takeIf { json.has("title") && !json.isNull("title") }
    artist = json.optString("artist").takeIf { json.has("artist") && !json.isNull("artist") }
    album = json.optString("album").takeIf { json.has("album") && !json.isNull("album") }
    albumArtist = json.optString("albumArtist").takeIf { json.has("albumArtist") && !json.isNull("albumArtist") }
    genre = json.optString("genre").takeIf { json.has("genre") && !json.isNull("genre") }
    year = if (json.isNull("year")) null else json.optInt("year").takeIf { json.has("year") }
    trackNumber = if (json.isNull("track")) null else json.optInt("track").takeIf { json.has("track") }
    durationSeconds = if (json.isNull("duration")) null else json.optDouble("duration").takeIf { json.has("duration") }
  }
}

internal object LibraryFiles {
  /** Whether Muse should read this media-library row's tags itself. */
  fun wantsOwnTags(filename: String, title: String?, artist: String?): Boolean {
    if (extensionOf(filename) in SELF_TAGGED_EXTENSIONS) return true
    // Android filled the title from the file name and found no artist: its scanner missed the tags.
    return artist == null && (title == null || title == filename.substringBeforeLast('.'))
  }

  fun isSelfTagged(filename: String) = extensionOf(filename) in SELF_TAGGED_EXTENSIONS

  fun readTags(context: Context, trackId: String): TagValues? =
    TrackFiles.withChannel(context, trackId) { channel -> Tags.read(channelReader(channel), channel.size()) }

  fun tagCache(context: Context) = FileTagCache(File(context.filesDir, "file-tags-v1.json"))

  /**
   * All files access (opt-in, Settings > Library): Muse may read any file, so
   * it finds APE, WavPack and DSD anywhere on its own. Before Android 11 the
   * storage permission already allowed that.
   */
  fun hasAllFilesAccess(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

  /** Phone storage and SD cards, as folders Muse can walk. */
  private fun storageRoots(context: Context): List<File> {
    val roots = mutableListOf<File>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val manager = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
      manager?.storageVolumes?.forEach { volume -> volume.directory?.let(roots::add) }
    }
    if (roots.isEmpty()) {
      @Suppress("DEPRECATION")
      roots += Environment.getExternalStorageDirectory()
    }
    return roots.filter { it.canRead() }.distinctBy { it.absolutePath }
  }

  /** APE, WavPack and DSD files anywhere on the phone, when All files access is on. */
  fun readStorageTracks(context: Context, cache: FileTagCache, idToUri: MutableMap<String, String>): List<Map<String, Any?>> {
    val tracks = mutableListOf<Map<String, Any?>>()
    val roots = storageRoots(context)
    val files = indexedFiles(context) ?: buildList { for (root in roots) walkFiles(root, root, 0) { add(it) } }
    for (file in files) {
      val root = roots.firstOrNull { file.path.startsWith(it.path + "/") } ?: file.parentFile ?: continue
      if (file.path.startsWith(root.path + "/Android/")) continue
      val uri = Uri.fromFile(file).toString()
      val id = "doc-" + hash(uri)
      idToUri[id] = uri
      val parent = file.parentFile ?: root
      val tags = cache.get(id, "${file.lastModified()}:${file.length()}") {
        runCatching {
          java.io.RandomAccessFile(file, "r").use { raf -> Tags.read(channelReader(raf.channel), raf.length()) }
        }.getOrNull()
      }
      val relative = parent.absolutePath.removePrefix(root.absolutePath).trim('/')
      tracks += trackRow(
        id, uri, file.name,
        folderId = "doc-" + hash("dir:" + parent.absolutePath),
        folderTitle = parent.name.ifEmpty { "Storage" },
        directory = if (relative.isEmpty()) "" else "$relative/",
        tags = tags,
        modified = file.lastModified(),
      )
    }
    return tracks
  }

  /**
   * These files from Android's index of every file on the phone, which All
   * files access lets Muse see in full: one query instead of opening every
   * folder, and always up to date. Null when the query fails (Muse then walks
   * the folders itself). Hidden folders and Android/ are left out, as in the walk.
   */
  private fun indexedFiles(context: Context): List<File>? = runCatching {
    val name = MediaStore.MediaColumns.DISPLAY_NAME
    val selection = PICKED_ONLY_EXTENSIONS.joinToString(" OR ") { "LOWER($name) LIKE ?" }
    val args = PICKED_ONLY_EXTENSIONS.map { "%.$it" }.toTypedArray()
    @Suppress("DEPRECATION")
    val data = MediaStore.MediaColumns.DATA
    context.contentResolver.query(MediaStore.Files.getContentUri("external"), arrayOf(data), selection, args, null)?.use { cursor ->
      val column = cursor.getColumnIndexOrThrow(data)
      buildList {
        while (cursor.moveToNext()) {
          val path = cursor.getString(column) ?: continue
          if ("/." in path) continue
          val file = File(path)
          if (extensionOf(file.name) in PICKED_ONLY_EXTENSIONS && file.isFile) add(file)
        }
      }
    }
  }.getOrNull()

  /** Skips hidden folders and Android/ (other apps' private data, often huge). */
  private fun walkFiles(root: File, folder: File, depth: Int, found: (File) -> Unit) {
    if (depth > 20) return
    val children = folder.listFiles() ?: return
    for (child in children) {
      if (child.name.startsWith(".")) continue
      if (child.isDirectory) {
        if (depth == 0 && child.name == "Android") continue
        walkFiles(root, child, depth + 1, found)
      } else if (extensionOf(child.name) in PICKED_ONLY_EXTENSIONS) {
        found(child)
      }
    }
  }

  private fun trackRow(
    id: String,
    uri: String,
    name: String,
    folderId: String,
    folderTitle: String,
    directory: String,
    tags: TagValues?,
    modified: Long,
  ): Map<String, Any?> = mapOf(
    "id" to id,
    "uri" to uri,
    "filename" to name,
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
    "duration" to tags?.durationSeconds,
    "dateAdded" to modified / 1000,
    "dateModified" to modified / 1000,
    // Any content:// address sends cover requests to the native side, which looks the song up by id.
    "albumArtUri" to "content://muse.covers/$id",
  )

  /** The folders people picked for formats the media library cannot list. */
  fun pickedTrees(context: Context): List<Uri> =
    context.contentResolver.persistedUriPermissions.filter { it.isReadPermission }.map { it.uri }
      .filter { DocumentsContract.isTreeUri(it) }

  /**
   * Songs in the picked folders, in the same shape as the media library's
   * rows. Ids are "doc-" plus a hash of the file's address, so they stay the
   * same across scans (history, playlists and queues keep working).
   */
  fun readPickedTracks(context: Context, cache: FileTagCache): List<Map<String, Any?>> {
    val idToUri = mutableMapOf<String, String>()
    if (hasAllFilesAccess(context)) {
      // Picked folders are inside storage too, so they would only add doubles.
      return readStorageTracks(context, cache, idToUri).also { TrackFiles.remember(context, idToUri) }
    }
    val tracks = mutableListOf<Map<String, Any?>>()
    for (tree in pickedTrees(context)) {
      val rootId = runCatching { DocumentsContract.getTreeDocumentId(tree) }.getOrNull() ?: continue
      val rootName = displayName(context, DocumentsContract.buildDocumentUriUsingTree(tree, rootId)) ?: "Folder"
      walk(context, tree, rootId, "$rootName/", 0) { docId, name, parentId, parentName, path, modified, size ->
        val uri = DocumentsContract.buildDocumentUriUsingTree(tree, docId)
        val id = "doc-" + hash(uri.toString())
        idToUri[id] = uri.toString()
        val tags = cache.get(id, "$modified:$size") {
          runCatching {
            context.contentResolver.openFileDescriptor(uri, "r")?.use { descriptor ->
              val channel = FileInputStream(descriptor.fileDescriptor).channel
              Tags.read(channelReader(channel), channel.size())
            }
          }.getOrNull()
        }
        tracks += trackRow(
          id, uri.toString(), name,
          folderId = "doc-" + hash(tree.toString() + "|" + parentId),
          folderTitle = parentName,
          directory = path,
          tags = tags,
          modified = modified,
        )
      }
    }
    TrackFiles.remember(context, idToUri)
    return tracks
  }

  private fun walk(
    context: Context,
    tree: Uri,
    folderId: String,
    path: String,
    depth: Int,
    found: (docId: String, name: String, parentId: String, parentName: String, path: String, modified: Long, size: Long) -> Unit,
  ) {
    if (depth > 16) return
    val parentName = path.trimEnd('/').substringAfterLast('/')
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, folderId)
    val columns = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_LAST_MODIFIED,
      DocumentsContract.Document.COLUMN_SIZE,
    )
    val folders = mutableListOf<Pair<String, String>>()
    runCatching {
      context.contentResolver.query(children, columns, null, null, null)?.use { cursor ->
        while (cursor.moveToNext()) {
          val docId = cursor.getString(0) ?: continue
          val name = cursor.getString(1) ?: continue
          if (name.startsWith(".")) continue
          if (cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) {
            folders += docId to name
          } else if (extensionOf(name) in PICKED_ONLY_EXTENSIONS) {
            found(docId, name, folderId, parentName, path, cursor.getLong(3), cursor.getLong(4))
          }
        }
      }
    }
    for ((docId, name) in folders) walk(context, tree, docId, "$path$name/", depth + 1, found)
  }

  fun displayName(context: Context, uri: Uri): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use {
      if (it.moveToFirst()) it.getString(0) else null
    }
  }.getOrNull()

  private fun hash(text: String): String =
    MessageDigest.getInstance("SHA-1").digest(text.toByteArray()).take(8).joinToString("") { "%02x".format(it) }
}
