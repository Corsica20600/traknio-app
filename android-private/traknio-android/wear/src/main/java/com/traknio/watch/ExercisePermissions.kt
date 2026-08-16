package com.traknio.watch

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Runtime permissions required by the metrics requested from Health Services.
 *
 * Heart rate is guarded by BODY_SENSORS on Wear OS 5.1/API 35 and lower, while
 * CALORIES_TOTAL requires ACTIVITY_RECOGNITION.  Keeping this check in one place
 * also makes it the gate for the health foreground service.
 */
object ExercisePermissions {
    fun requiredRuntimePermissions(sdkInt: Int = Build.VERSION.SDK_INT): List<String> = buildList {
        // The Wear OS 6 granular health permission is deliberately kept here so this
        // gate remains correct when the module moves to targetSdk 36.
        if (sdkInt >= 36) {
            add("android.permission.health.READ_HEART_RATE")
        } else {
            add(android.Manifest.permission.BODY_SENSORS)
        }
        add(android.Manifest.permission.ACTIVITY_RECOGNITION)
    }

    fun hasRequiredPermissions(context: Context): Boolean =
        requiredRuntimePermissions().all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
}
