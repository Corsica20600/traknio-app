package com.traknio.watch

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import androidx.wear.compose.material.MaterialTheme

/**
 * Visual regression fixtures for the three representative round Wear widths.
 * They deliberately use the longest realistic exercise label and large values;
 * opening these in Android Studio makes regressions in the curved corners
 * immediately visible without needing a paired phone.
 */
@Preview(name = "Round 192 · exercise list", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320")
@Preview(name = "Round 213 · exercise list", device = "spec:width=213dp,height=213dp,shape=Round,unit=dp,dpi=320")
@Preview(name = "Round 227 · exercise list", device = "spec:width=227dp,height=227dp,shape=Round,unit=dp,dpi=320")
@Composable
private fun RoundExerciseListPreview() = RoundPreviewSurface {
    WorkoutExerciseList(roundPreviewPayload, enabled = true, onExercise = {})
}

@Preview(name = "Round 192 · home long title 130%", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320", fontScale = 1.3f)
@Preview(name = "Round 213 · home", device = "spec:width=213dp,height=213dp,shape=Round,unit=dp,dpi=320")
@Composable
private fun RoundHomePreview() = RoundPreviewSurface {
    WorkoutHome(roundPreviewPayload, onPrograms = {}, onHealth = {}, onMenu = {}, onOpen = {})
}

@Preview(name = "Round 192 · long text 130%", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320", fontScale = 1.3f)
@Composable
private fun RoundLongTextPreview() = RoundPreviewSurface {
    WorkoutExerciseDetail(roundPreviewPayload, selectedIndex = 2, enabled = true, onBack = {}, onOpen = {})
}

@Preview(name = "Round 192 · rest", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320")
@Preview(name = "Round 227 · rest", device = "spec:width=227dp,height=227dp,shape=Round,unit=dp,dpi=320")
@Composable
private fun RoundRestPreview() = RoundPreviewSurface {
    WorkoutRest(
        WatchScreenState.Ready(roundPreviewPayload, displayRestRemaining = 90, syncLabel = "Aperçu"),
        onPause = {}, onSkip = {}, onRemove = {}, onAdd = {},
    )
}

@Preview(name = "Round 192 · editors 130%", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320", fontScale = 1.3f)
@Composable
private fun RoundSetEditorPreview() = RoundPreviewSurface {
    WorkoutSetEntry(roundPreviewPayload, enabled = true, error = "Synchronisation en attente.", onValidate = { _, _ -> }, onBack = {})
}

@Preview(name = "Round 192 · summary long values", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320", fontScale = 1.3f)
@Preview(name = "Round 227 · summary", device = "spec:width=227dp,height=227dp,shape=Round,unit=dp,dpi=320")
@Composable
private fun RoundSummaryPreview() = RoundPreviewSurface {
    WorkoutSummary(WatchScreenState.Ready(roundPreviewPayload.copy(status = "COMPLETED"), syncLabel = "Aperçu"), onFinish = {})
}

@Preview(name = "Round 192 · ready to finish", device = "spec:width=192dp,height=192dp,shape=Round,unit=dp,dpi=320", fontScale = 1.3f)
@Composable
private fun RoundReadyToFinishPreview() = RoundPreviewSurface {
    WorkoutPage {
        WorkoutHeading("Dernière série validée", "Google Play Reviewer - Séance test")
        WorkoutPill("Terminer la séance", primary = true, onClick = {})
    }
}

@Composable
private fun RoundPreviewSurface(content: @Composable () -> Unit) {
    MaterialTheme { WatchChrome(content) }
}

private val roundPreviewPayload = WatchPayload(
    sessionId = "round-preview",
    workoutTitle = "Google Play Reviewer - Séance test",
    exerciseName = "Abducteur de cuisse à la machine",
    exerciseIndex = 3,
    totalExercises = 3,
    setIndex = 3,
    totalSets = 4,
    targetReps = 12,
    weight = 125.5,
    activeWeight = 125.5,
    proposedWeight = null,
    weightConfirmationRequired = false,
    isBodyweight = false,
    restRemaining = 90,
    restStatus = "ACTIVE",
    restUpdatedAt = null,
    revision = "preview",
    status = "IN_PROGRESS",
    summary = WatchSessionSummary(3600, 123456, 3, 12, 148, 480.0, 250, 9, false),
    exercises = listOf(
        WatchExerciseSummary(0, "Ischio-jambiers", 3, 3, 3, 12, 90.0),
        WatchExerciseSummary(1, "Presse à cuisses inclinée", 4, 2, 3, 10, 180.0),
        WatchExerciseSummary(2, "Abducteur de cuisse à la machine", 4, 2, 3, 12, 125.5),
    ),
)
