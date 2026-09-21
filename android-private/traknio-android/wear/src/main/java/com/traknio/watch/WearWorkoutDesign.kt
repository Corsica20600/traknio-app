package com.traknio.watch

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import java.util.Locale
import kotlinx.coroutines.delay

/** Shared by the live workout and the debug-only visual review activity. */
internal object WatchPalette {
    val Green = Color(0xFF38E99B)
    val Blue = Color(0xFF438AFF)
    val Surface = Color(0xFF15181D)
    val Muted = Color(0xFFA3ABB5)
    val Line = Color(0xFF2A3039)
    val Orange = Color(0xFFFFB16B)
}

@Composable
internal fun WorkoutSetConfirmed(confirmation: WatchSetConfirmation, onContinue: () -> Unit) {
    WorkoutPage {
        Text("✓", color = WatchPalette.Green, fontSize = 42.sp)
        WorkoutHeading("Série enregistrée")
        val load = confirmation.weight?.let { java.text.DecimalFormat("0.#", java.text.DecimalFormatSymbols(Locale.FRANCE)).format(it) + " kg × " } ?: ""
        Text("$load${confirmation.reps} rép.", color = Color.White, fontSize = 16.sp)
        WorkoutPill("Continuer", primary = true, onClick = onContinue)
    }
}

@Composable
internal fun WorkoutPage(content: @Composable ColumnScope.() -> Unit) {
    WearScrollColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
        content = content,
    )
}

@Composable
internal fun WorkoutHeading(title: String, subtitle: String? = null) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
        subtitle?.let {
            Text(
                it,
                modifier = Modifier.fillMaxWidth(),
                color = WatchPalette.Muted,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
internal fun WorkoutPill(text: String, enabled: Boolean = true, primary: Boolean = false, onClick: () -> Unit) {
    Chip(
        onClick = onClick, enabled = enabled,
        modifier = Modifier.fillMaxWidth(0.86f).heightIn(min = 48.dp),
        colors = ChipDefaults.chipColors(
            backgroundColor = if (primary) WatchPalette.Green else WatchPalette.Surface,
            contentColor = if (primary) Color.Black else Color.White,
            disabledBackgroundColor = WatchPalette.Surface,
        ),
        label = {
            Text(
                text,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                color = if (enabled) Color.Unspecified else WatchPalette.Muted,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        },
    )
}

@Composable
internal fun WorkoutCircle(symbol: String, description: String, enabled: Boolean = true,
                           color: Color = WatchPalette.Surface, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Button(
        onClick = { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick() },
        enabled = enabled, modifier = Modifier.size(48.dp).semantics { contentDescription = description },
        colors = ButtonDefaults.buttonColors(backgroundColor = color,
            contentColor = if (color == WatchPalette.Green) Color.Black else Color.White),
    ) { Text(symbol, fontSize = 22.sp, fontWeight = FontWeight.Medium) }
}

@Composable
internal fun WorkoutHome(payload: WatchPayload, onPrograms: (() -> Unit)? = null, onHealth: (() -> Unit)? = null, onMenu: (() -> Unit)? = null, onOpen: () -> Unit) {
    WorkoutPage {
        Text("TRAKNIO", color = Color.White, fontSize = 15.sp, letterSpacing = 3.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(2.dp))
        WorkoutCircle("▶", "Ouvrir la séance", color = WatchPalette.Green, onClick = onOpen)
        WorkoutHeading("Reprendre la séance", payload.workoutTitle)
        Text("${payload.totalExercises} exercices", color = WatchPalette.Muted, fontSize = 11.sp)
        WorkoutPill("Voir les exercices", onClick = onOpen)
        onPrograms?.let { WorkoutPill("Programmes", onClick = it) }
        onHealth?.let { WorkoutPill("Cardio et calories", onClick = it) }
        onMenu?.let { WorkoutPill("Menu", onClick = it) }
    }
}

@Composable
internal fun WorkoutEmpty(message: String, onRefresh: () -> Unit, onPrograms: (() -> Unit)? = null, onMenu: (() -> Unit)? = null) {
    val noSession = message == "session_not_found" || message.contains("Aucune séance", ignoreCase = true)
    WorkoutPage {
        Text("TRAKNIO", color = Color.White, fontSize = 14.sp, letterSpacing = 3.sp)
        WorkoutCircle("↻", "Actualiser la séance", color = WatchPalette.Green, onClick = onRefresh)
        WorkoutHeading(if (noSession) "Prêt pour la séance ?" else "Connexion en attente")
        Text(if (noSession) "Choisis ton programme pour commencer." else "Vérifie la connexion et ouvre Traknio sur ton téléphone.",
            modifier = Modifier.fillMaxWidth(0.9f), color = WatchPalette.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
        WorkoutPill("Réessayer", onClick = onRefresh)
        onPrograms?.let { WorkoutPill("Programmes", primary = true, onClick = it) }
        onMenu?.let { WorkoutPill("Menu", onClick = it) }
    }
}

@Composable
internal fun WorkoutExerciseList(payload: WatchPayload, enabled: Boolean, onExercise: (Int) -> Unit) {
    val exercises = payload.exercises.ifEmpty { listOf(WatchExerciseSummary(payload.exerciseIndex - 1,
        payload.exerciseName, payload.totalSets, payload.setIndex - 1, payload.setIndex, payload.targetReps, payload.weight)) }
    WearScrollColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        WorkoutHeading(payload.workoutTitle, "${exercises.count { it.completedSets >= it.totalSets }}/${payload.totalExercises} exercices")
        exercises.forEach { exercise ->
            val active = exercise.index == payload.exerciseIndex - 1
            val complete = exercise.completedSets >= exercise.totalSets
            Chip(
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth().heightIn(min = WearDimensions.exerciseListCardHeight)
                    .border(1.dp, if (active) WatchPalette.Blue else Color.Transparent, RoundedCornerShape(18.dp)),
                onClick = { onExercise(exercise.index) }, enabled = enabled,
                colors = ChipDefaults.chipColors(backgroundColor = if (active) Color(0xFF0C1A2F) else WatchPalette.Surface),
                icon = { Icon(painterResource(R.drawable.ic_summary_volume), null,
                    tint = if (complete) WatchPalette.Green else WatchPalette.Blue, modifier = Modifier.size(20.dp)) },
                label = { Text(wearExerciseName(exercise.name), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(if (complete) "Terminées · ${exercise.totalSets} séries" else "${exercise.completedSets}/${exercise.totalSets} séries",
                    color = if (complete) WatchPalette.Green else WatchPalette.Muted, fontSize = 11.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        }
    }
}

@Composable
internal fun WorkoutExerciseDetail(payload: WatchPayload, selectedIndex: Int?, enabled: Boolean,
                                   onBack: () -> Unit, onOpen: () -> Unit) {
    val exercise = payload.exercises.firstOrNull { it.index == selectedIndex }
    val total = exercise?.totalSets ?: payload.totalSets
    val complete = exercise?.completedSets ?: (payload.setIndex - 1)
    val active = exercise?.activeSetIndex ?: payload.setIndex
    WorkoutPage {
        WorkoutHeading(wearExerciseName(exercise?.name ?: payload.exerciseName), "$total séries")
        WorkoutIllustration(exercise?.imageUrl, exercise?.name ?: payload.exerciseName)
        for (set in 1..total) {
            val done = set <= complete
            val isActive = set == active && !done
            Row(Modifier.fillMaxWidth().heightIn(min = if (isActive) 48.dp else 32.dp)
                .background(WatchPalette.Surface, RoundedCornerShape(14.dp))
                .border(1.dp, if (isActive) WatchPalette.Blue else Color.Transparent, RoundedCornerShape(14.dp))
                .clickable(enabled = enabled && isActive, role = Role.Button, onClick = onOpen)
                .padding(horizontal = 12.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("$set", color = WatchPalette.Muted, fontSize = 12.sp, modifier = Modifier.width(22.dp))
                // Payload contains targets, not historical actuals: don't present targets as recorded results.
                Text(if (done) "Série enregistrée" else "${(exercise?.weight ?: payload.weight)?.let { "${wearWeight(it)} kg" } ?: "Corps"} × ${exercise?.targetReps ?: payload.targetReps}",
                    modifier = Modifier.weight(1f), fontSize = 11.sp, color = Color.White,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(if (done) "✓" else if (isActive) "•" else "", color = WatchPalette.Green)
            }
        }
        WorkoutPill("‹ Exercices", enabled, onClick = onBack)
    }
}

@Composable
internal fun WorkoutSetEntry(payload: WatchPayload, enabled: Boolean, error: String?,
                             onValidate: (Int, Double?) -> Unit, onBack: () -> Unit,
                             onTargetChange: (Int, Double?) -> Unit = { _, _ -> }) {
    BackHandler(onBack = onBack)
    val initialWeight = payload.weight ?: payload.activeWeight ?: 0.0
    var reps by rememberSaveable(payload.sessionId, payload.exerciseIndex, payload.setIndex) { mutableStateOf(payload.targetReps) }
    var weight by rememberSaveable(payload.sessionId, payload.exerciseIndex, payload.setIndex) { mutableStateOf(initialWeight) }
    var edited by rememberSaveable(payload.sessionId, payload.exerciseIndex, payload.setIndex) { mutableStateOf(false) }
    LaunchedEffect(payload.targetReps, initialWeight, enabled) {
        if (enabled && payload.targetReps == reps && initialWeight == weight) edited = false
        if (!edited) { reps = payload.targetReps; weight = initialWeight }
    }
    // Keep the phone's live target in sync after the wearer finishes a burst of taps.
    LaunchedEffect(reps, weight, edited) {
        if (edited) {
            delay(500)
            onTargetChange(reps, weight)
        }
    }
    WorkoutPage {
        WorkoutHeading("Série ${payload.setIndex} / ${payload.totalSets}")
        WorkoutStepper(if (payload.isBodyweight && weight == 0.0) "Corps" else wearWeight(weight), "kg", enabled,
            onMinus = { weight = (weight - 1.0).coerceAtLeast(0.0); edited = true },
            onPlus = { weight += 1.0; edited = true })
        WorkoutStepper("$reps", "rép.", enabled,
            onMinus = { reps = (reps - 1).coerceAtLeast(1); edited = true },
            onPlus = { reps++; edited = true })
        WorkoutCircle(if (enabled) "✓" else "…", "Valider la série", enabled, WatchPalette.Green,
            onClick = { onValidate(reps, weight) })
        WorkoutError(error)
    }
}

@Composable
private fun WorkoutStepper(value: String, unit: String, enabled: Boolean, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        WorkoutCircle("−", "Diminuer $unit", enabled, onClick = onMinus)
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = Color.White, fontSize = if (value.length > 4) 22.sp else 30.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(unit, color = WatchPalette.Muted, fontSize = 11.sp)
        }
        WorkoutCircle("+", "Augmenter $unit", enabled, onClick = onPlus)
    }
}

@Composable
internal fun WorkoutRest(state: WatchScreenState.Ready, onPause: () -> Unit, onSkip: () -> Unit,
                         onRemove: () -> Unit, onAdd: () -> Unit) {
    val remaining = state.displayRestRemaining
    var maximum by rememberSaveable(state.payload.sessionId) { mutableStateOf(remaining.coerceAtLeast(1)) }
    LaunchedEffect(remaining) { if (remaining > maximum) maximum = remaining }
    val enabled = state.busyAction == null
    WorkoutPage {
        Box(Modifier.fillMaxWidth().height(128.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(128.dp)) {
                val stroke = 5.dp.toPx()
                val inset = stroke / 2
                val arcSize = Size(size.width - stroke, size.height - stroke)
                drawArc(WatchPalette.Line, 135f, 270f, false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
                drawArc(WatchPalette.Green, 135f, 270f * (remaining.toFloat() / maximum).coerceIn(0f, 1f), false,
                    Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (state.pausedRestRemaining != null) "En pause" else "Repos", color = WatchPalette.Muted, fontSize = 12.sp)
                Text("${(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}",
                    fontSize = 34.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                Text("Respire", color = WatchPalette.Muted, fontSize = 11.sp)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            WorkoutCircle(if (state.pausedRestRemaining != null) "▶" else "Ⅱ", "Pause ou reprise du repos", enabled, WatchPalette.Blue, onPause)
            WorkoutCircle("×", "Passer le repos", enabled, onClick = onSkip)
        }
        WorkoutError(state.error)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            WorkoutCircle("−15", "Retirer 15 secondes", enabled, onClick = onRemove)
            WorkoutCircle("+15", "Ajouter 15 secondes", enabled, onClick = onAdd)
        }
    }
}

@Composable
internal fun WorkoutSummary(state: WatchScreenState.Ready, onFinish: () -> Unit) {
    val summary = state.payload.summary
    WorkoutPage {
        Text("✓", color = WatchPalette.Green, fontSize = 20.sp)
        WorkoutHeading("Séance terminée !", state.payload.workoutTitle)
        if (summary != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SummaryTile("◷", summary.durationSeconds?.let { formatRest(it) } ?: "—", "Durée", WatchPalette.Green, Modifier.weight(1f))
                SummaryTile("✓", "${summary.exercises}", "Exercices", WatchPalette.Blue, Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SummaryTile("↗", String.format(Locale.FRANCE, "%,d", summary.volumeKg), "kg · volume", WatchPalette.Blue, Modifier.weight(1f))
                SummaryTile("ϟ", summary.sessionCaloriesKcal?.toInt()?.toString() ?: "${summary.sets}",
                    if (summary.sessionCaloriesKcal != null) "kcal" else "Séries", WatchPalette.Orange, Modifier.weight(1f))
            }
            Text("+${summary.xpGained} XP", color = WatchPalette.Green, fontSize = 12.sp)
            if (summary.levelReached) Text("Niveau ${summary.level} atteint", color = WatchPalette.Green, fontSize = 12.sp)
            summary.averageHeartRateBpm?.let { SummaryLine("♥", "$it bpm", "FC moyenne", Color(0xFFFF5E7E)) }
        } else Text("Bilan en cours de synchronisation…", color = WatchPalette.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
        WorkoutError(state.error)
        WorkoutPill("Terminer", state.busyAction == null, primary = true, onClick = onFinish)
    }
}

@Composable
private fun SummaryTile(symbol: String, value: String, label: String, color: Color, modifier: Modifier) {
    Column(modifier.padding(vertical = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(symbol, color = color, fontSize = 16.sp)
        Text(value, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(label, color = WatchPalette.Muted, fontSize = 11.sp, maxLines = 1,
            overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SummaryLine(symbol: String, value: String, label: String, color: Color) {
    Row(Modifier.fillMaxWidth(0.94f).background(WatchPalette.Surface, RoundedCornerShape(14.dp))
        .padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(symbol, color = color, fontSize = 20.sp, modifier = Modifier.width(30.dp))
        Column(Modifier.weight(1f)) {
            Text(value, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(label, color = WatchPalette.Muted, fontSize = 11.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
internal fun WorkoutError(error: String?) {
    if (error != null) Text(if (error.contains("capteurs", ignoreCase = true)) error else "Synchronisation en attente. Vérifie ton téléphone.",
        color = WatchPalette.Orange, fontSize = 11.sp, textAlign = TextAlign.Center)
}

internal fun wearWeight(value: Double): String = if (value == value.toInt().toDouble()) value.toInt().toString()
    else String.format(Locale.FRANCE, "%.1f", value)

internal fun wearExerciseName(name: String): String = name.replace(Regex("\\([^)]*\\)"), "")
    .replace(" avec barre", " · barre", ignoreCase = true)
    .replace(" avec haltères", " · haltères", ignoreCase = true).trim()
