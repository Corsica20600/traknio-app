package com.traknio.watch

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.Text
import java.time.ZonedDateTime

internal object WatchReminder {
    const val ACTION = "com.traknio.watch.TRAINING_REMINDER"
    private const val ID = 720
    private const val CHANNEL = "training_reminders"
    fun prefs(context: Context) = context.getSharedPreferences("traknio_reminders", Context.MODE_PRIVATE)
    private fun intent(context: Context) = PendingIntent.getBroadcast(context, ID,
        Intent(context, WatchReminderReceiver::class.java).setAction(ACTION), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun permitted(context: Context) = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    fun schedule(context: Context) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        alarm.cancel(intent(context))
        if (!prefs(context).getBoolean("enabled", false) || !permitted(context)) return
        val next = nextReminderTime(ZonedDateTime.now(), prefs(context).getInt("hour", 18))
        // Approximate, battery-friendly notification. No exact alarm permission.
        alarm.setWindow(AlarmManager.RTC_WAKEUP, next.toInstant().toEpochMilli(), 3_600_000, intent(context))
    }
    fun configure(context: Context, enabled: Boolean, hour: Int) {
        prefs(context).edit().putBoolean("enabled", enabled).putInt("hour", hour.coerceIn(0, 23)).apply()
        if (!enabled) NotificationManagerCompat.from(context).cancel(ID)
        schedule(context)
    }
    fun notify(context: Context) {
        if (!permitted(context) || !prefs(context).getBoolean("enabled", false)) return
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Rappels d’entraînement", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, ID, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Un moment pour bouger ?").setContentText("Retrouve tes programmes dans Traknio.")
            .setContentIntent(open).setAutoCancel(true).build()
        try { NotificationManagerCompat.from(context).notify(ID, notification) } catch (_: SecurityException) { /* Permission revoked meanwhile. */ }
    }
}

class WatchReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == WatchReminder.ACTION) WatchReminder.notify(context)
        WatchReminder.schedule(context)
    }
}

@Composable
internal fun WorkoutSettings(onBack: () -> Unit) {
    val context = LocalContext.current
    var enabled by remember { mutableStateOf(WatchReminder.prefs(context).getBoolean("enabled", false)) }
    var hour by remember { mutableIntStateOf(WatchReminder.prefs(context).getInt("hour", 18)) }
    var denied by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        enabled = granted; denied = !granted
        WatchReminder.configure(context, granted, hour)
    }
    androidx.activity.compose.BackHandler(onBack = onBack)
    WorkoutPage {
        WorkoutHeading("Paramètres", "Rappel quotidien")
        Text(String.format(java.util.Locale.FRANCE, "%02d:00", hour), color = WatchPalette.Green, fontSize = 30.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WorkoutCircle("−", "Une heure plus tôt") { hour = (hour + 23) % 24; WatchReminder.configure(context, enabled, hour) }
            WorkoutCircle("+", "Une heure plus tard") { hour = (hour + 1) % 24; WatchReminder.configure(context, enabled, hour) }
        }
        Text("Heure locale approximative", color = WatchPalette.Muted, fontSize = 11.sp)
        WorkoutPill(if (enabled) "Désactiver" else "Activer", primary = !enabled) {
            if (!enabled && !WatchReminder.permitted(context) && Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
            else { enabled = !enabled; WatchReminder.configure(context, enabled, hour) }
        }
        if (denied || (enabled && !WatchReminder.permitted(context))) Text("Notifications non autorisées", color = WatchPalette.Orange, fontSize = 11.sp)
        Text("Sans synchronisation serveur", color = WatchPalette.Muted, fontSize = 11.sp)
        WorkoutPill("‹ Retour", onClick = onBack)
    }
}
