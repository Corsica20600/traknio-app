package com.traknio.watch

import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Text

data class WatchFeedbackState(val sessionId: String? = null, val loading: Boolean = false, val saved: Boolean = false, val error: String? = null)

@Composable
internal fun WorkoutFeedback(sessionId: String, state: WatchFeedbackState, onSubmit: (String, Int, String) -> Unit, onClose: () -> Unit) {
    var rating by rememberSaveable(sessionId) { mutableIntStateOf(0) }
    var note by rememberSaveable(sessionId) { mutableStateOf("") }
    var speechError by remember { mutableStateOf(false) }
    val current = state.takeIf { it.sessionId == sessionId } ?: WatchFeedbackState()
    val speech = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { note = it.take(280) }
    }
    WorkoutPage {
        if (current.saved) {
            WorkoutHeading("Ressenti enregistré", "Merci pour ton retour !")
            WorkoutPill("Terminer", primary = true, onClick = onClose)
        } else {
            WorkoutHeading("Comment était\ncette séance ?")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("☹", "😐", "☺").forEachIndexed { index, face ->
                    WorkoutCircle(face, listOf("Difficile", "Correcte", "Très bonne")[index], !current.loading,
                        if (rating == index + 1) WatchPalette.Green else WatchPalette.Surface) { rating = index + 1 }
                }
            }
            if (note.isNotBlank()) Text(note, fontSize = 11.sp)
            WorkoutPill("Dicter une note", !current.loading) {
                speechError = runCatching { speech.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)) }.isFailure
            }
            if (note.isNotBlank()) WorkoutPill("Effacer la note", !current.loading) { note = "" }
            if (speechError) Text("Dictée indisponible sur cette montre", fontSize = 11.sp)
            current.error?.let { Text(it, color = WatchPalette.Orange, fontSize = 11.sp) }
            WorkoutPill(if (current.loading) "Enregistrement…" else "Enregistrer", !current.loading && rating > 0, primary = true) { onSubmit(sessionId, rating, note) }
            WorkoutPill("Passer", !current.loading, onClick = onClose)
        }
    }
}
