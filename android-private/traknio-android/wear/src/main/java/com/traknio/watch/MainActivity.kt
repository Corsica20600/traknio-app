package com.traknio.watch

import android.os.Bundle
import android.app.Activity
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import androidx.compose.runtime.collectAsState

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TraknioWearApp()
        }
    }
}

@Composable
private fun TraknioWearApp() {
    val context = LocalContext.current.applicationContext
    val viewModel: WatchViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return WatchViewModel(context) as T
            }
        },
    )
    val state by viewModel.state.collectAsState()
    val keepScreenOn = (state as? WatchScreenState.Ready)
        ?.payload
        ?.status != "COMPLETED" && state is WatchScreenState.Ready
    KeepScreenOn(keepScreenOn)
    MaterialTheme {
        WatchChrome {
            when (val current = state) {
                WatchScreenState.Loading -> LoadingScreen()
                is WatchScreenState.Empty -> EmptyScreen(current.message, viewModel::refresh)
                is WatchScreenState.Ready -> ReadyScreen(current, viewModel)
            }
        }
    }
}

@Composable
private fun KeepScreenOn(enabled: Boolean) {
    val activity = LocalContext.current as? Activity
    DisposableEffect(activity, enabled) {
        if (enabled) {
            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

@Composable
private fun WatchChrome(content: @Composable () -> Unit) {
    Scaffold(
        timeText = { TimeText(modifier = Modifier.padding(top = 4.dp)) },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF182F5A),
                            Color(0xFF0A1328),
                            Color(0xFF020611),
                        ),
                    ),
                )
                .padding(horizontal = 18.dp, vertical = 28.dp),
            contentAlignment = Alignment.Center,
        ) {
            content()
        }
    }
}

@Composable
private fun LoadingScreen() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Traknio", fontSize = 20.sp, fontWeight = FontWeight.Black)
        Text("Connexion...", color = Color(0xFFB7C9EA), fontSize = 13.sp)
    }
}

@Composable
private fun EmptyScreen(message: String, onRefresh: () -> Unit) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        item {
            Text(
                text = "Aucune séance",
                textAlign = TextAlign.Center,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
            )
        }
        item {
            Text(
                text = message,
                color = Color(0xFFB7C9EA),
                textAlign = TextAlign.Center,
                fontSize = 12.sp,
                maxLines = 3,
            )
        }
        item {
            Spacer(Modifier.height(8.dp))
            ActionChip("Actualiser", onClick = onRefresh, enabled = true)
        }
    }
}

@Composable
private fun ReadyScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val payload = state.payload
    val isResting = state.displayRestRemaining > 0
    val isCompleted = payload.status == "COMPLETED"
    val isReadyToComplete = payload.status == "READY_TO_COMPLETE"
    val haptics = LocalHapticFeedback.current
    var wasResting by remember { mutableStateOf(isResting) }

    LaunchedEffect(isResting) {
        if (isResting && !wasResting) {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
        wasResting = isResting
    }

    when {
        isCompleted -> CompletedScreen(state, viewModel::refresh)
        isReadyToComplete -> ReadyToCompleteScreen(state, viewModel)
        isResting -> RestScreen(state, viewModel)
        else -> ActiveSetScreen(state, viewModel)
    }
}

@Composable
private fun ReadyToCompleteScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val enabled = state.busyAction == null
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Séance", fontSize = 18.sp, color = Color(0xFFB7C9EA))
        Text("complète", fontSize = 25.sp, fontWeight = FontWeight.Black)
        Text(state.syncLabel, color = Color(0xFF56F0C2), fontSize = 12.sp)
        Spacer(Modifier.height(10.dp))
        BigActionButton(if (state.busyAction == "finish") "..." else "Terminer la séance", enabled, viewModel::completeSession)
    }
}

@Composable
private fun ActiveSetScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val payload = state.payload
    val enabled = state.busyAction == null

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Header(payload.exerciseName, state.syncLabel, state.error)
        Spacer(Modifier.height(4.dp))

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Série ${payload.setIndex}/${payload.totalSets}",
                color = Color(0xFF9CCBFF),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "${payload.targetReps}",
                fontSize = 48.sp,
                fontWeight = FontWeight.Black,
                lineHeight = 48.sp,
            )
            Text(
                text = "répétitions",
                color = Color(0xFFEAF3FF),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
            ActiveWeight(payload)
        }

        Spacer(Modifier.height(6.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BigActionButton("Valider", enabled = enabled, onClick = viewModel::validateSet)
            Spacer(Modifier.height(5.dp))
            FinishSessionChip(state, viewModel)
        }
    }
}

@Composable
private fun ActiveWeight(payload: WatchPayload) {
    val activeWeight = payload.activeWeight ?: payload.weight
    Text("Charge active", color = Color(0xFF9CCBFF), fontSize = 10.sp, fontWeight = FontWeight.Bold)
    Text(
        text = when {
            activeWeight != null && activeWeight > 0 -> "${trimWeight(activeWeight)} kg"
            payload.isBodyweight -> "Poids du corps"
            else -> "Charge à confirmer"
        },
        color = Color(0xFFEAF3FF),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
    )
    if (payload.weightConfirmationRequired && payload.proposedWeight != null) {
        Spacer(Modifier.height(3.dp))
        Box(
            modifier = Modifier
                .background(Color(0xFF30215F), RoundedCornerShape(12.dp))
                .padding(horizontal = 9.dp, vertical = 4.dp),
        ) {
            Text(
                text = "Nouveau poids : ${trimWeight(payload.proposedWeight)} kg · À confirmer",
                color = Color(0xFFF0E8FF),
                fontSize = 9.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun RestScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val enabled = state.busyAction == null

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Header("Repos", state.syncLabel, state.error)
        Spacer(Modifier.height(4.dp))

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Respire", color = Color(0xFFB7C9EA), fontSize = 12.sp)
            Text(
                text = formatRest(state.displayRestRemaining),
                fontSize = if (state.displayRestRemaining >= 60) 44.sp else 60.sp,
                fontWeight = FontWeight.Black,
                lineHeight = 60.sp,
            )
            Text(
                text = if (state.pausedRestRemaining != null) "Chrono en pause" else "Exercice : ${state.payload.exerciseName}",
                color = Color(0xFFB7C9EA),
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(6.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                RoundActionButton("-15", enabled, viewModel::removeRest)
                RoundActionButton(
                    text = if (state.pausedRestRemaining != null) "▶" else "Ⅱ",
                    enabled = enabled,
                    onClick = viewModel::toggleRestPause,
                )
                RoundActionButton("+15", enabled, viewModel::addRest)
            }
            Spacer(Modifier.height(5.dp))
            ActionChip(
                text = if (state.busyAction == "skip-rest") "Passage..." else "Passer le repos",
                onClick = viewModel::skipRest,
                enabled = enabled,
            )
        }
    }
}

@Composable
private fun CompletedScreen(state: WatchScreenState.Ready, onRefresh: () -> Unit) {
    val activity = LocalContext.current as? Activity
    val summary = state.payload.summary
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item {
            Text("Séance terminée", fontSize = 15.sp, color = Color(0xFF56F0C2), fontWeight = FontWeight.Black)
        }
        item {
            Text(
                state.payload.workoutTitle.cleanExerciseTitle(),
                modifier = Modifier.fillMaxWidth(0.82f),
                textAlign = TextAlign.Center,
                fontSize = 17.sp,
                fontWeight = FontWeight.Black,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        item {
            Box(
                modifier = Modifier
                    .padding(top = 5.dp)
                    .background(Color(0xFF173F35), RoundedCornerShape(14.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text("+${summary?.xpGained ?: 100} XP", color = Color(0xFF8DFFD2), fontSize = 11.sp, fontWeight = FontWeight.Black)
            }
        }
        item {
            Text(finalSyncLabel(state), color = finalSyncColor(state), fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        }
        if (summary != null) {
            item {
                SummaryGrid(summary)
            }
            item {
                Text("${summary.sets} séries réalisées", color = Color(0xFFB7C9EA), fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
            }
            if (summary.levelReached) {
                item {
                    Text("Niveau ${summary.level} atteint", color = Color(0xFFC9B5FF), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        } else {
            item {
                Text("Synthèse en cours...", color = Color(0xFFB7C9EA), fontSize = 12.sp, textAlign = TextAlign.Center)
            }
        }
        item {
            Spacer(Modifier.height(6.dp))
            ActionChip("Terminer", onClick = { activity?.finish() ?: onRefresh() }, enabled = state.busyAction == null)
        }
    }
}

@Composable
private fun SummaryGrid(summary: WatchSessionSummary) {
    Column(
        modifier = Modifier
            .fillMaxWidth(0.92f)
            .padding(top = 6.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Row(horizontalArrangement = Arrangement.SpaceBetween) {
            SummaryTile("Durée", formatDuration(summary.durationSeconds), Modifier.fillMaxWidth(0.48f))
            SummaryTile("Volume", "${summary.volumeKg} kg", Modifier.fillMaxWidth(0.48f))
        }
        Row(horizontalArrangement = Arrangement.SpaceBetween) {
            SummaryTile("Exercices", "${summary.exercises}", Modifier.fillMaxWidth(0.48f))
            SummaryTile("FC moy.", summary.averageHeartRateBpm?.let { "$it bpm" } ?: "—", Modifier.fillMaxWidth(0.48f))
        }
    }
}

@Composable
private fun SummaryTile(label: String, value: String, modifier: Modifier) {
    Row(
        modifier = modifier
            .background(Color(0xFF0B1832), RoundedCornerShape(12.dp))
            .padding(horizontal = 8.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = Color(0xFFB7C9EA), fontSize = 8.sp, maxLines = 1)
            Text(value, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black, maxLines = 1)
        }
    }
}

@Composable
private fun Header(title: String, syncLabel: String, error: String?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = title.cleanExerciseTitle(),
            modifier = Modifier.fillMaxWidth(0.82f),
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            lineHeight = 13.sp,
        )
        Text(
            text = error ?: syncLabel,
            color = if (error == null) Color(0xFF56F0C2) else Color(0xFFFFB86B),
            fontSize = 9.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun FinishSessionChip(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val enabled = state.busyAction == null
    ActionChip(
        text = if (state.finishConfirm) "Confirmer la fin" else "Terminer la séance",
        enabled = enabled,
        onClick = {
            if (state.finishConfirm) viewModel.completeSession() else viewModel.requestFinish()
        },
    )
}

private fun finalSyncLabel(state: WatchScreenState.Ready): String = when {
    state.error != null || state.syncLabel in setOf("Erreur", "Échec") -> "Échec de synchronisation"
    state.syncLabel.contains("téléphone", ignoreCase = true) -> "En attente du téléphone"
    state.syncLabel.contains("réseau", ignoreCase = true) -> "En attente du réseau"
    else -> "Synchronisé"
}

private fun finalSyncColor(state: WatchScreenState.Ready): Color = when (finalSyncLabel(state)) {
    "Synchronisé" -> Color(0xFF56F0C2)
    "Échec de synchronisation" -> Color(0xFFFFB86B)
    else -> Color(0xFF9CCBFF)
}

@Composable
private fun NavRow(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val enabled = state.busyAction == null
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SmallButton("Préc.", enabled = enabled, onClick = viewModel::previousExercise)
        SmallButton("Suiv.", enabled = enabled, onClick = viewModel::nextExercise)
        SmallButton(
            text = if (state.finishConfirm) "OK Fin" else "Fin",
            enabled = enabled,
            danger = state.finishConfirm,
            onClick = {
                if (state.finishConfirm) viewModel.completeSession() else viewModel.requestFinish()
            },
        )
    }
}

@Composable
private fun BigActionButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Button(
        modifier = Modifier
            .fillMaxWidth(0.70f)
            .height(38.dp),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            backgroundColor = Color(0xFF2E8BFF),
            contentColor = Color.White,
            disabledBackgroundColor = Color(0xFF243455),
        ),
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            onClick()
        },
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun RoundActionButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Button(
        modifier = Modifier.size(width = 54.dp, height = 34.dp),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            backgroundColor = Color(0xFF152C56),
            contentColor = Color.White,
            disabledBackgroundColor = Color(0xFF1B2437),
        ),
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
    ) {
        Text(text, fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    }
}

@Composable
private fun SmallButton(text: String, enabled: Boolean, danger: Boolean = false, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Button(
        modifier = Modifier.size(38.dp),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            backgroundColor = if (danger) Color(0xFF7F1D1D) else Color(0xFF12264A),
            contentColor = Color.White,
            disabledBackgroundColor = Color(0xFF1B2437),
        ),
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
    ) {
        Text(text, fontSize = 8.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    }
}

@Composable
private fun ActionChip(text: String, onClick: () -> Unit, enabled: Boolean) {
    Chip(
        modifier = Modifier.fillMaxWidth(0.74f),
        label = { Text(text, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center) },
        enabled = enabled,
        colors = ChipDefaults.primaryChipColors(
            backgroundColor = Color(0xFF2E8BFF),
            contentColor = Color.White,
        ),
        onClick = onClick,
    )
}

private fun String.cleanExerciseTitle(): String {
    return replace(Regex("\\([^)]*\\)"), "")
        .replace("-", " ")
        .trim()
}

private fun trimWeight(value: Double): String {
    val asInt = value.toInt()
    return if (value == asInt.toDouble()) asInt.toString() else "%.1f".format(value)
}

private fun formatDuration(seconds: Int?): String {
    if (seconds == null || seconds <= 0) return "-"
    val minutes = seconds / 60
    val hours = minutes / 60
    val remainingMinutes = minutes % 60
    return if (hours > 0) "${hours} h ${remainingMinutes.toString().padStart(2, '0')}" else "${minutes} min"
}
