package com.traknio.watch

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class WatchInsightsState(val page: String? = null, val loading: Boolean = false,
    val payload: JSONObject? = null, val error: String? = null)

@Composable
internal fun WorkoutInsights(state: WatchInsightsState, onOpen: (String) -> Unit, onBack: () -> Unit,
    onRefresh: () -> Unit, onMore: () -> Unit, onPrograms: () -> Unit) {
    if (state.page == "settings") { WorkoutSettings(onBack); return }
    var selectedId by rememberSaveable(state.page) { mutableStateOf<String?>(null) }
    val history = state.payload?.optJSONArray("history")
    val selected = history?.let { list -> (0 until list.length()).map { list.getJSONObject(it) }.find { it.getString("id") == selectedId } }
    fun back() { if (selectedId != null) selectedId = null else onBack() }
    BackHandler(onBack = ::back)
    WorkoutPage {
        WorkoutHeading(when (state.page) { "history" -> "Historique"; "statistics" -> "Cette semaine"; else -> "TRAKNIO" })
        when {
            state.page == "menu" -> {
                WorkoutPill("Entraînement", primary = true, onClick = onPrograms)
                WorkoutPill("Historique") { onOpen("history") }
                WorkoutPill("Statistiques") { onOpen("statistics") }
                WorkoutPill("Paramètres") { onOpen("settings") }
            }
            selected != null -> {
                WorkoutHeading(selected.getString("title"), historyDate(selected))
                Text("${selected.getInt("sets")} séries · ${selected.getInt("exercises")} exercices", fontSize = 12.sp)
                Text("${selected.getInt("volumeKg")} kg", color = WatchPalette.Blue, fontSize = 25.sp)
                Text(if (selected.isNull("durationSeconds")) "Durée indisponible" else "${selected.getInt("durationSeconds") / 60} min", color = WatchPalette.Muted, fontSize = 12.sp)
            }
            state.page == "history" -> {
                if (history != null) for (index in 0 until history.length()) {
                    val item = history.getJSONObject(index)
                    WorkoutPill("${item.getString("title")}\n${historyDate(item)}") { selectedId = item.getString("id") }
                }
                if (!state.loading && state.error == null && (history?.length() ?: 0) == 0) Text("Aucune séance terminée", fontSize = 12.sp)
                if (state.payload?.isNull("nextCursor") == false) WorkoutPill("Séances précédentes", !state.loading, onClick = onMore)
            }
            state.page == "statistics" -> state.payload?.optJSONObject("statistics")?.let { stats ->
                val days = stats.getJSONArray("days")
                val maximum = (0 until days.length()).maxOfOrNull { days.getJSONObject(it).getInt("sessions") }?.coerceAtLeast(1) ?: 1
                Row(Modifier.fillMaxWidth().height(62.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.Bottom) {
                    val labels = listOf("L", "M", "M", "J", "V", "S", "D")
                    for (index in 0 until days.length()) {
                        val count = days.getJSONObject(index).getInt("sessions")
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.width(10.dp).height((4 + 36 * count / maximum).dp).background(if (count > 0) WatchPalette.Green else WatchPalette.Surface))
                            Text(labels[index], color = WatchPalette.Muted, fontSize = 10.sp)
                        }
                    }
                }
                val sessions = stats.getInt("sessions")
                Text("$sessions séance${if (sessions > 1) "s" else ""}", color = Color.White, fontSize = 23.sp)
                Text("${java.text.NumberFormat.getIntegerInstance(java.util.Locale.FRANCE).format(stats.getInt("volumeKg"))} kg · volume", color = WatchPalette.Blue, fontSize = 14.sp)
                Text(if (stats.isNull("volumeChangePercent")) "Pas de comparaison disponible" else "${stats.getInt("volumeChangePercent")}% / semaine précédente", color = WatchPalette.Muted, fontSize = 11.sp)
                Text("Semaine en cours · heure de Paris", color = WatchPalette.Muted, fontSize = 10.sp)
            }
        }
        if (state.loading) Text("Chargement…", color = WatchPalette.Muted, fontSize = 12.sp)
        state.error?.let { Text(it, color = WatchPalette.Orange, fontSize = 12.sp) }
        if (state.page != "menu" && selected == null) WorkoutPill("Actualiser", !state.loading, onClick = onRefresh)
        WorkoutPill("‹ Retour", onClick = ::back)
    }
}

private fun historyDate(item: JSONObject): String = runCatching {
    val date = if (item.isNull("endedAt")) item.getString("createdAt") else item.getString("endedAt")
    DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.systemDefault()).format(Instant.parse(date))
}.getOrDefault("")
