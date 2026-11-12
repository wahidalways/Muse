package expo.modules.musemetadata

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Updating Muse from inside Muse: the release's APK downloads into Muse's
 * cache, is checked against GitHub's SHA-256 fingerprint (and its size), then
 * goes to Android's installer, which asks the person to confirm (and, the
 * first time, to allow installs from Muse). The new APK must be signed with
 * Muse's own key, or Android refuses it.
 */
internal object UpdateInstaller {
  private const val ACTION_STATUS = "expo.modules.musemetadata.UPDATE_STATUS"
  @Volatile private var cancelled = false

  fun cancel() {
    cancelled = true
  }

  /** Downloads to cache/updates/<name>; `progress(received, total)` about every 1%. Returns the file, or throws. */
  fun download(context: Context, url: String, name: String, sha256: String?, size: Long?, progress: (Long, Long) -> Unit): File {
    cancelled = false
    val directory = File(context.cacheDir, "updates").apply { mkdirs() }
    // Only the newest download is kept.
    directory.listFiles()?.forEach { it.delete() }
    val file = File(directory, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
    val partial = File(directory, "${file.name}.part")
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 30_000
      instanceFollowRedirects = true
      setRequestProperty("Accept", "application/octet-stream")
    }
    try {
      if (connection.responseCode !in 200..299) throw IllegalStateException("Download failed (${connection.responseCode})")
      val total = connection.contentLengthLong.takeIf { it > 0 } ?: size ?: -1L
      val digest = MessageDigest.getInstance("SHA-256")
      var received = 0L
      var lastStep = -1L
      connection.inputStream.use { input ->
        partial.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            if (cancelled) throw InterruptedException("Cancelled")
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            digest.update(buffer, 0, count)
            received += count
            val step = if (total > 0) received * 100 / total else received / (256 * 1024)
            if (step != lastStep) {
              lastStep = step
              progress(received, total)
            }
          }
        }
      }
      if (size != null && size > 0 && received != size) throw IllegalStateException("The download was incomplete")
      val expected = sha256?.removePrefix("sha256:")?.lowercase()
      val actual = digest.digest().joinToString("") { "%02x".format(it) }
      if (!expected.isNullOrEmpty() && expected != actual) throw SecurityException("The download does not match the release")
      if (!partial.renameTo(file)) throw IllegalStateException("Could not save the update")
      return file
    } catch (error: Throwable) {
      partial.delete()
      throw error
    } finally {
      connection.disconnect()
    }
  }

  /**
   * Hands the APK to Android's installer. `done(status, message)` reports
   * "confirm" (Android's prompt is up), "installed", "cancelled" or "failed".
   * On success Android replaces Muse, which closes it.
   */
  fun install(context: Context, file: File, done: (String, String?) -> Unit) {
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(context.packageName)
      if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
    }
    val sessionId = installer.createSession(params)
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context, intent: Intent) {
        if (intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1) != sessionId) return
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
          PackageInstaller.STATUS_PENDING_USER_ACTION -> {
            @Suppress("DEPRECATION")
            val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
            if (confirm != null) {
              context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
              done("confirm", null)
            } else {
              finish(this)
              done("failed", "Android did not show its install prompt")
            }
          }
          PackageInstaller.STATUS_SUCCESS -> {
            finish(this)
            done("installed", null)
          }
          PackageInstaller.STATUS_FAILURE_ABORTED -> {
            finish(this)
            done("cancelled", null)
          }
          else -> {
            finish(this)
            done("failed", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Install failed ($status)")
          }
        }
      }

      private fun finish(receiver: BroadcastReceiver) {
        runCatching { context.unregisterReceiver(receiver) }
      }
    }
    val filter = IntentFilter(ACTION_STATUS)
    // Our own PendingIntent delivers it, so the receiver need not be exported.
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    try {
      installer.openSession(sessionId).use { session ->
        file.inputStream().use { input ->
          session.openWrite("muse.apk", 0, file.length()).use { output ->
            input.copyTo(output)
            session.fsync(output)
          }
        }
        val intent = Intent(ACTION_STATUS).setPackage(context.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
        session.commit(pending.intentSender)
      }
    } catch (error: Throwable) {
      runCatching { context.unregisterReceiver(receiver) }
      runCatching { installer.abandonSession(sessionId) }
      throw error
    }
  }
}
