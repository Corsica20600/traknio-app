package com.traknio.watch

import android.os.Bundle
import android.app.Activity
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.ComponentActivity
import androidx.activity.viewModels
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.wear.compose.foundation.rememberSwipeToDismissBoxState
import androidx.wear.compose.material.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

class MainActivity : ComponentActivity() {
    private val watchViewModel by viewModels<WatchViewModel> {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return WatchViewModel(applicationContext) as T
            }
        }
    }

    override fun onStart() {
        super.onStart()
        ExerciseTrackingService.activityVisible = true
    }

    override fun onStop() {
        ExerciseTrackingService.activityVisible = false
        super.onStop()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Keep the platform splash over the first data fetch. Showing Compose's
        // old LoadingScreen here created a second, custom splash after Android's
        // compliant one, which Play can evaluate as the app startup screen.
        val splashScreen = installSplashScreen()
        splashScreen.setKeepOnScreenCondition {
            watchViewModel.state.value is WatchScreenState.Loading
        }
        super.onCreate(savedInstanceState)
        setContent {
            TraknioWearApp(watchViewModel)
        }
    }
}

@Composable
private fun TraknioWearApp(viewModel: WatchViewModel) {
    val context = LocalContext.current.applicationContext
    val state by viewModel.state.collectAsState()
    val library by viewModel.programLibrary.collectAsState()
    val insights by viewModel.insights.collectAsState()
    val activity = LocalContext.current as? Activity
    val permissionsLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        viewModel.onExercisePermissionsUpdated()
    }
    val activeSessionId = (state as? WatchScreenState.Ready)?.payload
        ?.takeIf { it.status == "IN_PROGRESS" || it.status == "READY_TO_COMPLETE" }?.sessionId
    DisposableEffect(activity, activeSessionId) {
        val prefs = context.getSharedPreferences("screen_preferences", android.content.Context.MODE_PRIVATE)
        fun applyPolicy() {
            if (activeSessionId != null && prefs.getBoolean("keep_awake", false)) {
                activity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> applyPolicy() }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        applyPolicy()
        onDispose {
            prefs.unregisterOnSharedPreferenceChangeListener(listener)
            activity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
    LaunchedEffect(activeSessionId) {
        if (activeSessionId == null || activity == null) return@LaunchedEffect
        val healthPermissions = if ((state as? WatchScreenState.Ready)?.payload?.status == "IN_PROGRESS") {
            ExercisePermissions.requiredRuntimePermissions(targetSdkInt = context.applicationInfo.targetSdkVersion)
        } else emptyList()
        val permissions = healthPermissions +
            if (Build.VERSION.SDK_INT >= 33) listOf(android.Manifest.permission.POST_NOTIFICATIONS) else emptyList()
        val missing = permissions.filter { ContextCompat.checkSelfPermission(activity, it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) permissionsLauncher.launch(missing.toTypedArray())
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.onExercisePermissionsUpdated()
                viewModel.onForeground()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    BackHandler(enabled = activeSessionId != null) { activity?.moveTaskToBack(true) }
    // The platform splash remains visible while this state is Loading.
    if (state is WatchScreenState.Loading) {
        return
    }
    MaterialTheme {
        SwipeToDismissBox(
            state = rememberSwipeToDismissBoxState(),
            onDismissed = { (activity as? ComponentActivity)?.onBackPressedDispatcher?.onBackPressed() },
        ) { isBackground ->
            if (!isBackground) {
                WatchChrome {
                    if (library.open) {
                        WorkoutPrograms(library, viewModel::closePrograms, viewModel::refreshPrograms, viewModel::morePrograms, viewModel::startProgram)
                    } else if (insights.page != null) {
                        WorkoutInsights(insights, viewModel::openInsights, viewModel::closeInsights,
                            viewModel::refreshInsights, viewModel::moreHistory, viewModel::openPrograms)
                    } else when (val current = state) {
                        WatchScreenState.Loading -> Unit
                        is WatchScreenState.Empty -> WorkoutEmpty(current.message, viewModel::refresh, viewModel::openPrograms, { viewModel.openInsights("menu") })
                        is WatchScreenState.Ready -> ReadyScreen(current, viewModel)
                    }
                }
            }
        }
    }
}

@Composable
internal fun WatchChrome(content: @Composable () -> Unit) {
    Scaffold(timeText = { TimeText(modifier = Modifier.padding(top = 3.dp)) }) {
        WearSafeScreen(Modifier.fillMaxSize().background(Color.Black), content)
    }
}

@Composable
private fun EmptyScreen(message: String, onRefresh: () -> Unit) = WorkoutEmpty(message, onRefresh)

private enum class WorkoutDestination { Home, List, Detail, Set, Health }

@Composable
private fun ReadyScreen(state: WatchScreenState.Ready, viewModel: WatchViewModel) {
    val payload = state.payload
    val feedback by viewModel.feedback.collectAsState()
    var showFeedback by rememberSaveable(payload.sessionId) { mutableStateOf(false) }
    val confirmation by viewModel.setConfirmation.collectAsState()
    var nextExercise by rememberSaveable(payload.sessionId) { mutableStateOf<String?>(null) }
    LaunchedEffect(confirmation) {
        val saved = confirmation ?: return@LaunchedEffect
        if (saved.sessionId == payload.sessionId) {
            nextExercise = saved.nextExercise
            kotlinx.coroutines.delay(1_500)
        }
        viewModel.dismissSetConfirmation()
    }
    val activity = LocalContext.current as? Activity
    val enabled = state.busyAction == null
    val isResting = state.displayRestRemaining > 0
    val haptics = LocalHapticFeedback.current
    var wasResting by remember { mutableStateOf(isResting) }
    LaunchedEffect(isResting) {
        if (isResting && !wasResting) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        wasResting = isResting
    }
    var destination by rememberSaveable(payload.sessionId) { mutableStateOf(WorkoutDestination.Home) }
    var detailIndex by rememberSaveable(payload.sessionId) { mutableStateOf<Int?>(null) }
    BackHandler(enabled = payload.status == "IN_PROGRESS" && !isResting && destination != WorkoutDestination.Home) {
        destination = when (destination) {
            WorkoutDestination.Set -> WorkoutDestination.Detail
            WorkoutDestination.Detail -> WorkoutDestination.List
            else -> WorkoutDestination.Home
        }
    }
    when {
        confirmation?.sessionId == payload.sessionId -> WorkoutSetConfirmed(confirmation!!, viewModel::dismissSetConfirmation)
        destination == WorkoutDestination.Health -> WorkoutHealthScreen(payload.sessionId) { destination = WorkoutDestination.Home }
        payload.status == "COMPLETED" && showFeedback -> WorkoutFeedback(payload.sessionId, feedback, viewModel::submitFeedback) { activity?.finish() ?: viewModel.refresh() }
        payload.status == "COMPLETED" -> WorkoutSummary(state) { showFeedback = true }
        payload.status == "READY_TO_COMPLETE" -> WorkoutPage {
            WorkoutHeading("Dernière série validée", "Ta séance est complète.")
            WorkoutError(state.error)
            WorkoutPill(if (enabled) "Terminer la séance" else "Enregistrement…", enabled, primary = true,
                onClick = viewModel::completeSession)
        }
        isResting -> WorkoutRest(state, viewModel::toggleRestPause, viewModel::skipRest, viewModel::removeRest, viewModel::addRest)
        nextExercise != null -> WorkoutPage {
            WorkoutHeading("Exercice suivant", nextExercise)
            WorkoutIllustration(payload.exercises.firstOrNull { it.index == payload.exerciseIndex - 1 }?.imageUrl, payload.exerciseName)
            WorkoutPill("Commencer", enabled, primary = true) {
                nextExercise = null
                detailIndex = payload.exerciseIndex - 1
                destination = WorkoutDestination.Set
            }
        }
        else -> when (destination) {
            WorkoutDestination.Home -> WorkoutHome(payload, onOpen = { destination = WorkoutDestination.List }, onPrograms = viewModel::openPrograms,
                onHealth = { destination = WorkoutDestination.Health }, onMenu = { viewModel.openInsights("menu") })
            WorkoutDestination.Health -> Unit
            WorkoutDestination.List -> WorkoutExerciseList(payload, enabled) { index ->
                detailIndex = index
                destination = WorkoutDestination.Detail
                viewModel.selectExercise(index)
            }
            WorkoutDestination.Detail -> WorkoutExerciseDetail(payload, detailIndex, enabled,
                onBack = { destination = WorkoutDestination.List },
                onOpen = { destination = WorkoutDestination.Set })
            WorkoutDestination.Set -> WorkoutSetEntry(payload, enabled, state.error,
                onValidate = viewModel::validateSet, onBack = { destination = WorkoutDestination.Detail },
                onTargetChange = viewModel::updateLiveTarget)
        }
    }
}
