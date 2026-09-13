package com.traknio.watch

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import androidx.wear.compose.material.*

data class WatchProgramDay(val id: String, val title: String, val focus: String, val exerciseCount: Int)
data class WatchProgram(val id: String, val name: String, val days: List<WatchProgramDay>)
data class WatchProgramPage(val programs: List<WatchProgram>, val nextCursor: String?) {
    companion object {
        fun fromJson(json: JSONObject): WatchProgramPage {
            val programs = json.getJSONArray("programs")
            return WatchProgramPage((0 until programs.length()).map { index ->
                val program = programs.getJSONObject(index)
                val days = program.getJSONArray("days")
                WatchProgram(program.getString("id"), program.getString("name"), (0 until days.length()).map { dayIndex ->
                    val day = days.getJSONObject(dayIndex)
                    WatchProgramDay(day.getString("id"), day.getString("title"),
                        if (day.isNull("focus")) "" else day.optString("focus"), day.getInt("exerciseCount"))
                })
            }, if (json.isNull("nextCursor")) null else json.optString("nextCursor").takeIf { it.isNotBlank() })
        }
    }
}

data class WatchProgramLibrary(
    val open: Boolean = false, val loading: Boolean = false, val starting: Boolean = false,
    val programs: List<WatchProgram> = emptyList(), val nextCursor: String? = null, val error: String? = null,
)

@Composable
internal fun WorkoutPrograms(library: WatchProgramLibrary, onBack: () -> Unit, onRefresh: () -> Unit,
                             onMore: () -> Unit, onStart: (String, String) -> Unit) {
    var selectedProgramId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedDayId by rememberSaveable { mutableStateOf<String?>(null) }
    val program = library.programs.firstOrNull { it.id == selectedProgramId }
    val day = program?.days?.firstOrNull { it.id == selectedDayId }
    fun back() {
        when { library.starting -> Unit; selectedDayId != null -> selectedDayId = null
            selectedProgramId != null -> selectedProgramId = null; else -> onBack() }
    }
    BackHandler(onBack = ::back)
    WorkoutPage {
        WorkoutHeading(day?.title ?: program?.name ?: "Programmes")
        if (library.starting) {
            Text("Démarrage…", color = WatchPalette.Green, fontSize = 14.sp)
            Text("Confirmation de la séance", color = WatchPalette.Muted, fontSize = 12.sp)
        } else if (day != null && program != null) {
            Text("${day.exerciseCount} exercices", color = WatchPalette.Muted, fontSize = 12.sp)
            if (day.focus.isNotBlank()) Text(day.focus, color = WatchPalette.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
            WorkoutPill("Démarrer", !library.loading && day.exerciseCount > 0, primary = true) { onStart(program.id, day.id) }
            if (day.exerciseCount == 0) Text("Ajoute des exercices sur ton téléphone.", color = WatchPalette.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
        } else if (program != null) {
            program.days.forEach { item ->
                ProgramCard(item.title, "${item.exerciseCount} exercices", !library.loading) { selectedDayId = item.id }
            }
            if (program.days.isEmpty()) Text("Aucune séance dans ce programme.", fontSize = 12.sp, textAlign = TextAlign.Center)
        } else {
            library.programs.forEach { item -> ProgramCard(item.name, "${item.days.size} séance${if (item.days.size > 1) "s" else ""}", !library.loading) { selectedProgramId = item.id } }
            if (!library.loading && library.programs.isEmpty() && library.error == null) {
                Text("Crée ton premier programme sur le téléphone.", color = WatchPalette.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
            }
            if (library.nextCursor != null) WorkoutPill("Charger la suite", !library.loading, onClick = onMore)
        }
        if (library.loading) Text("Chargement…", color = WatchPalette.Muted, fontSize = 12.sp)
        library.error?.let { Text(it, color = WatchPalette.Orange, fontSize = 12.sp, textAlign = TextAlign.Center) }
        if (program == null && !library.starting) WorkoutPill("Actualiser", !library.loading, onClick = onRefresh)
        if (!library.starting) WorkoutPill("‹ Retour", onClick = ::back)
    }
}

@Composable
private fun ProgramCard(title: String, subtitle: String, enabled: Boolean, onClick: () -> Unit) {
    Chip(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        colors = ChipDefaults.chipColors(backgroundColor = WatchPalette.Surface, contentColor = Color.White),
        label = { Text(title, fontSize = 13.sp) },
        secondaryLabel = { Text(subtitle, color = WatchPalette.Muted, fontSize = 11.sp) })
}
