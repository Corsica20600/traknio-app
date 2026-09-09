package com.traknio.watch

import org.junit.Assert.*
import org.junit.Test

class WorkoutOngoingStateTest {
    private val active = WorkoutOngoingState(
        "session-a", "IN_PROGRESS", "Push", "Développé couché", 1, 2, 4,
        resting = false, paused = false, revision = 2_000,
    )

    private fun message(
        status: String = "IN_PROGRESS",
        revision: String = "1970-01-01T00:00:03Z",
        sessionId: String = "session-a",
        optimistic: Boolean = false,
        restRemaining: Int = 0,
        restStatus: String = "IDLE",
        exerciseIndex: Int = 0,
    ) = WorkoutStateMessage(sessionId, revision, optimistic = optimistic, status = status,
        exerciseIndex = exerciseIndex, setIndex = 3, targetReps = null, weight = null,
        restRemaining = restRemaining, restStatus = restStatus, restUpdatedAt = null)

    @Test fun `only actual sessions and awaiting completion remain ongoing`() {
        assertTrue(active.active)
        assertTrue(active.copy(status = "READY_TO_COMPLETE").active)
        for (status in listOf("COMPLETED", "CANCELLED", "IDLE", "", "UNKNOWN")) {
            assertFalse(active.copy(status = status).active)
        }
        assertFalse(active.copy(sessionId = "").active)
    }

    @Test fun `set progress updates without a new session`() {
        val next = active.receive(message())
        assertEquals("Développé couché · série 3/4", next.text)
        assertEquals(active.sessionId, next.sessionId)
    }

    @Test fun `rest and paused rest remain ongoing with relevant statuses`() {
        val rest = active.receive(message(restRemaining = 30, restStatus = "ACTIVE"))
        assertTrue(rest.active)
        assertTrue(rest.text.startsWith("Repos ·"))
        val paused = active.receive(message(restRemaining = 30, restStatus = "PAUSED"))
        assertTrue(paused.active)
        assertEquals("Repos en pause", paused.text)
    }

    @Test fun `finish and cancellation remove the ongoing state`() {
        assertFalse(active.receive(message(status = "COMPLETED")).active)
        assertFalse(active.receive(message(status = "CANCELLED")).active)
    }

    @Test fun `optimistic finish hides the indication immediately`() {
        assertFalse(active.receive(message(status = "COMPLETED", optimistic = true)).active)
    }

    @Test fun `stale and other session messages cannot affect current notification`() {
        assertEquals(active, active.receive(message(revision = "1970-01-01T00:00:01Z", status = "COMPLETED")))
        assertEquals(active, active.receive(message(sessionId = "other", status = "COMPLETED")))
    }

    @Test fun `late optimistic activity cannot resurrect completed session`() {
        val completed = active.receive(message(status = "COMPLETED"))
        assertEquals(completed, completed.receive(message(optimistic = true)))
    }

    @Test fun `equal revision active message cannot resurrect confirmed finish`() {
        val completed = active.receive(message(status = "COMPLETED"))
        assertEquals(completed, completed.receive(message()))
    }

    @Test fun `authoritative rollback can restore a failed optimistic finish`() {
        val optimisticFinish = active.receive(message(status = "COMPLETED", optimistic = true))
        assertTrue(optimisticFinish.receive(message()).active)
    }

    @Test fun `remote exercise change never reuses the old exercise name or set count`() {
        assertEquals("Exercice 2 · série 3", active.receive(message(exerciseIndex = 1)).text)
    }

    @Test fun `ready to complete preserves indication until explicit finish`() {
        val ready = active.receive(message(status = "READY_TO_COMPLETE"))
        assertTrue(ready.active)
        assertEquals("Séance à terminer", ready.text)
    }
}
