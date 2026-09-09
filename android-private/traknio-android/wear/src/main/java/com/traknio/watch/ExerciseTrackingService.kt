package com.traknio.watch

import android.app.Service
import android.content.pm.ServiceInfo
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel

class ExerciseTrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var repository: ExerciseHealthRepository
    private var trackedSessionId: String? = null

    override fun onCreate() {
        super.onCreate()
        repository = ExerciseHealthRepository(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // This is a second gate in addition to startIfPermitted(). Permissions can
        // be revoked between the UI check and service creation.
        if (!ExercisePermissions.hasRequiredPermissions(this)) {
            Log.w(TAG, "Not starting health foreground service: runtime permissions missing")
            stopSelf()
            return START_NOT_STICKY
        }
        val sessionId = intent?.getStringExtra(EXTRA_SESSION_ID)
        val notification = sessionId?.let { WorkoutOngoingActivity.foregroundNotification(this, it) }
        if (sessionId.isNullOrBlank() || notification == null) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        try {
            startForeground(
                WorkoutOngoingActivity.NOTIFICATION_ID,
                notification,
                if (android.os.Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH else 0,
            )
            running = true
        } catch (error: SecurityException) {
            // A permission can change after the preceding check. Never allow this
            // race to take down the launcher Activity during session restoration.
            Log.w(TAG, "Health foreground service rejected by Android", error)
            stopSelf()
            return START_NOT_STICKY
        } catch (error: IllegalStateException) {
            // Android can reject promotion if visibility changed after the start request.
            Log.w(TAG, "Health foreground promotion deferred", error)
            stopSelf()
            return START_NOT_STICKY
        }
        if (trackedSessionId != sessionId) {
            trackedSessionId = sessionId
            scope.launch {
                try {
                    repository.start(sessionId)
                } catch (error: Exception) {
                    if (error is kotlinx.coroutines.CancellationException) throw error
                    Log.w(TAG, "Health tracking unavailable", error)
                    // The workout indication remains valid even without health measurements.
                }
            }
        }
        // Never recreate a foreground workout from an old persisted sensor snapshot.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        scope.cancel()
        // A genuine workout can outlive loss of sensor permission/service availability.
        // Terminal workout states explicitly cancel the shared notification.
        val active = WorkoutOngoingActivity.hasActiveWorkout(this)
        stopForeground(if (active) STOP_FOREGROUND_DETACH else STOP_FOREGROUND_REMOVE)
        if (!active) trackedSessionId?.let { id ->
            // Also end sensor collection when completion arrived with no ViewModel alive.
            CoroutineScope(Dispatchers.IO).launch { repository.finish(id) }
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val EXTRA_SESSION_ID = "sessionId"
        @Volatile private var running = false
        @Volatile var activityVisible = false
        /** Starts the service only after all Health Services permissions are granted. */
        fun startIfPermitted(context: Context, sessionId: String): Boolean {
            if (!running && !activityVisible) return false
            if (!ExercisePermissions.hasRequiredPermissions(context)) {
                Log.i(TAG, "Health foreground service deferred until permissions are granted")
                return false
            }
            return try {
                ContextCompat.startForegroundService(context, Intent(context, ExerciseTrackingService::class.java).putExtra(EXTRA_SESSION_ID, sessionId))
                true
            } catch (error: IllegalStateException) {
                Log.w(TAG, "Foreground service deferred until the watch app is visible", error)
                false
            } catch (error: SecurityException) {
                Log.w(TAG, "Foreground service permission changed", error)
                false
            }
        }
        fun stop(context: Context) = context.stopService(Intent(context, ExerciseTrackingService::class.java))
        private const val TAG = "TraknioExerciseService"
    }
}
