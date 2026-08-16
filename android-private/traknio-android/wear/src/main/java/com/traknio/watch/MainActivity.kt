package com.traknio.watch

import android.os.Bundle
import android.app.Activity
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
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
import com.traknio.watch.R

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
    val activity = LocalContext.current as? Activity
    val permissionsLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        viewModel.onExercisePermissionsUpdated()
    }
    val activeSessionId = (state as? WatchScreenState.Ready)?.payload?.takeIf { it.status == "IN_PROGRESS" }?.sessionId
    LaunchedEffect(activeSessionId) {
        if (activeSessionId == null || activity == null) return@LaunchedEffect
        val permissions = ExercisePermissions.requiredRuntimePermissions()
        val missing = permissions.filter { ContextCompat.checkSelfPermission(activity, it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) permissionsLauncher.launch(missing.toTypedArray())
    }
    val keepScreenOn = (state as? WatchScreenState.Ready)
        ?.payload
        ?.status != "COMPLETED" && state is WatchScreenState.Ready
    KeepScreenOn(keepScreenOn)
    MaterialTheme {
        WatchChrome(
            compact = (state as? WatchScreenState.Ready)?.payload?.status == "COMPLETED",
        ) {
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
private fun WatchChrome(
    compact: Boolean = false,
    content: @Composable () -> Unit,
) {
    val isRound = LocalConfiguration.current.isScreenRound
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
                .padding(
                    horizontal = if (isRound) WearDimensions.roundHorizontalSafe else WearDimensions.rectangularHorizontalSafe,
                    vertical = if (compact) WearDimensions.compactVerticalSafe else if (isRound) WearDimensions.roundVerticalSafe else 24.dp,
                ),
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
    var destination by remember(payload.sessionId) { mutableStateOf(WorkoutDestination.List) }
    var detailExerciseIndex by remember(payload.sessionId) { mutableStateOf<Int?>(null) }

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
        else -> when (destination) {
            WorkoutDestination.List -> WorkoutListScreen(payload, state.busyAction == null, onExercise = { index ->
                detailExerciseIndex = index
                destination = WorkoutDestination.Detail
                viewModel.selectExercise(index)
            })
            WorkoutDestination.Detail -> ExerciseDetailScreen(payload, detailExerciseIndex, state.busyAction == null, onBack = { destination = WorkoutDestination.List }, onOpenActiveSet = { destination = WorkoutDestination.Set })
            WorkoutDestination.Set -> ActiveSetScreen(state, viewModel, onBack = { destination = WorkoutDestination.Detail })
        }
    }
}

private enum class WorkoutDestination { List, Detail, Set }

@Composable
private fun WorkoutListScreen(payload: WatchPayload, enabled: Boolean, onExercise: (Int) -> Unit) {
    // Never substitute a debug workout for an authenticated session. A server payload is
    // authoritative: an incomplete payload still reports its real 1/13-style progress.
    val exercises = payload.exercises.ifEmpty {
        listOf(WatchExerciseSummary(payload.exerciseIndex - 1, payload.exerciseName, payload.totalSets, payload.setIndex - 1, payload.setIndex, payload.targetReps, payload.weight ?: payload.activeWeight))
    }
    val activeItemIndex = exercises.indexOfFirst { it.index == payload.exerciseIndex - 1 }.coerceAtLeast(0)
    key(payload.sessionId, exercises.size, activeItemIndex) {
        val listState = rememberScalingLazyListState(initialCenterItemIndex = activeItemIndex)
        Box(modifier = Modifier.fillMaxSize()) {
            ScalingLazyColumn(
                modifier = Modifier.fillMaxSize().padding(top = 20.dp),
                state = listState,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
        items(exercises, key = { it.index }) { exercise ->
            val complete = exercise.completedSets >= exercise.totalSets
            val active = exercise.index == payload.exerciseIndex - 1
            Chip(
                modifier = Modifier
                    .fillMaxWidth(WearDimensions.workoutListWidthFraction)
                    .height(if (active) WearDimensions.activeListCardHeight else WearDimensions.listCardHeight)
                    .padding(vertical = 2.dp),
                label = {
                    Column(modifier = Modifier.padding(vertical = 2.dp)) {
                        Text(compactWearExerciseName(exercise.name), maxLines = 1, overflow = TextOverflow.Ellipsis, style = WearTypography.title.copy(fontSize = if (active) 13.sp else 11.sp, fontWeight = if (active) FontWeight.Black else FontWeight.Bold))
                        Text(if (complete) "✓ ${exercise.completedSets}/${exercise.totalSets}" else if (active) "● ${exercise.completedSets}/${exercise.totalSets} · ${exercise.weight?.let { "${trimWeight(it)} kg" } ?: "charge libre"}" else "○ ${exercise.completedSets}/${exercise.totalSets}", color = if (active) Color(0xFFBFE6FF) else Color(0xFF8E9BB3), fontSize = 9.sp)
                    }
                },
                colors = ChipDefaults.chipColors(backgroundColor = if (active) Color(0xFF163967) else Color(0xFF0C1629), contentColor = Color.White),
                enabled = enabled,
                onClick = { onExercise(exercise.index) },
            )
        }
                item { Spacer(Modifier.height(8.dp)) }
            }
            Text("SÉANCE  ${exercises.count { it.completedSets >= it.totalSets }}/${payload.totalExercises}", modifier = Modifier.align(Alignment.TopCenter), color = Color(0xFFBFE6FF), style = WearTypography.accent.copy(fontSize = 11.sp))
        }
    }
}

@Composable
private fun ExerciseDetailScreen(payload: WatchPayload, selectedIndex: Int?, enabled: Boolean, onBack: () -> Unit, onOpenActiveSet: () -> Unit) {
    val exercise = payload.exercises.firstOrNull { it.index == selectedIndex }
        ?: payload.exercises.getOrNull(payload.exerciseIndex - 1)
    val title = compactWearExerciseName(exercise?.name ?: payload.exerciseName)
    val hasLongTitle = title.length > 30
    Box(modifier = Modifier.fillMaxSize()) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().padding(top = if (hasLongTitle) 48.dp else 52.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        items((1..(exercise?.totalSets ?: payload.totalSets)).toList()) { set ->
            val done = set <= (exercise?.completedSets ?: 0)
            val active = set == (exercise?.activeSetIndex ?: payload.setIndex)
            Chip(
                modifier = Modifier.fillMaxWidth(WearDimensions.contentWidthFraction).height(WearDimensions.setRowHeight).padding(vertical = 2.dp),
                label = { Text("S$set   ${exercise?.targetReps ?: payload.targetReps} × ${exercise?.weight?.let { "${trimWeight(it)} kg" } ?: "—"}   ${if (done) "✓" else if (active) "●" else "○"}", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, fontSize = 12.sp, fontWeight = if (active) FontWeight.Black else FontWeight.Medium) },
                colors = ChipDefaults.chipColors(backgroundColor = if (active) Color(0xFF163967) else Color(0xFF0C1629), contentColor = Color.White),
                enabled = enabled && active,
                onClick = onOpenActiveSet,
            )
        }
    }
        Column(modifier = Modifier.align(Alignment.TopCenter), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("‹  Séance", modifier = Modifier.height(if (hasLongTitle) 25.dp else 28.dp).clickable(enabled = enabled, onClick = onBack), color = Color(0xFF9CCBFF), style = WearTypography.accent.copy(fontSize = 10.sp))
            Text(title, textAlign = TextAlign.Center, style = WearTypography.title.copy(fontSize = if (hasLongTitle) 13.sp else 14.sp, lineHeight = if (hasLongTitle) 14.sp else 16.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
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
        if (state.error != null) Text(state.error, color = Color(0xFFFFB86B), fontSize = 10.sp)
        Spacer(Modifier.height(10.dp))
        BigActionButton(if (state.busyAction == "finish") "..." else "Terminer la séance", enabled, viewModel::completeSession)
    }
}

@Composable
private fun ActiveSetScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel, onBack: () -> Unit) {
    val payload = state.payload
    val enabled = state.busyAction == null
    val initialWeight = (payload.weight ?: payload.activeWeight ?: 0.0).coerceAtLeast(0.0)
    var reps by remember(payload.sessionId, payload.exerciseIndex, payload.setIndex) { mutableStateOf(payload.targetReps) }
    var weight by remember(payload.sessionId, payload.exerciseIndex, payload.setIndex) { mutableStateOf(initialWeight) }
    var editor by remember { mutableStateOf<SetEditor?>(null) }

    // A phone update changes the payload without changing the active set key. Keep the
    // displayed target aligned with that authoritative payload, except while the wearer
    // is actively adjusting a value in the editor.
    LaunchedEffect(payload.targetReps, initialWeight, editor) {
        if (editor == null) {
            reps = payload.targetReps
            weight = initialWeight
        }
    }

    when (editor) {
        SetEditor.Reps -> ValueEditorScreen(
            label = "RÉPÉTITIONS",
            value = reps.toDouble(),
            unit = "reps",
            decrement = 1.0,
            increment = 1.0,
            minimum = 1.0,
            onValueChange = { reps = it.toInt() },
            onDone = {
                viewModel.updateLiveTarget(reps, weight)
                editor = null
            },
        )
        SetEditor.Weight -> ValueEditorScreen(
            label = "CHARGE",
            value = weight,
            unit = "kg",
            decrement = 2.5,
            increment = 2.5,
            minimum = 0.0,
            onValueChange = { weight = it },
            onDone = {
                viewModel.updateLiveTarget(reps, weight)
                editor = null
            },
        )
        null -> ActiveSetContent(
            exerciseName = payload.exerciseName,
            setIndex = payload.setIndex,
            totalSets = payload.totalSets,
            reps = reps,
            weight = weight,
            isBodyweight = payload.isBodyweight,
            enabled = enabled,
            error = state.error,
            onEditReps = { editor = SetEditor.Reps },
            onEditWeight = { editor = SetEditor.Weight },
            onValidate = { viewModel.validateSet(reps, weight) },
            onBack = onBack,
        )
    }
}

@Composable
private fun ActiveSetContent(
    exerciseName: String,
    setIndex: Int,
    totalSets: Int,
    reps: Int,
    weight: Double,
    isBodyweight: Boolean,
    enabled: Boolean,
    error: String?,
    onEditReps: () -> Unit,
    onEditWeight: () -> Unit,
    onValidate: () -> Unit,
    onBack: () -> Unit = {},
) {
    Column(
        // WatchChrome already reserves the round safe area and the TimeText. Adding a second
        // vertical inset here reduced the real XL-round content area below 180 dp.
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        // Zone haute : son contenu garde sa taille naturelle et ne recouvre jamais les actions.
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Keep the header compact for two-line names, but place a transparent 48 dp
            // hit region behind it so the wearer never has to target only the glyphs.
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.96f)
                    .height(12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.70f)
                        .height(48.dp)
                        .offset(y = 12.dp)
                        .clickable(onClick = onBack),
                )
                Text("‹  Séries", color = Color(0xFF9CCBFF), fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
            WearExerciseTitle(exerciseName)
            Text(
                text = "SÉRIE $setIndex/$totalSets",
                color = Color(0xFFBFE6FF),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 2.dp).background(Color(0x332E8BFF), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        Spacer(Modifier.height(5.dp))
        // Two peer-sized touch targets keep values visible and reachable even for a two-line title.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SetValueTarget(
                label = "KG",
                value = if (isBodyweight && weight <= 0) "CORPS" else trimWeight(weight),
                enabled = enabled,
                onClick = onEditWeight,
                modifier = Modifier.width(72.dp),
            )
            SetValueTarget(
                label = "RÉPÉTITIONS",
                value = reps.toString(),
                enabled = enabled,
                onClick = onEditReps,
                modifier = Modifier.width(72.dp),
            )
        }

        // Zone basse stable : it cannot be displaced by a long exercise title.
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (error != null) {
                Text(error, color = Color(0xFFFFB86B), fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            BigActionButton("VALIDER", enabled = enabled, onClick = onValidate)
        }
    }
}

@Composable
private fun SetValueTarget(
    label: String,
    value: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = Color(0xFF9EAFCC), style = WearTypography.label.copy(fontSize = 8.sp), maxLines = 1)
        Button(
            modifier = Modifier.fillMaxWidth().height(66.dp),
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(
                backgroundColor = Color(0xFF183866),
                contentColor = Color.White,
                disabledBackgroundColor = Color(0xFF1B2437),
            ),
            onClick = onClick,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(value, style = WearTypography.display.copy(fontSize = if (value.length > 3) 18.sp else 25.sp, lineHeight = 27.sp), maxLines = 1)
            }
        }
    }
}

private enum class SetEditor { Reps, Weight }

@Composable
private fun ValueEditorScreen(
    label: String,
    value: Double,
    unit: String,
    decrement: Double,
    increment: Double,
    minimum: Double,
    onValueChange: (Double) -> Unit,
    onDone: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val displayedValue = trimWeight(value)
    val valueFontSize = if (displayedValue.length > 3) 46.sp else 54.sp
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(label, color = Color(0xFF9CCBFF), fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Box(
            modifier = Modifier
                .width(if (displayedValue.length > 3) 118.dp else 84.dp)
                .height(58.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color(0x332D1F66), Color(0x142D1F66), Color.Transparent),
                    ),
                    CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(displayedValue, fontSize = valueFontSize, fontWeight = FontWeight.Black, lineHeight = 54.sp, maxLines = 1)
        }
        Text(unit, color = Color(0xFFB7C9EA), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Row(
            modifier = Modifier.padding(top = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            EditorStepButton("−${trimWeight(decrement)}", onClick = {
                onValueChange((value - decrement).coerceAtLeast(minimum))
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            })
            EditorStepButton("+${trimWeight(increment)}", onClick = {
                onValueChange(value + increment)
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            })
        }
        BigActionButton("OK", enabled = true, onClick = onDone, modifier = Modifier.padding(top = 5.dp))
    }
}

@Composable
private fun EditorStepButton(text: String, onClick: () -> Unit) {
    Button(
        modifier = Modifier.size(width = 76.dp, height = 48.dp),
        colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF152C56), contentColor = Color.White),
        onClick = onClick,
    ) { Text(text, style = WearTypography.action.copy(fontSize = 13.sp)) }
}

@Composable
private fun RestScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val enabled = state.busyAction == null

    RestScreenContent(
        remainingSeconds = state.displayRestRemaining,
        isPaused = state.pausedRestRemaining != null,
        exerciseName = state.payload.exerciseName,
        error = state.error,
        isSkipping = state.busyAction == "skip-rest",
        enabled = enabled,
        onRemoveRest = viewModel::removeRest,
        onTogglePause = viewModel::toggleRestPause,
        onAddRest = viewModel::addRest,
        onSkipRest = viewModel::skipRest,
    )
}

@Composable
private fun RestScreenContent(
    remainingSeconds: Int,
    isPaused: Boolean,
    exerciseName: String,
    error: String?,
    isSkipping: Boolean,
    enabled: Boolean,
    onRemoveRest: () -> Unit,
    onTogglePause: () -> Unit,
    onAddRest: () -> Unit,
    onSkipRest: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        WearScreenLabel("Repos", error)
        Spacer(Modifier.height(2.dp))

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Respire", color = Color(0xFFB7C9EA), fontSize = 11.sp)
            Text(
                text = formatRest(remainingSeconds),
                fontSize = if (remainingSeconds >= 60) 40.sp else 48.sp,
                fontWeight = FontWeight.Black,
                lineHeight = 48.sp,
            )
            Text(
                text = if (isPaused) "Chrono en pause" else compactWearExerciseName(exerciseName),
                color = Color(0xFFB7C9EA),
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(3.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                RoundActionButton("-15", enabled, onRemoveRest)
                RoundActionButton(
                    text = if (isPaused) "▶" else "Ⅱ",
                    enabled = enabled,
                    onClick = onTogglePause,
                )
                RoundActionButton("+15", enabled, onAddRest)
            }
            Spacer(Modifier.height(3.dp))
            CompactRestSkipChip(
                text = if (isSkipping) "Passage..." else "Passer le repos",
                onClick = onSkipRest,
                enabled = enabled,
            )
        }
    }
}

@Composable
private fun CompactRestSkipChip(text: String, onClick: () -> Unit, enabled: Boolean) {
    Chip(
        modifier = Modifier
            .width(142.dp)
            .height(48.dp),
        label = {
            Text(
                text = text,
                modifier = Modifier.fillMaxWidth(),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        },
        enabled = enabled,
        colors = ChipDefaults.primaryChipColors(
            backgroundColor = Color(0xFF267DE8),
            contentColor = Color.White,
        ),
        onClick = onClick,
    )
}

@Preview(device = "id:wearos_large_round", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun RestScreenInitialPreview() {
    MaterialTheme {
        WatchChrome {
            RestScreenContent(
                remainingSeconds = 90,
                isPaused = false,
                exerciseName = "Développé couché",
                error = null,
                isSkipping = false,
                enabled = true,
                onRemoveRest = {},
                onTogglePause = {},
                onAddRest = {},
                onSkipRest = {},
            )
        }
    }
}

@Preview(name = "Active set · petite ronde", device = "id:wearos_small_round", widthDp = 192, heightDp = 192, showBackground = true)
@Preview(name = "Active set · grande ronde", device = "id:wearos_large_round", widthDp = 227, heightDp = 227, showBackground = true)
@Preview(name = "Active set · Galaxy Watch Ultra", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun ActiveSetRoundPreview() {
    MaterialTheme {
        WatchChrome {
            ActiveSetContent(
                exerciseName = "Soulevé de terre jambes tendues avec haltères",
                setIndex = 1,
                totalSets = 3,
                reps = 10,
                weight = 40.0,
                isBodyweight = false,
                enabled = true,
                error = null,
                onEditReps = {},
                onEditWeight = {},
                onValidate = {},
            )
        }
    }
}

@Preview(name = "Liste séance · Galaxy Watch Ultra", widthDp = 240, heightDp = 240, showBackground = true)
@Composable
private fun WorkoutListUltraPreview() {
    MaterialTheme { WatchChrome { WorkoutListScreen(
        payload = previewWorkoutPayload(), enabled = true, onExercise = {},
    ) } }
}

@Preview(name = "Détail exercice · Galaxy Watch Ultra", widthDp = 240, heightDp = 240, showBackground = true)
@Composable
private fun ExerciseDetailUltraPreview() {
    MaterialTheme { WatchChrome { ExerciseDetailScreen(previewWorkoutPayload(), 1, true, {}, {}) } }
}

@Preview(name = "Détail exercice long · Galaxy Watch Ultra", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun ExerciseDetailLongTitleUltraPreview() {
    val payload = previewWorkoutPayload().copy(
        exerciseName = "Développé couché avec barre Prise moyenne",
        exercises = listOf(
            WatchExerciseSummary(0, "Développé couché avec barre Prise moyenne", 5, 1, 2, 10, 80.0),
        ),
    )
    MaterialTheme { WatchChrome { ExerciseDetailScreen(payload, 0, true, {}, {}) } }
}

private fun previewWorkoutPayload() = WatchPayload(
    sessionId = "preview", workoutTitle = "Push", exerciseName = "Hack Squat", exerciseIndex = 2, totalExercises = 8,
    setIndex = 3, totalSets = 3, targetReps = 12, weight = 100.0, activeWeight = 100.0, proposedWeight = null,
    weightConfirmationRequired = false, isBodyweight = false, restRemaining = 0, restStatus = "IDLE", restUpdatedAt = null, status = "IN_PROGRESS",
    exercises = listOf(
        WatchExerciseSummary(0, "Développé incliné · haltères", 4, 4, 4, 10, 40.0),
        WatchExerciseSummary(1, "Hack Squat", 3, 2, 3, 12, 100.0),
        WatchExerciseSummary(2, "Rowing à la poulie en hauteur", 3, 0, 1, 12, 80.0),
    ),
)

@Preview(name = "Active set · 480px XL Round", widthDp = 240, heightDp = 240, showBackground = true)
@Composable
private fun ActiveSetUltra480Preview() {
    MaterialTheme {
        WatchChrome {
            ActiveSetContent(
                exerciseName = "Développé incliné · haltères",
                setIndex = 3,
                totalSets = 3,
                reps = 8,
                weight = 80.0,
                isBodyweight = false,
                enabled = true,
                error = null,
                onEditReps = {},
                onEditWeight = {},
                onValidate = {},
            )
        }
    }
}

@Preview(name = "Active set · extension triceps", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun ActiveSetLongNamesPreview() {
    MaterialTheme {
        WatchChrome {
            ActiveSetContent(
                exerciseName = "Extension triceps debout avec haltères",
                setIndex = 3,
                totalSets = 3,
                reps = 8,
                weight = 32.0,
                isBodyweight = false,
                enabled = true,
                error = null,
                onEditReps = {},
                onEditWeight = {},
                onValidate = {},
            )
        }
    }
}

@Preview(name = "Active set · rowing poulie", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun ActiveSetRowingPreview() {
    MaterialTheme {
        WatchChrome {
            ActiveSetContent(
                exerciseName = "Rowing à la poulie en hauteur",
                setIndex = 1,
                totalSets = 3,
                reps = 10,
                weight = 40.0,
                isBodyweight = false,
                enabled = true,
                error = null,
                onEditReps = {},
                onEditWeight = {},
                onValidate = {},
            )
        }
    }
}

@Preview(name = "Repos · petite ronde", device = "id:wearos_small_round", widthDp = 192, heightDp = 192, showBackground = true)
@Preview(name = "Repos · grande ronde", device = "id:wearos_large_round", widthDp = 227, heightDp = 227, showBackground = true)
@Preview(name = "Repos · Galaxy Watch Ultra", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun RestScreenRoundPreview() = RestScreenInitialPreview()

@Preview(name = "Charge · Galaxy Watch Ultra", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun ValueEditorRoundPreview() {
    MaterialTheme {
        WatchChrome {
            ValueEditorScreen(
                label = "CHARGE",
                value = 32.0,
                unit = "kg",
                decrement = 2.5,
                increment = 2.5,
                minimum = 0.0,
                onValueChange = {},
                onDone = {},
            )
        }
    }
}

@Preview(name = "Répétitions · Galaxy Watch Ultra", widthDp = 227, heightDp = 227, showBackground = true)
@Composable
private fun RepetitionsEditorRoundPreview() {
    MaterialTheme {
        WatchChrome {
            ValueEditorScreen(
                label = "RÉPÉTITIONS",
                value = 12.0,
                unit = "reps",
                decrement = 1.0,
                increment = 1.0,
                minimum = 1.0,
                onValueChange = {},
                onDone = {},
            )
        }
    }
}

@Composable
private fun CompletedScreen(state: WatchScreenState.Ready, onRefresh: () -> Unit) {
    val activity = LocalContext.current as? Activity
    val summary = state.payload.summary
    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
        autoCentering = null,
    ) {
        item {
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.traknio_watch_mark_exact),
                contentDescription = "Traknio",
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(width = 28.dp, height = 16.dp),
            )
        }
        item {
            Text(
                text = "SÉANCE TERMINÉE",
                color = Color(0xFFB7C9EA),
                fontSize = 8.sp,
                fontWeight = FontWeight.Black,
            )
        }
        item {
            Text(
                state.payload.workoutTitle.cleanExerciseTitle(),
                modifier = Modifier.fillMaxWidth(0.78f),
                textAlign = TextAlign.Center,
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                maxLines = 2,
                lineHeight = 15.sp,
                overflow = TextOverflow.Ellipsis,
            )
        }
        item {
            Text(
                text = "+${summary?.xpGained ?: 100} XP",
                modifier = Modifier.padding(top = 2.dp),
                color = Color(0xFFC9B5FF),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        if (state.error != null) {
            item {
                Text(state.error, color = Color(0xFFFFB86B), fontSize = 8.sp, modifier = Modifier.padding(top = 1.dp))
            }
        }
        if (summary != null) {
            item {
                SummaryGrid(summary)
            }
            item {
                Text(
                    text = "${summary.sets} séries réalisées",
                    color = Color(0xFF8E9BB3),
                    fontSize = 8.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (summary.levelReached) {
                item {
                    Text("Niveau ${summary.level} atteint", color = Color(0xFFC9B5FF), fontSize = 8.sp, fontWeight = FontWeight.Bold)
                }
            }
        } else {
            item {
                Text("Synthèse en cours...", color = Color(0xFFB7C9EA), fontSize = 10.sp, textAlign = TextAlign.Center)
            }
        }
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 3.dp, bottom = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                FinalActionChip(
                    onClick = { activity?.finish() ?: onRefresh() },
                    enabled = state.busyAction == null,
                )
            }
        }
    }
}

@Composable
private fun SummaryGrid(summary: WatchSessionSummary) {
    Column(
        modifier = Modifier
            .fillMaxWidth(WearDimensions.contentWidthFraction)
            .padding(top = 7.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SummaryCell(
                icon = R.drawable.ic_summary_exercises,
                iconColor = Color(0xFF00E0FF),
                value = "${summary.exercises}",
                label = "EXERCICES",
                modifier = Modifier.width(72.dp),
            )
            SummaryCell(
                icon = R.drawable.ic_summary_volume,
                iconColor = Color(0xFF00C7FF),
                value = "${formatFrenchNumber(summary.volumeKg)} kg",
                label = "VOLUME",
                modifier = Modifier.width(72.dp),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SummaryCell(
                icon = null,
                iconText = "♥",
                iconColor = Color(0xFFFF4D88),
                value = summary.averageHeartRateBpm?.toString() ?: "—",
                label = "FC MOY.",
                modifier = Modifier.width(72.dp),
            )
            SummaryCell(
                icon = null,
                iconText = "◷",
                iconColor = Color(0xFF00E0FF),
                value = formatDuration(summary.durationSeconds),
                label = "DURÉE",
                modifier = Modifier.width(72.dp),
            )
        }
        summary.sessionCaloriesKcal?.let { calories ->
            SummaryCell(
                icon = null,
                iconText = "⚡",
                iconColor = Color(0xFFC9B5FF),
                value = "${kotlin.math.round(calories).toInt()} kcal",
                label = "CALORIES SÉANCE",
                modifier = Modifier.align(Alignment.CenterHorizontally).width(92.dp),
            )
        }
    }
}

@Composable
private fun SummaryCell(
    icon: Int?,
    iconColor: Color,
    value: String,
    label: String,
    modifier: Modifier,
    iconText: String? = null,
) {
    Column(
        modifier = modifier.padding(vertical = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (icon != null) {
            androidx.compose.foundation.Image(
                painter = painterResource(icon),
                contentDescription = null,
                colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(iconColor),
                modifier = Modifier.size(13.dp),
            )
        } else {
            Text(iconText.orEmpty(), color = iconColor, fontSize = 12.sp, fontWeight = FontWeight.Black)
        }
        Text(value, color = Color.White, fontSize = if (value.length > 6) 12.sp else 14.sp, fontWeight = FontWeight.Black, maxLines = 1)
        Text(label, color = Color(0xFF8E9BB3), fontSize = 7.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun FinalActionChip(onClick: () -> Unit, enabled: Boolean) {
    Chip(
        modifier = Modifier.width(142.dp).height(WearDimensions.minimumActionHeight),
        label = {
            Text(
                text = "Terminer",
                modifier = Modifier.fillMaxWidth(),
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        },
        enabled = enabled,
        colors = ChipDefaults.primaryChipColors(
            backgroundColor = Color(0xFF101829),
            contentColor = Color(0xFFDFE8FB),
        ),
        onClick = onClick,
    )
}

@Composable
private fun WearExerciseTitle(title: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = compactWearExerciseName(title),
            modifier = Modifier.fillMaxWidth(0.78f),
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            lineHeight = 14.sp,
        )
    }
}

@Composable
private fun WearScreenLabel(title: String, error: String?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.Black)
        if (error != null) Text(error, color = Color(0xFFFFB86B), fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
private fun BigActionButton(text: String, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val haptics = LocalHapticFeedback.current
    Button(
        modifier = modifier
            .fillMaxWidth(0.70f)
            .height(48.dp),
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
        Text(text, style = WearTypography.action.copy(fontSize = 13.sp, letterSpacing = 0.6.sp))
    }
}

@Composable
private fun WearValueButton(text: String, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        modifier = modifier.size(width = 126.dp, height = 48.dp),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            backgroundColor = Color(0xFF183866),
            contentColor = Color.White,
            disabledBackgroundColor = Color(0xFF1B2437),
        ),
        onClick = onClick,
    ) { Text(text, style = WearTypography.display.copy(fontSize = 16.sp, lineHeight = 20.sp)) }
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

private fun compactWearExerciseName(name: String): String {
    val cleaned = name.cleanExerciseTitle().replace(Regex("\\s+"), " ")
    return cleaned
        .replace(" avec haltères", " · haltères", ignoreCase = true)
        .replace(" avec halteres", " · haltères", ignoreCase = true)
        .replace(" à la poulie en hauteur", " · poulie haute", ignoreCase = true)
        .replace(" · · ", " · ")
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

private fun formatFrenchNumber(value: Int): String {
    return String.format(java.util.Locale.ROOT, "%,d", value).replace(',', ' ')
}
