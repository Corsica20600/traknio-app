package com.traknio.watch

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.pm.ServiceInfo
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ExerciseTrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var repository: ExerciseHealthRepository

    override fun onCreate() {
        super.onCreate()
        repository = ExerciseHealthRepository(applicationContext)
        // This is a second gate in addition to startIfPermitted(). Permissions can
        // be revoked between the UI check and service creation.
        if (!ExercisePermissions.hasRequiredPermissions(this)) {
            Log.w(TAG, "Not starting health foreground service: runtime permissions missing")
            stopSelf()
            return
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Séance Traknio", NotificationManager.IMPORTANCE_LOW))
        try {
            startForeground(
                NOTIFICATION_ID,
                NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(R.drawable.traknio_favicon)
                    .setContentTitle("Séance Traknio en cours")
                    .setOngoing(true)
                    .build(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
            )
        } catch (error: SecurityException) {
            // A permission can change after the preceding check. Never allow this
            // race to take down the launcher Activity during session restoration.
            Log.w(TAG, "Health foreground service rejected by Android", error)
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!ExercisePermissions.hasRequiredPermissions(this)) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        // START_STICKY can recreate the service without the original Intent. Reconnect the
        // callback to our owned ExerciseClient session before Health Services' listener timeout.
        val sessionId = intent?.getStringExtra(EXTRA_SESSION_ID) ?: repository.snapshot.value.sessionId
        if (!sessionId.isNullOrBlank()) scope.launch { repository.start(sessionId) }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val EXTRA_SESSION_ID = "sessionId"
        private const val CHANNEL = "traknio_exercise"
        private const val NOTIFICATION_ID = 1742
        /** Starts the service only after all Health Services permissions are granted. */
        fun startIfPermitted(context: Context, sessionId: String): Boolean {
            if (!ExercisePermissions.hasRequiredPermissions(context)) {
                Log.i(TAG, "Health foreground service deferred until permissions are granted")
                return false
            }
            ContextCompat.startForegroundService(context, Intent(context, ExerciseTrackingService::class.java).putExtra(EXTRA_SESSION_ID, sessionId))
            return true
        }
        fun stop(context: Context) = context.stopService(Intent(context, ExerciseTrackingService::class.java))
        private const val TAG = "TraknioExerciseService"
    }
}
