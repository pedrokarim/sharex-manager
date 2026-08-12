package re.ascencia.screenshotupload

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

internal object ScreenshotUploadStore {
  const val PREFS = "sharex_screenshot_upload"
  const val KEY_ENABLED = "enabled"
  const val KEY_CHECKPOINT = "checkpoint"
  private const val KEY_HANDLED_IDS = "handled_ids"
  private const val KEY_COMPLETED = "completed_uploads"

  fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isHandled(context: Context, id: Long): Boolean =
    prefs(context).getStringSet(KEY_HANDLED_IDS, emptySet())?.contains(id.toString()) == true

  fun markHandled(context: Context, id: Long) {
    val current = prefs(context).getStringSet(KEY_HANDLED_IDS, emptySet()).orEmpty().toMutableList()
    current.remove(id.toString())
    current.add(id.toString())
    prefs(context).edit().putStringSet(KEY_HANDLED_IDS, current.takeLast(80).toSet()).apply()
  }

  @Synchronized
  fun addCompleted(context: Context, item: JSONObject) {
    val values = JSONArray(prefs(context).getString(KEY_COMPLETED, "[]"))
    values.put(item)
    prefs(context).edit().putString(KEY_COMPLETED, values.toString()).apply()
  }

  @Synchronized
  fun drainCompleted(context: Context): List<Map<String, Any?>> {
    val values = JSONArray(prefs(context).getString(KEY_COMPLETED, "[]"))
    val result = mutableListOf<Map<String, Any?>>()
    for (index in 0 until values.length()) {
      val item = values.getJSONObject(index)
      result.add(
        mapOf(
          "filename" to item.optString("filename"),
          "url" to item.optString("url"),
          "thumbnailUrl" to item.optString("thumbnailUrl").takeIf { it.isNotEmpty() },
          "localUri" to item.optString("localUri"),
          "size" to item.optDouble("size", 0.0),
          "type" to item.optString("type", "image/jpeg"),
          "width" to item.optDouble("width", 0.0),
          "height" to item.optDouble("height", 0.0),
        )
      )
    }
    prefs(context).edit().putString(KEY_COMPLETED, "[]").apply()
    return result
  }
}

internal data class ScreenshotAsset(
  val id: Long,
  val uri: Uri,
  val filename: String,
  val mimeType: String,
  val size: Long,
  val width: Int,
  val height: Int,
  val dateTaken: Long,
  val relativePath: String,
)

class ScreenshotUploadService : Service() {
  companion object {
    const val ACTION_START = "re.ascencia.screenshotupload.START"
    const val EXTRA_SERVER_URL = "serverUrl"
    const val EXTRA_API_KEY = "apiKey"
    const val EXTRA_NOTIFICATIONS = "notifications"
    private const val MONITOR_CHANNEL = "screenshot-monitoring"
    private const val RESULT_CHANNEL = "automatic-uploads"
    private const val MONITOR_NOTIFICATION_ID = 4601
  }

  private val executor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var observer: ContentObserver
  @Volatile private var serverUrl = ""
  @Volatile private var apiKey = ""
  @Volatile private var showResultNotifications = true
  @Volatile private var observerRegistered = false
  private val processingIds = ConcurrentHashMap.newKeySet<Long>()

  override fun onCreate() {
    super.onCreate()
    createChannels()
    observer = object : ContentObserver(mainHandler) {
      override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)
        if (uri != null) scheduleUri(uri, 0)
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_START) {
      serverUrl = intent.getStringExtra(EXTRA_SERVER_URL).orEmpty().trimEnd('/')
      apiKey = intent.getStringExtra(EXTRA_API_KEY).orEmpty()
      showResultNotifications = intent.getBooleanExtra(EXTRA_NOTIFICATIONS, true)
    }
    if (serverUrl.isBlank() || apiKey.isBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }

    startForeground(MONITOR_NOTIFICATION_ID, monitorNotification("Surveillance des captures active"))
    if (!observerRegistered) {
      contentResolver.registerContentObserver(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        true,
        observer,
      )
      observerRegistered = true
    }
    executor.execute {
      try {
        scanBacklog()
      } catch (error: Exception) {
        emit("error", "Le rattrapage des captures a échoué", 0.0)
        android.util.Log.e("ShareXScreenshotUpload", "Backlog scan failed", error)
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (observerRegistered) contentResolver.unregisterContentObserver(observer)
    observerRegistered = false
    executor.shutdownNow()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun scheduleUri(uri: Uri, attempt: Int) {
    mainHandler.postDelayed({
      executor.execute {
        val asset = readAsset(uri)
        if (asset == null) {
          if (attempt < 6) scheduleUri(uri, attempt + 1)
          return@execute
        }
        processAsset(asset)
      }
    }, if (attempt == 0) 900L else 650L)
  }

  private fun scanBacklog() {
    val checkpoint = ScreenshotUploadStore.prefs(this)
      .getLong(ScreenshotUploadStore.KEY_CHECKPOINT, System.currentTimeMillis())
    val projection = assetProjection()
    val selection = "${MediaStore.Images.Media.DATE_TAKEN} >= ?"
    val cursor = contentResolver.query(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      projection,
      selection,
      arrayOf((checkpoint - 5_000L).toString()),
      "${MediaStore.Images.Media.DATE_TAKEN} ASC",
    ) ?: return
    cursor.use {
      var processed = 0
      while (processed < 100 && it.moveToNext()) {
        readAsset(it)?.let(::processAsset)
        processed += 1
      }
    }
    ScreenshotUploadStore.prefs(this).edit()
      .putLong(ScreenshotUploadStore.KEY_CHECKPOINT, System.currentTimeMillis())
      .apply()
  }

  private fun processAsset(asset: ScreenshotAsset) {
    if (!isScreenshot(asset) || ScreenshotUploadStore.isHandled(this, asset.id)) return
    if (!processingIds.add(asset.id)) return
    emit("detected", "Capture détectée…", 0.0)
    updateMonitor("Envoi de ${asset.filename}")
    try {
      val result = upload(asset)
      if (result != null) {
        ScreenshotUploadStore.markHandled(this, asset.id)
        ScreenshotUploadStore.addCompleted(this, result)
        emit("success", "Capture envoyée automatiquement ✓", 1.0)
        postResult("Capture envoyée", asset.filename, false, asset.id)
      } else {
        emit("error", "La capture n’a pas pu être envoyée", 0.0)
        postResult("Échec de l’envoi", asset.filename, true, asset.id)
      }
    } finally {
      processingIds.remove(asset.id)
      updateMonitor("Surveillance des captures active")
    }
  }

  private fun upload(asset: ScreenshotAsset): JSONObject? {
    val boundary = "ShareX-${System.currentTimeMillis()}"
    val connection = (URL("$serverUrl/api/upload").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 30_000
      readTimeout = 30_000
      doOutput = true
      setChunkedStreamingMode(64 * 1024)
      setRequestProperty("x-api-key", apiKey)
      setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
    }
    return try {
      BufferedOutputStream(connection.outputStream).use { output ->
        output.write("--$boundary\r\n".toByteArray())
        output.write("Content-Disposition: form-data; name=\"file\"; filename=\"${asset.filename.replace("\"", "")}\"\r\n".toByteArray())
        output.write("Content-Type: ${asset.mimeType}\r\n\r\n".toByteArray())
        contentResolver.openInputStream(asset.uri)?.use { rawInput ->
          BufferedInputStream(rawInput).use { input ->
            val buffer = ByteArray(64 * 1024)
            var sent = 0L
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              output.write(buffer, 0, count)
              sent += count
              val progress = if (asset.size > 0) sent.toDouble() / asset.size else 0.0
              emit("uploading", "Envoi automatique… ${(progress * 100).roundToInt().coerceIn(0, 99)} %", progress.coerceIn(0.0, 0.99))
            }
          }
        } ?: return null
        output.write("\r\n--$boundary--\r\n".toByteArray())
      }
      if (connection.responseCode !in 200..299) return null
      val response = connection.inputStream.bufferedReader().use { it.readText() }
      val json = JSONObject(response)
      val url = json.optString("url")
      if (url.isBlank()) return null
      JSONObject().apply {
        put("filename", json.optString("filename", asset.filename))
        put("url", url)
        put("thumbnailUrl", json.optString("thumbnail_url"))
        put("localUri", asset.uri.toString())
        put("size", asset.size)
        put("type", asset.mimeType)
        put("width", asset.width)
        put("height", asset.height)
      }
    } catch (_: Exception) {
      null
    } finally {
      connection.disconnect()
    }
  }

  private fun readAsset(uri: Uri): ScreenshotAsset? {
    val cursor = contentResolver.query(uri, assetProjection(), null, null, null) ?: return null
    cursor.use { return if (it.moveToFirst()) readAsset(it) else null }
  }

  private fun readAsset(cursor: android.database.Cursor): ScreenshotAsset? {
    val id = cursor.long(MediaStore.Images.Media._ID) ?: return null
    val pending = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) cursor.int(MediaStore.Images.Media.IS_PENDING) ?: 0 else 0
    if (pending != 0) return null
    return ScreenshotAsset(
      id = id,
      uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id),
      filename = cursor.string(MediaStore.Images.Media.DISPLAY_NAME) ?: "screenshot-$id.jpg",
      mimeType = cursor.string(MediaStore.Images.Media.MIME_TYPE) ?: "image/jpeg",
      size = cursor.long(MediaStore.Images.Media.SIZE) ?: 0L,
      width = cursor.int(MediaStore.Images.Media.WIDTH) ?: 0,
      height = cursor.int(MediaStore.Images.Media.HEIGHT) ?: 0,
      dateTaken = cursor.long(MediaStore.Images.Media.DATE_TAKEN) ?: 0L,
      relativePath = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) cursor.string(MediaStore.Images.Media.RELATIVE_PATH).orEmpty() else "",
    )
  }

  private fun assetProjection(): Array<String> = mutableListOf(
    MediaStore.Images.Media._ID,
    MediaStore.Images.Media.DISPLAY_NAME,
    MediaStore.Images.Media.MIME_TYPE,
    MediaStore.Images.Media.SIZE,
    MediaStore.Images.Media.WIDTH,
    MediaStore.Images.Media.HEIGHT,
    MediaStore.Images.Media.DATE_TAKEN,
  ).apply {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      add(MediaStore.Images.Media.RELATIVE_PATH)
      add(MediaStore.Images.Media.IS_PENDING)
    }
  }.toTypedArray()

  private fun isScreenshot(asset: ScreenshotAsset): Boolean {
    val value = "${asset.filename} ${asset.relativePath}".lowercase(Locale.ROOT)
    return value.contains("screenshot") || value.contains("screen_shot") ||
      value.contains("screen-shot") || value.contains("capture d'écran") ||
      value.contains("captures d’écran") || value.contains("screenshots/")
  }

  private fun android.database.Cursor.string(column: String): String? =
    getColumnIndex(column).takeIf { it >= 0 }?.let(::getString)
  private fun android.database.Cursor.long(column: String): Long? =
    getColumnIndex(column).takeIf { it >= 0 }?.let(::getLong)
  private fun android.database.Cursor.int(column: String): Int? =
    getColumnIndex(column).takeIf { it >= 0 }?.let(::getInt)

  private fun emit(state: String, message: String, progress: Double) {
    ScreenshotUploadEvents.emit(mapOf("state" to state, "message" to message, "progress" to progress))
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(MONITOR_CHANNEL, "Surveillance des captures", NotificationManager.IMPORTANCE_LOW))
    manager.createNotificationChannel(NotificationChannel(RESULT_CHANNEL, "Envois automatiques", NotificationManager.IMPORTANCE_HIGH))
  }

  private fun launchPendingIntent(): PendingIntent? {
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun monitorNotification(text: String) = NotificationCompat.Builder(this, MONITOR_CHANNEL)
    .setSmallIcon(applicationInfo.icon)
    .setContentTitle("ShareX Manager")
    .setContentText(text)
    .setContentIntent(launchPendingIntent())
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .build()

  private fun updateMonitor(text: String) {
    getSystemService(NotificationManager::class.java).notify(MONITOR_NOTIFICATION_ID, monitorNotification(text))
  }

  private fun postResult(title: String, body: String, error: Boolean, assetId: Long) {
    if (!showResultNotifications) return
    val notification = NotificationCompat.Builder(this, RESULT_CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(launchPendingIntent())
      .setAutoCancel(true)
      .setColor(if (error) 0xFFC95050.toInt() else 0xFF39866D.toInt())
      .build()
    getSystemService(NotificationManager::class.java).notify((assetId % Int.MAX_VALUE).toInt(), notification)
  }
}
