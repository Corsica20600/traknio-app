package com.traknio.watch

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/** Displays the service's local measurements; opening this page makes no API call. */
@Composable
internal fun WorkoutHealthScreen(sessionId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("traknio_exercise_health", Context.MODE_PRIVATE) }
    var revision by remember { mutableIntStateOf(0) }
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    DisposableEffect(prefs) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> revision++ }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    LaunchedEffect(Unit) { while (true) { delay(1_000); now = SystemClock.elapsedRealtime() } }
    val matching = remember(revision, sessionId) { prefs.getString("sessionId", null) == sessionId }
    val sampledAt = remember(revision) { prefs.getLong("lastHeartRateSampleElapsedMs", -1) }
    val fresh = matching && sampledAt >= 0 && now - sampledAt in 0..30_000
    val heartRate = if (fresh) prefs.getInt("heartRateCurrent", -1).takeIf { it > 0 } else null
    val calories = if (matching) prefs.getString("sessionCaloriesKcal", null)?.toDoubleOrNull()
        ?.takeIf { it.isFinite() && it >= 0 }?.roundToInt() else null
    BackHandler(onBack = onBack)
    WorkoutPage {
        WorkoutHeading("Pendant la séance")
        Text("♥", color = Color(0xFFFF526E), fontSize = 30.sp)
        Text(heartRate?.toString() ?: "—", color = Color.White, fontSize = 38.sp)
        Text(if (heartRate != null) "bpm · en direct" else "Mesure cardio indisponible", color = WatchPalette.Muted, fontSize = 11.sp)
        Text("${calories ?: "—"} kcal", color = WatchPalette.Orange, fontSize = 22.sp)
        Text("Énergie estimée par la montre", color = WatchPalette.Muted, fontSize = 11.sp, textAlign = TextAlign.Center)
        WorkoutPill("‹ Retour", onClick = onBack)
    }
}
