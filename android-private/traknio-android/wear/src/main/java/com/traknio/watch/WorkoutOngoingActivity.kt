package com.traknio.watch

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

/** A single notification shared with the existing health foreground service.
 * Sensor permission is deliberately independent of the ongoing workout indication.
 */
internal object WorkoutOngoingActivity {
    const val NOTIFICATION_ID = 1742
    private const val CHANNEL = "traknio_exercise"
    private const val PREFS = "traknio_ongoing_activity"
    private var ongoing: OngoingActivity? = null
    private var lastPublished: WorkoutOngoingState? = null
    @SuppressLint("StaticFieldLeak") // Built exclusively with applicationContext, never an Activity/Service.
    private var notificationBuilder: NotificationCompat.Builder? = null

    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED

    @Synchronized
    fun update(context: Context, payload: WatchPayload) = publish(context, WorkoutOngoingState.from(payload))

    @Synchronized
    fun update(context: Context, state: WorkoutOngoingState) = publish(context, state)

    @Synchronized
    fun hasActiveWorkout(context: Context): Boolean = read(context)?.active == true

    @Synchronized
    fun sessionNotFound(context: Context) {
        read(context)?.let { publish(context, it.copy(status = "CANCELLED")) }
    }

    /** Called by the existing receiver even when the Activity/ViewModel has gone away. */
    @Synchronized
    fun receive(context: Context, message: WorkoutStateMessage) {
        val previous = read(context) ?: return // Never start from an unsolicited remote event.
        val next = previous.receive(message)
        if (next != previous) publish(context, next)
    }

    @Synchronized
    fun receive(context: Context, payload: WatchPayload) {
        val previous = read(context) ?: return
        val next = WorkoutOngoingState.from(payload)
        if (!previous.active && next.active && next.revision <= previous.revision) return
        if (previous.sessionId == next.sessionId && next.revision >= previous.revision) publish(context, next)
    }

    @Synchronized
    fun foregroundNotification(context: Context, sessionId: String): Notification? {
        val state = read(context)?.takeIf { it.active && it.sessionId == sessionId } ?: return null
        return notificationBuilder?.takeIf { lastPublished?.sessionId == sessionId }?.build()
            ?: build(context, state)
    }

    @SuppressLint("MissingPermission") // Explicit canNotify gate below; revocation races are caught.
    private fun publish(context: Context, state: WorkoutOngoingState) {
        save(context, state)
        val manager = context.getSystemService(NotificationManager::class.java)
        if (!state.active) {
            // Remove the indication before network-dependent metric finalization.
            ExerciseTrackingService.stop(context)
            manager.cancel(NOTIFICATION_ID)
            ongoing = null
            notificationBuilder = null
            lastPublished = null
            return
        }
        if (!canNotify(context)) return
        if (lastPublished == state && manager.activeNotifications.any { it.id == NOTIFICATION_ID }) return
        val status = Status.forPart(Status.TextPart(state.text))
        try {
            if (ongoing != null && notificationBuilder != null && lastPublished?.sessionId == state.sessionId) {
                notificationBuilder?.setContentTitle(state.title.ifBlank { "Séance Traknio" })?.setContentText(state.text)
                ongoing?.update(context, status)
            } else {
                manager.notify(NOTIFICATION_ID, build(context, state))
            }
            lastPublished = state
        } catch (error: SecurityException) {
            Log.w("TraknioOngoing", "Notification permission changed", error)
        }
    }

    private fun build(context: Context, state: WorkoutOngoingState): Notification {
        val appContext = context.applicationContext
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Séance Traknio", NotificationManager.IMPORTANCE_LOW))
        val touchIntent = PendingIntent.getActivity(
            appContext, NOTIFICATION_ID,
            Intent(appContext, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(appContext, CHANNEL)
            .setSmallIcon(R.drawable.ic_workout_ongoing)
            .setContentTitle(state.title.ifBlank { "Séance Traknio" })
            .setContentText(state.text)
            .setContentIntent(touchIntent)
            .setCategory("workout") // CATEGORY_WORKOUT, compatible with the project's core 1.13.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setLocalOnly(true)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
        notificationBuilder = builder
        ongoing = OngoingActivity.Builder(appContext, NOTIFICATION_ID, builder)
            .setStaticIcon(R.drawable.ic_workout_ongoing)
            .setTouchIntent(touchIntent)
            .setStatus(Status.forPart(Status.TextPart(state.text)))
            .setContentDescription("Revenir à la séance Traknio")
            .build().also { it.apply(context) }
        return builder.build()
    }

    // Only presentation metadata; no health measurements, tokens or workout mutations.
    private fun save(context: Context, state: WorkoutOngoingState) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("session", state.sessionId).putString("status", state.status)
            .putString("title", state.title).putString("exercise", state.exerciseName)
            .putInt("exerciseIndex", state.exerciseIndex)
            .putInt("set", state.setIndex).putInt("total", state.totalSets)
            .putBoolean("rest", state.resting).putBoolean("paused", state.paused)
            .putLong("revision", state.revision).apply()
    }

    private fun read(context: Context): WorkoutOngoingState? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val id = prefs.getString("session", null) ?: return null
        return WorkoutOngoingState(
            id, prefs.getString("status", "").orEmpty(), prefs.getString("title", "").orEmpty(),
            prefs.getString("exercise", "").orEmpty(), prefs.getInt("exerciseIndex", 1), prefs.getInt("set", 1), prefs.getInt("total", 1),
            prefs.getBoolean("rest", false), prefs.getBoolean("paused", false), prefs.getLong("revision", 0),
        )
    }
}
