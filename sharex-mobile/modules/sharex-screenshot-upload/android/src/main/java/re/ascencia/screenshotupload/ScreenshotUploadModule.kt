package re.ascencia.screenshotupload

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal object ScreenshotUploadEvents {
  var listener: ((Map<String, Any?>) -> Unit)? = null

  fun emit(event: Map<String, Any?>) {
    Handler(Looper.getMainLooper()).post { listener?.invoke(event) }
  }
}

class ScreenshotUploadModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ShareXScreenshotUpload")
    Events("onStatus")

    OnCreate {
      ScreenshotUploadEvents.listener = { event -> sendEvent("onStatus", event) }
    }

    OnDestroy {
      ScreenshotUploadEvents.listener = null
    }

    AsyncFunction("configure") { serverUrl: String, apiKey: String, notifications: Boolean ->
      val prefs = ScreenshotUploadStore.prefs(context)
      val wasEnabled = prefs.getBoolean(ScreenshotUploadStore.KEY_ENABLED, false)
      if (!wasEnabled) {
        prefs.edit()
          .putBoolean(ScreenshotUploadStore.KEY_ENABLED, true)
          .putLong(ScreenshotUploadStore.KEY_CHECKPOINT, System.currentTimeMillis() - 2_000L)
          .apply()
      }

      val intent = Intent(context, ScreenshotUploadService::class.java).apply {
        action = ScreenshotUploadService.ACTION_START
        putExtra(ScreenshotUploadService.EXTRA_SERVER_URL, serverUrl)
        putExtra(ScreenshotUploadService.EXTRA_API_KEY, apiKey)
        putExtra(ScreenshotUploadService.EXTRA_NOTIFICATIONS, notifications)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      Unit
    }

    AsyncFunction("stop") {
      ScreenshotUploadStore.prefs(context).edit()
        .putBoolean(ScreenshotUploadStore.KEY_ENABLED, false)
        .apply()
      context.stopService(Intent(context, ScreenshotUploadService::class.java))
      Unit
    }

    AsyncFunction("drainCompletedUploads") {
      ScreenshotUploadStore.drainCompleted(context)
    }
  }
}
