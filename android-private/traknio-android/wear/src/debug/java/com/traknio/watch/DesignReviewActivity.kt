package com.traknio.watch

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.wear.compose.material.MaterialTheme

/** Offline fixtures: uses the production composables, without API, pairing or health tracking. */
class DesignReviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val initial = intent.getStringExtra("screen") ?: "home"
        setContent {
            var screen by remember { mutableStateOf(initial) }
            var payload by remember { mutableStateOf(reviewPayload()) }
            var paused by remember { mutableStateOf(false) }
            var rest by remember { mutableStateOf(90) }
            var feedback by remember { mutableStateOf(WatchFeedbackState()) }
            val state = WatchScreenState.Ready(payload, rest, "Aperçu", pausedRestRemaining = if (paused) rest else null)
            MaterialTheme {
                WatchChrome {
                    when (screen) {
                        "feedback" -> WorkoutFeedback(payload.sessionId, feedback, { id, _, _ -> feedback = WatchFeedbackState(id, saved = true) }, { screen = "home" })
                        "settings" -> WorkoutSettings { screen = "menu" }
                        "menu", "history", "statistics" -> WorkoutInsights(
                            WatchInsightsState(page = screen, payload = org.json.JSONObject(if (screen == "history") """
                                {"history":[{"id":"one","title":"Push","createdAt":"2026-09-12T09:00:00Z","endedAt":"2026-09-12T10:00:00Z","durationSeconds":3600,"sets":24,"exercises":7,"volumeKg":18420},{"id":"two","title":"Pull","createdAt":"2026-09-10T09:00:00Z","endedAt":"2026-09-10T10:00:00Z","durationSeconds":3000,"sets":20,"exercises":6,"volumeKg":12100}],"nextCursor":null}
                            """ else """
                                {"statistics":{"days":[{"sessions":1},{"sessions":0},{"sessions":1},{"sessions":0},{"sessions":1},{"sessions":0},{"sessions":0}],"sessions":3,"volumeKg":42000,"volumeChangePercent":12}}
                            """)), { screen = it }, { screen = if (screen == "menu") "home" else "menu" }, {}, {}, { screen = "programs" })
                        "home" -> WorkoutHome(payload, onPrograms = { screen = "programs" }, onHealth = { screen = "health" }) { screen = "list" }
                        "health" -> WorkoutHealthScreen(payload.sessionId) { screen = "home" }
                        "confirmed" -> WorkoutSetConfirmed(WatchSetConfirmation(payload.sessionId, payload.targetReps, payload.weight, null)) { screen = "rest" }
                        "programs" -> WorkoutPrograms(WatchProgramLibrary(open = true, programs = listOf(
                            WatchProgram("push", "Push", listOf(WatchProgramDay("push-day", "Pectoraux · Épaules", "Pecs · Épaules · Triceps", 3))),
                            WatchProgram("pull", "Pull", listOf(WatchProgramDay("pull-day", "Dos · Biceps", "Dos · Biceps", 4))),
                            WatchProgram("legs", "Jambes", listOf(WatchProgramDay("legs-day", "Bas du corps", "Quadriceps · Ischios", 5)))
                        )), { screen = "home" }, {}, {}, { _, _ -> screen = "list" })
                        "list" -> WorkoutExerciseList(payload, true) { index ->
                            val exercise = payload.exercises.first { it.index == index }
                            payload = payload.copy(exerciseIndex = index + 1, exerciseName = exercise.name,
                                totalSets = exercise.totalSets, setIndex = exercise.activeSetIndex)
                            screen = "detail"
                        }
                        "detail" -> WorkoutExerciseDetail(payload, payload.exerciseIndex - 1, true,
                            onBack = { screen = "list" }, onOpen = { screen = "set" })
                        "set" -> WorkoutSetEntry(payload, true, null, onValidate = { reps, weight ->
                            payload = payload.copy(targetReps = reps, weight = weight)
                            screen = "confirmed"
                        }, onBack = { screen = "detail" })
                        "rest" -> WorkoutRest(state, { paused = !paused }, { screen = "summary" },
                            { rest = (rest - 15).coerceAtLeast(0) }, { rest += 15 })
                        "summary" -> WorkoutSummary(state) { screen = "feedback" }
                        "empty" -> WorkoutEmpty("session_not_found", onRefresh = { screen = "home" })
                        "error" -> WorkoutEmpty("Timed out waiting for 12000 ms", onRefresh = { screen = "home" })
                    }
                }
            }
        }
    }
}

private fun reviewPayload() = WatchPayload(
    sessionId = "offline-design-review", workoutTitle = "Push", exerciseName = "Développé couché",
    exerciseIndex = 1, totalExercises = 3, setIndex = 2, totalSets = 4, targetReps = 8,
    weight = 100.0, activeWeight = 100.0, proposedWeight = null, weightConfirmationRequired = false,
    isBodyweight = false, restRemaining = 90, restStatus = "ACTIVE", restUpdatedAt = null,
    revision = "review", status = "IN_PROGRESS",
    summary = WatchSessionSummary(3138, 18420, 7, 24, 142, 412.0, 100, 4, false),
    exercises = listOf(
        WatchExerciseSummary(0, "Développé couché", 4, 1, 2, 8, 100.0, imageUrl = "/media/exercises/barbell-bench-press-medium-grip/0.jpg"),
        WatchExerciseSummary(1, "Développé incliné", 3, 0, 1, 10, 70.0, imageUrl = "/media/exercises/barbell-incline-bench-press-medium-grip/0.jpg"),
        WatchExerciseSummary(2, "Écartés haltères", 3, 0, 1, 12, 16.0),
    ),
)
