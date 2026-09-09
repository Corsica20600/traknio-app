package com.traknio.watch

/** Presentation only: never starts, finishes or changes a workout. */
internal data class WorkoutOngoingState(
    val sessionId: String,
    val status: String,
    val title: String,
    val exerciseName: String,
    val exerciseIndex: Int,
    val setIndex: Int,
    val totalSets: Int,
    val resting: Boolean,
    val paused: Boolean,
    val revision: Long,
) {
    val active: Boolean get() = sessionId.isNotBlank() && status in setOf("IN_PROGRESS", "READY_TO_COMPLETE")
    val text: String get() = when {
        status == "READY_TO_COMPLETE" -> "Séance à terminer"
        paused -> "Repos en pause"
        resting -> "Repos · $exerciseName"
        else -> "$exerciseName · série $setIndex" + if (totalSets > 0) "/$totalSets" else ""
    }

    fun receive(message: WorkoutStateMessage): WorkoutOngoingState {
        if (message.sessionId != sessionId) return this
        val incomingRevision = revisionMillis(message.revision)
        if (!message.optimistic && incomingRevision < revision) return this
        // A delayed optimistic event must not resurrect a finished notification.
        if (!active && message.optimistic) return this
        if (!active && incomingRevision <= revision && message.status in setOf("IN_PROGRESS", "READY_TO_COMPLETE")) return this
        return copy(
            status = message.status,
            exerciseName = if (message.exerciseIndex + 1 == exerciseIndex) exerciseName else "Exercice ${message.exerciseIndex + 1}",
            exerciseIndex = message.exerciseIndex + 1,
            totalSets = if (message.exerciseIndex + 1 == exerciseIndex) totalSets else 0,
            setIndex = message.setIndex,
            resting = message.restRemaining > 0,
            paused = message.restRemaining > 0 && message.restStatus == "PAUSED",
            revision = if (message.optimistic) revision else incomingRevision,
        )
    }

    companion object {
        fun from(payload: WatchPayload) = WorkoutOngoingState(
            payload.sessionId, payload.status, payload.workoutTitle, payload.exerciseName, payload.exerciseIndex,
            payload.setIndex, payload.totalSets, payload.restRemaining > 0,
            payload.restRemaining > 0 && payload.restStatus == "PAUSED", revisionMillis(payload.revision),
        )

        private fun revisionMillis(value: String): Long = runCatching {
            java.time.Instant.parse(value).toEpochMilli()
        }.getOrDefault(0L)
    }
}
