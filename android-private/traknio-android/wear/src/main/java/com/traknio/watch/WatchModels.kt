package com.traknio.watch

data class WatchPayload(
    val sessionId: String,
    val exerciseName: String,
    val exerciseIndex: Int,
    val totalExercises: Int,
    val setIndex: Int,
    val totalSets: Int,
    val targetReps: Int,
    val weight: Double?,
    val restRemaining: Int,
    val restStatus: String,
    val restUpdatedAt: String?,
    val status: String,
    val summary: WatchSessionSummary? = null,
)

data class WatchSessionSummary(
    val durationSeconds: Int?,
    val volumeKg: Int,
    val sets: Int,
    val calories: Int?,
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
