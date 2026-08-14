package com.traknio.watch

data class WatchPayload(
    val sessionId: String,
    val workoutTitle: String,
    val exerciseName: String,
    val exerciseIndex: Int,
    val totalExercises: Int,
    val setIndex: Int,
    val totalSets: Int,
    val targetReps: Int,
    val weight: Double?,
    val activeWeight: Double?,
    val proposedWeight: Double?,
    val weightConfirmationRequired: Boolean,
    val isBodyweight: Boolean,
    val restRemaining: Int,
    val restStatus: String,
    val restUpdatedAt: String?,
    val status: String,
    val summary: WatchSessionSummary? = null,
    val exercises: List<WatchExerciseSummary> = emptyList(),
)

data class WatchExerciseSummary(
    val index: Int,
    val name: String,
    val totalSets: Int,
    val completedSets: Int,
    val activeSetIndex: Int,
    val targetReps: Int,
    val weight: Double?,
)

data class WatchSessionSummary(
    val durationSeconds: Int?,
    val volumeKg: Int,
    val exercises: Int,
    val sets: Int,
    val averageHeartRateBpm: Int?,
    val xpGained: Int,
    val level: Int,
    val levelReached: Boolean,
)

data class RestDeadline(
    val deadlineElapsedMs: Long,
    val sourceRemainingSeconds: Int,
)

sealed interface WatchScreenState {
    data object Loading : WatchScreenState
    data class Empty(val message: String = "Aucune séance active") : WatchScreenState
    data class Ready(
        val payload: WatchPayload,
        val displayRestRemaining: Int,
        val syncLabel: String,
        val busyAction: String? = null,
        val pausedRestRemaining: Int? = null,
        val finishConfirm: Boolean = false,
        val error: String? = null,
    ) : WatchScreenState
}
