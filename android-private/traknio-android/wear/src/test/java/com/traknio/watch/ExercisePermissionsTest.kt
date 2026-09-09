package com.traknio.watch

import org.junit.Assert.assertEquals
import org.junit.Test

class ExercisePermissionsTest {
    @Test
    fun `api 35 requires body sensors and activity recognition`() {
        assertEquals(
            listOf(
                android.Manifest.permission.BODY_SENSORS,
                android.Manifest.permission.ACTIVITY_RECOGNITION,
            ),
            ExercisePermissions.requiredRuntimePermissions(35),
        )
    }

    @Test
    fun `target 35 on api 36 retains the legacy sensor permission`() {
        assertEquals(
            listOf(android.Manifest.permission.BODY_SENSORS, android.Manifest.permission.ACTIVITY_RECOGNITION),
            ExercisePermissions.requiredRuntimePermissions(36),
        )
    }

    @Test
    fun `future target 36 uses granular heart rate permission`() {
        assertEquals(
            listOf(
                "android.permission.health.READ_HEART_RATE",
                android.Manifest.permission.ACTIVITY_RECOGNITION,
            ),
            ExercisePermissions.requiredRuntimePermissions(36, targetSdkInt = 36),
        )
    }
}
