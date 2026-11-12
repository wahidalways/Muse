package expo.modules.musemetadata

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.musemetadata.playback.MuseOutput

private const val PICK_FOLDER = 4701
private const val TRASH = 4702

/**
 * Picked folders (for APE, WavPack and DSD, which Android's media library
 * cannot list), moving songs to Android's trash, and Muse's audio output
 * (Hi-Res, bit-perfect, DoP).
 */
class MuseFilesModule : Module() {
  private var pickPromise: Promise? = null
  private var trashPromise: Promise? = null
  /** Picked-folder files of a delete, waiting for Android's trash prompt. */
  private var trashPicked: List<String> = emptyList()
  private val outputListener: (Map<String, Any?>) -> Unit = { sendEvent("onOutputChange", it) }

  override fun definition() = ModuleDefinition {
    Name("MuseFiles")

    Events("onOutputChange", "onUpdateProgress", "onUpdateStatus")

    OnCreate {
      appContext.reactContext?.let { MuseOutput.load(it) }
    }

    // Android's folder picker. Resolves { uri, name }, or null when the person backs out.
    AsyncFunction("pickMusicFolder") { promise: Promise ->
      val activity = appContext.throwingActivity
      pickPromise?.resolve(null)
      pickPromise = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or
          Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
      )
      activity.startActivityForResult(intent, PICK_FOLDER)
    }

    Function("hasAllFilesAccess") {
      appContext.reactContext?.let { LibraryFiles.hasAllFilesAccess(it) } ?: false
    }

    // Android's own switch for All files access (Android 11+). JS checks again when Muse comes back.
    Function("openAllFilesAccess") {
      val activity = appContext.throwingActivity
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function false
      val forMuse = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${activity.packageName}"))
      runCatching { activity.startActivity(forMuse) }
        .recoverCatching { activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
        .isSuccess
    }

    Function("getMusicFolders") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, String>>()
      LibraryFiles.pickedTrees(context).map { tree ->
        val name = runCatching {
          LibraryFiles.displayName(context, DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)))
        }.getOrNull()
        mapOf("uri" to tree.toString(), "name" to (name ?: "Folder"))
      }
    }

    Function("removeMusicFolder") { uri: String ->
      val context = appContext.reactContext ?: return@Function
      runCatching {
        context.contentResolver.releasePersistableUriPermission(
          Uri.parse(uri),
          Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
        )
      }
    }

    // Songs from the media library go to Android's trash (restorable for 30
    // days, behind one Android prompt); picked-folder files are deleted, but
    // only once that prompt says yes. Resolves false when the person says no.
    AsyncFunction("trashTracks") { ids: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction promise.resolve(false)
      val picked = ids.filter { it.startsWith("doc-") }
      val media = ids.mapNotNull { it.toLongOrNull() }.map { android.content.ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, it) }
      if (media.isEmpty()) {
        deletePicked(context, picked)
        return@AsyncFunction promise.resolve(true)
      }
      if (Build.VERSION.SDK_INT < 30) return@AsyncFunction promise.resolve(false)
      val request = MediaStore.createTrashRequest(context.contentResolver, media, true)
      trashPromise?.resolve(false)
      trashPromise = promise
      trashPicked = picked
      appContext.throwingActivity.startIntentSenderForResult(request.intentSender, TRASH, null, 0, 0, 0)
    }

    OnActivityResult { _: Activity, payload ->
      when (payload.requestCode) {
        PICK_FOLDER -> {
          val promise = pickPromise ?: return@OnActivityResult
          pickPromise = null
          val uri = payload.data?.data
          if (payload.resultCode != Activity.RESULT_OK || uri == null) return@OnActivityResult promise.resolve(null)
          val context = appContext.reactContext ?: return@OnActivityResult promise.resolve(null)
          runCatching {
            context.contentResolver.takePersistableUriPermission(
              uri,
              Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
          }.recoverCatching {
            // Some pickers grant read only.
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
          val name = runCatching {
            LibraryFiles.displayName(context, DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri)))
          }.getOrNull()
          promise.resolve(mapOf("uri" to uri.toString(), "name" to (name ?: "Folder")))
        }
        TRASH -> {
          val promise = trashPromise ?: return@OnActivityResult
          trashPromise = null
          val allowed = payload.resultCode == Activity.RESULT_OK
          if (allowed) appContext.reactContext?.let { deletePicked(it, trashPicked) }
          trashPicked = emptyList()
          promise.resolve(allowed)
        }
      }
    }

    // ---- Updating Muse from inside Muse ----

    // Downloads the release's APK (progress as onUpdateProgress); resolves the file's path.
    AsyncFunction("downloadUpdate") { url: String, name: String, sha256: String?, size: Double?, promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction promise.reject("ERR_UPDATE", "Muse is not ready", null)
      // Its own thread: a download takes a while, and must not hold up Muse's other native calls.
      Thread({
        try {
          val file = UpdateInstaller.download(context, url, name, sha256, size?.toLong()) { received, total ->
            sendEvent("onUpdateProgress", mapOf("received" to received.toDouble(), "total" to total.toDouble()))
          }
          promise.resolve(file.absolutePath)
        } catch (error: InterruptedException) {
          promise.reject("ERR_CANCELLED", "Cancelled", error)
        } catch (error: Throwable) {
          promise.reject("ERR_UPDATE", error.message ?: "Download failed", error)
        }
      }, "muse-update").start()
    }

    Function("cancelUpdateDownload") { UpdateInstaller.cancel() }

    // Opens Android's install prompt for a downloaded update; results arrive as onUpdateStatus.
    AsyncFunction("installUpdate") { path: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Muse is not ready")
      UpdateInstaller.install(context, java.io.File(path)) { status, message ->
        sendEvent("onUpdateStatus", mapOf("status" to status, "message" to message))
      }
    }

    // ---- Audio output ----

    Function("getOutputOptions") {
      mapOf(
        "hiRes" to MuseOutput.hiRes,
        "bitPerfect" to MuseOutput.bitPerfect,
        "dop" to MuseOutput.dop,
        "bitPerfectSupported" to MuseOutput.bitPerfectSupported,
      )
    }

    // Saved natively too: the player reads them when it is built, before JS runs.
    Function("setOutputOptions") { hiRes: Boolean, bitPerfect: Boolean, dop: Boolean ->
      val context = appContext.reactContext ?: return@Function
      MuseOutput.save(context, hiRes, bitPerfect, dop)
    }

    Function("getOutputState") { MuseOutput.state }

    Function("getUsbDacName") {
      appContext.reactContext?.let { MuseOutput.load(it) }
      MuseOutput.usbDevice()?.productName?.toString()
    }

    OnStartObserving("onOutputChange") { MuseOutput.addListener(outputListener) }
    OnStopObserving("onOutputChange") { MuseOutput.removeListener(outputListener) }
  }

  private fun deletePicked(context: android.content.Context, ids: List<String>) {
    for (id in ids) {
      val uri = TrackFiles.uriOf(context, id) ?: continue
      // Found with All files access: a plain file. Picked folders: a document.
      if (uri.scheme == "file") {
        uri.path?.let { runCatching { java.io.File(it).delete() } }
      } else {
        runCatching { DocumentsContract.deleteDocument(context.contentResolver, uri) }
      }
    }
  }
}
