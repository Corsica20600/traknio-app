package com.traknio.app

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

class HealthConnectProvider(private val context: Context) {
    companion object {
        private const val TAG = "TRAKNIO_HEALTH_CONNECT"

        val permissions = setOf(
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
        )
    }

    fun isAvailable(): Boolean {
        return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    suspend fun missingPermissions(): Set<String> {
        if (!isAvailable()) return permissions
        return permissions - grantedPermissions()
    }

    suspend fun grantedPermissions(): Set<String> {
        if (!isAvailable()) return emptySet()
        return client().permissionController.getGrantedPermissions()
    }

    suspend fun readLatestMetrics(): HealthReadResult {
        if (!isAvailable()) {
            return HealthReadResult(
                records = emptyList(),
                usingMockFallback = false,
                message = "Health Connect indisponible sur ce telephone.",
            )
        }

        val end = Instant.now()
        val zone = ZoneId.systemDefault()
        val todayStart = LocalDate.now(zone).atStartOfDay(zone).toInstant()
        val dailyRange = TimeRangeFilter.between(todayStart, end)
        val sleepRange = TimeRangeFilter.between(end.minus(36, ChronoUnit.HOURS), end)
        val heartRateRange = TimeRangeFilter.between(end.minus(12, ChronoUnit.HOURS), end)
        val measuredAt = end.toString()
        val records = mutableListOf<SamsungMetricRecord>()
        val errors = mutableListOf<String>()

        runCatching { readAverageHeartRate(heartRateRange) }
            .onSuccess { value -> if (value > 0) records += SamsungMetricRecord("heart_rate", value, measuredAt, "Health Connect") }
            .onFailure { throwable ->
                Log.e(TAG, "Heart rate read failed", throwable)
                errors += "heart_rate"
            }

        runCatching { readSleepMinutes(sleepRange) }
            .onSuccess { value -> if (value > 0) records += SamsungMetricRecord("sleep_minutes", value, measuredAt, "Health Connect") }
            .onFailure { throwable ->
                Log.e(TAG, "Sleep read failed", throwable)
                errors += "sleep_minutes"
            }

        runCatching { readCalories(dailyRange) }
            .onSuccess { value -> if (value > 0) records += SamsungMetricRecord("calories", value, measuredAt, "Health Connect") }
            .onFailure { throwable ->
                Log.e(TAG, "Calories read failed", throwable)
                errors += "calories"
            }

        runCatching { readDistance(dailyRange) }
            .onSuccess { value -> if (value > 0) records += SamsungMetricRecord("distance_m", value, measuredAt, "Health Connect") }
            .onFailure { throwable ->
                Log.e(TAG, "Distance read failed", throwable)
                errors += "distance_m"
            }

        return HealthReadResult(
            records = records,
            usingMockFallback = false,
            message = if (records.isNotEmpty()) {
                "Donnees Health Connect lues (${records.size} mesures)."
            } else if (errors.isNotEmpty()) {
                "Health Connect lu, mais sans donnees exploitables (${errors.joinToString(", ")})."
            } else {
                "Aucune donnee Health Connect exploitable aujourd'hui."
            },
        )
    }

    private fun client() = HealthConnectClient.getOrCreate(context)

    private suspend fun readAverageHeartRate(timeRange: TimeRangeFilter): Double {
        val response = client().readRecords(
            ReadRecordsRequest(
                recordType = HeartRateRecord::class,
                timeRangeFilter = timeRange,
            ),
        )
        val samples = response.records.flatMap { it.samples }
        if (samples.isEmpty()) return 0.0
        return samples.map { it.beatsPerMinute.toDouble() }.average()
    }

    private suspend fun readCalories(timeRange: TimeRangeFilter): Double {
        val response = client().aggregate(
            AggregateRequest(
                metrics = setOf(TotalCaloriesBurnedRecord.ENERGY_TOTAL),
                timeRangeFilter = timeRange,
            ),
        )
        return response[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0
    }

    private suspend fun readSleepMinutes(timeRange: TimeRangeFilter): Double {
        val response = client().readRecords(
            ReadRecordsRequest(
                recordType = SleepSessionRecord::class,
                timeRangeFilter = timeRange,
            ),
        )
        return response.records.maxOfOrNull { record ->
            java.time.Duration.between(record.startTime, record.endTime).toMinutes().toDouble()
        }?.coerceAtMost(12 * 60.0) ?: 0.0
    }

    private suspend fun readDistance(timeRange: TimeRangeFilter): Double {
        val response = client().aggregate(
            AggregateRequest(
                metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                timeRangeFilter = timeRange,
            ),
        )
        return response[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
    }
}
