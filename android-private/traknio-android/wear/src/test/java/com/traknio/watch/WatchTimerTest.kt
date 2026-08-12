package com.traknio.watch

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchTimerTest {
    @Test
    fun `a newer shared rest snapshot is accepted`() {
        assertTrue(
            isRestSnapshotAtLeastAsRecent(
                "2026-08-12T10:00:00Z",
                "2026-08-12T10:00:01Z",
            ),
        )
    }

    @Test
    fun `an older shared rest snapshot cannot overwrite a newer local state`() {
        assertFalse(
            isRestSnapshotAtLeastAsRecent(
                "2026-08-12T10:00:01Z",
                "2026-08-12T10:00:00Z",
            ),
        )
    }
}
