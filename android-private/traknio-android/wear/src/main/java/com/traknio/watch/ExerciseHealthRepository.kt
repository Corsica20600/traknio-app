package com.traknio.watch

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/** TEMPORARY? No: session metrics source backed directly by Wear OS Health Services. */
data class ExerciseHealthSnapshot(
    val sessionId: String? = null,
    val state: String = "IDLE",
    val heartRateCurrent: Int? = null,
    val heartRateSamples: Int = 0,
    val heartRateSum: Long = 0,
    val lastHeartRateSampleElapsedMs: Long = -1L,
    val sessionCaloriesKcal: Double? = null,
) {
    val averageHeartRateBpm: Int? get() = heartRateSamples.takeIf { it > 0 }?.let { (heartRateSum.toDouble() / it).toInt() }
}

class ExerciseHealthRepository(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("traknio_exercise_health", Context.MODE_PRIVATE)
    private val client = HealthServices.getClient(appContext).exerciseClient
    private val _snapshot = MutableStateFlow(read())
    val snapshot: StateFlow<ExerciseHealthSnapshot> = _snapshot.asStateFlow()
    private var callbackRegistered = false

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val before = _snapshot.value
            val freshHeartRates = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
                .filter { it.timeDurationFromBoot.toMillis() > before.lastHeartRateSampleElapsedMs }
                .mapNotNull { point -> point.value.takeIf { it.isFinite() && it > 0 }?.toInt() }
            val hr = freshHeartRates.lastOrNull()
            val calories = update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.total
                ?.takeIf { it.isFinite() && it >= 0 }
            val lastHeartRateSampleElapsedMs = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
                .maxOfOrNull { it.timeDurationFromBoot.toMillis() } ?: before.lastHeartRateSampleElapsedMs
            val next = before.copy(
                state = update.exerciseStateInfo.state.toString(),
                heartRateCurrent = hr ?: before.heartRateCurrent,
                heartRateSamples = before.heartRateSamples + freshHeartRates.size,
                heartRateSum = before.heartRateSum + freshHeartRates.sumOf { it.toLong() },
                lastHeartRateSampleElapsedMs = lastHeartRateSampleElapsedMs,
                sessionCaloriesKcal = calories ?: before.sessionCaloriesKcal,
            )
            save(next)
        }

        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) = Unit

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) = Unit
        override fun onRegistered() { callbackRegistered = true; debug("callback=registered") }
        override fun onRegistrationFailed(throwable: Throwable) { callbackRegistered = false; debug("callback=failed type=${throwable.javaClass.simpleName}") }
    }

    suspend fun start(sessionId: String) = withContext(Dispatchers.IO) {
        if (!hasRequiredPermissions()) {
            save(_snapshot.value.copy(sessionId = sessionId, state = "PERMISSION_MISSING"))
            debug("exerciseStart=session=$sessionId healthServicesStatus=permission_missing")
            return@withContext
        }
        val current = client.getCurrentExerciseInfoAsync().get()
        when (current.exerciseTrackedStatus.toString()) {
            "OTHER_APP_IN_PROGRESS" -> {
                save(ExerciseHealthSnapshot(sessionId = sessionId, state = "OTHER_APP_IN_PROGRESS"))
                debug("exerciseStart=session=$sessionId healthServicesStatus=other_app_in_progress")
                return@withContext
            }
            "OWNED_EXERCISE_IN_PROGRESS" -> {
                if (!callbackRegistered) client.setUpdateCallback(callback)
                save(_snapshot.value.copy(sessionId = sessionId, state = "ACTIVE"))
                debug("exerciseStart=session=$sessionId healthServicesStatus=owned_exercise_restored")
                return@withContext
            }
        }
        val capabilities = client.getCapabilitiesAsync().get()
        val exerciseType = when {
            ExerciseType.STRENGTH_TRAINING in capabilities.supportedExerciseTypes -> ExerciseType.STRENGTH_TRAINING
            ExerciseType.WORKOUT in capabilities.supportedExerciseTypes -> ExerciseType.WORKOUT
            else -> {
                save(ExerciseHealthSnapshot(sessionId = sessionId, state = "EXERCISE_TYPE_UNSUPPORTED"))
                debug("exerciseStart=session=$sessionId healthServicesStatus=exercise_type_unsupported")
                return@withContext
            }
        }
        val supported = capabilities.getExerciseTypeCapabilities(exerciseType).supportedDataTypes
        val dataTypes = setOf(DataType.HEART_RATE_BPM, DataType.CALORIES_TOTAL).filterTo(mutableSetOf()) { it in supported }
        debug("exerciseStart=$sessionId exerciseType=$exerciseType heartRateSupported=${DataType.HEART_RATE_BPM in supported} caloriesSupported=${DataType.CALORIES_TOTAL in supported}")
        if (dataTypes.isEmpty()) {
            save(ExerciseHealthSnapshot(sessionId = sessionId, state = "METRICS_UNSUPPORTED"))
            return@withContext
        }
        client.setUpdateCallback(callback)
        client.startExerciseAsync(ExerciseConfig(exerciseType, dataTypes, false, false)).get()
        save(ExerciseHealthSnapshot(sessionId = sessionId, state = "ACTIVE"))
    }

    suspend fun finish(sessionId: String): ExerciseHealthSnapshot = withContext(Dispatchers.IO) {
        val result = _snapshot.value.takeIf { it.sessionId == sessionId } ?: ExerciseHealthSnapshot(sessionId = sessionId)
        runCatching { client.endExerciseAsync().get() }
        if (callbackRegistered) runCatching { client.clearUpdateCallbackAsync(callback).get() }
        callbackRegistered = false
        debug("exerciseEnd=$sessionId heartRateSamples=${result.heartRateSamples} heartRateAverage=${result.averageHeartRateBpm} caloriesCurrent=${result.sessionCaloriesKcal} healthServicesStatus=${result.state}")
        return@withContext result
    }

    fun clear(sessionId: String) {
        if (_snapshot.value.sessionId == sessionId) save(ExerciseHealthSnapshot())
    }

    private fun hasRequiredPermissions(): Boolean = ExercisePermissions.hasRequiredPermissions(appContext)

    private fun read() = ExerciseHealthSnapshot(
        sessionId = prefs.getString("sessionId", null), state = prefs.getString("state", "IDLE") ?: "IDLE",
        heartRateCurrent = prefs.getInt("heartRateCurrent", -1).takeIf { it > 0 },
        heartRateSamples = prefs.getInt("heartRateSamples", 0), heartRateSum = prefs.getLong("heartRateSum", 0),
        lastHeartRateSampleElapsedMs = prefs.getLong("lastHeartRateSampleElapsedMs", -1L),
        sessionCaloriesKcal = prefs.getString("sessionCaloriesKcal", null)?.toDoubleOrNull(),
    )

    private fun save(value: ExerciseHealthSnapshot) {
        _snapshot.value = value
        prefs.edit().putString("sessionId", value.sessionId).putString("state", value.state)
            .putInt("heartRateCurrent", value.heartRateCurrent ?: -1).putInt("heartRateSamples", value.heartRateSamples)
            .putLong("heartRateSum", value.heartRateSum).putLong("lastHeartRateSampleElapsedMs", value.lastHeartRateSampleElapsedMs)
            .putString("sessionCaloriesKcal", value.sessionCaloriesKcal?.toString()).apply()
    }

    private fun debug(message: String) { if (BuildConfig.DEBUG) Log.i(TAG, message) }
    companion object { private const val TAG = "TraknioExerciseHealth" }
}
