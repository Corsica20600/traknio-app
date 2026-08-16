package com.traknio.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ExerciseHealthSnapshotTest {
    @Test fun `average is calculated only from valid collected samples`() {
        val snapshot = ExerciseHealthSnapshot(heartRateSamples = 3, heartRateSum = 303)
        assertEquals(101, snapshot.averageHeartRateBpm)
    }

    @Test fun `absence of samples keeps average absent`() {
        assertNull(ExerciseHealthSnapshot().averageHeartRateBpm)
    }
}
