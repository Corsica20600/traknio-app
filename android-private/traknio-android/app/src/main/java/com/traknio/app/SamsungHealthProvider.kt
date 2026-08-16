package com.traknio.app

import android.app.Activity
import android.content.Context
import android.util.Log
import kotlinx.coroutines.delay
import java.time.Instant
import java.util.concurrent.TimeUnit

interface SamsungHealthProvider {
    suspend fun ensurePermissions(activity: Activity): HealthPermissionState
    suspend fun readLatestMetrics(): HealthReadResult
}

class SamsungHealthProviderFactory(private val context: Context) {
    fun create(): SamsungHealthProvider {
        val sdkProvider = SamsungHealthProviderSdk(context)
        return if (sdkProvider.isSdkAvailable()) sdkProvider else SamsungHealthProviderUnavailable()
    }
}

/** Samsung Health is optional; unavailable SDKs must never yield synthetic health data. */
class SamsungHealthProviderUnavailable : SamsungHealthProvider {
    override suspend fun ensurePermissions(activity: Activity): HealthPermissionState {
        return HealthPermissionState(
            sdkAvailable = false,
            permissionsGranted = false,
            usingMockFallback = false,
            message = "SDK Samsung Health indisponible.",
        )
    }

    override suspend fun readLatestMetrics(): HealthReadResult {
        return HealthReadResult(
            records = emptyList(),
            usingMockFallback = false,
            message = "SDK Samsung Health indisponible.",
        )
    }
}

private class SamsungHealthProviderSdk(private val context: Context) : SamsungHealthProvider {
    companion object {
        private const val TAG = "TRAKNIO_HEALTH"
        private const val LAST_24_HOURS_SECONDS = 60L * 60L * 24L
        private const val STEPS_DATA_TYPE_ID = "com.samsung.health.step_count"
        private const val HEART_RATE_DATA_TYPE_ID = "com.samsung.health.heart_rate"
    }

    private val sdkRoot = "com.samsung.android.sdk.health.data"
    private val dataTypeRoot = "$sdkRoot.request"
    private val permissionRoot = "$sdkRoot.permission"
    private val dataRoot = "$sdkRoot.data"
    private var storeCache: Any? = null

    override suspend fun ensurePermissions(activity: Activity): HealthPermissionState {
        if (!isSdkAvailable()) {
            return HealthPermissionState(
                sdkAvailable = false,
                permissionsGranted = false,
                usingMockFallback = false,
                message = "AAR Samsung Health Data SDK absente ou incompatible.",
            )
        }

        return try {
            if (!isSamsungHealthInstalled()) {
                return HealthPermissionState(
                    sdkAvailable = true,
                    permissionsGranted = false,
                    usingMockFallback = false,
                    message = "Samsung Health n'est pas installe.",
                )
            }

            val store = getConnectedStoreOrNull()
                ?: return HealthPermissionState(
                    sdkAvailable = true,
                    permissionsGranted = false,
                    usingMockFallback = false,
                    message = "Samsung Health connection failed.",
                )

            val permissions = buildPermissions()
            val allGrantedNow = getGrantedPermissions(store, permissions)
            if (allGrantedNow) {
                return HealthPermissionState(
                    sdkAvailable = true,
                    permissionsGranted = true,
                    usingMockFallback = false,
                    message = "Permissions Samsung Health accordees.",
                )
            }

            val requested = requestPermissions(store, permissions, activity)
            HealthPermissionState(
                sdkAvailable = true,
                permissionsGranted = requested,
                usingMockFallback = false,
                message = if (requested) "Permissions Samsung Health accordees." else "Permissions Samsung Health refusees.",
            )
        } catch (e: Exception) {
            Log.e(TAG, "ensurePermissions failed", e)
            HealthPermissionState(
                sdkAvailable = true,
                permissionsGranted = false,
                usingMockFallback = false,
                message = "Samsung Health permission error: ${e.message ?: e.javaClass.simpleName}",
            )
        }
    }

    override suspend fun readLatestMetrics(): HealthReadResult {
        if (!isSdkAvailable()) {
            return SamsungHealthProviderUnavailable().readLatestMetrics()
        }
        if (!isSamsungHealthInstalled()) {
            return HealthReadResult(
                records = emptyList(),
                usingMockFallback = false,
                message = "Samsung Health n'est pas installe.",
            )
        }

        val now = Instant.now().toString()
        val records = mutableListOf<SamsungMetricRecord>()
        val errors = mutableListOf<String>()

        runCatching { tryReadLatestStepCount() }
            .onSuccess { it?.let { value -> records += SamsungMetricRecord("steps", value, now, "Samsung Health") } }
            .onFailure { throwable ->
                Log.e(TAG, "Steps query failed", throwable)
                errors += "steps: ${throwable.message ?: throwable.javaClass.simpleName}"
            }

        runCatching { tryReadLatestHeartRate() }
            .onSuccess { it?.let { value -> records += SamsungMetricRecord("heart_rate", value, now, "Samsung Health") } }
            .onFailure { throwable ->
                Log.e(TAG, "Heart rate query failed", throwable)
                errors += "heart_rate: ${throwable.message ?: throwable.javaClass.simpleName}"
            }

        return if (records.isNotEmpty()) {
            HealthReadResult(
                records = records,
                usingMockFallback = false,
                message = "Donnees Samsung Health lues (${records.size} mesures).",
            )
        } else if (errors.isNotEmpty()) {
            HealthReadResult(
                records = emptyList(),
                usingMockFallback = false,
                message = "Samsung Health query failed: ${errors.joinToString("; ")}",
            )
        } else {
            HealthReadResult(
                records = emptyList(),
                usingMockFallback = false,
                message = "No data available",
            )
        }
    }

    fun isSdkAvailable(): Boolean {
        return runCatching { Class.forName("$sdkRoot.HealthDataService") }.isSuccess &&
            runCatching { Class.forName("$sdkRoot.HealthDataStore") }.isSuccess &&
            runCatching { Class.forName("$permissionRoot.Permission") }.isSuccess
    }

    private fun isSamsungHealthInstalled(): Boolean {
        return try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo("com.sec.android.app.shealth", 0)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun getStoreOrNull(): Any? {
        storeCache?.let { return it }
        val serviceClass = Class.forName("$sdkRoot.HealthDataService")
        val getStore = serviceClass.getMethod("getStore", Context::class.java)
        return getStore.invoke(null, context.applicationContext)?.also { storeCache = it }
    }

    private suspend fun getConnectedStoreOrNull(): Any? {
        val store = getStoreOrNull() ?: return null
        if (waitForConnection(store)) return store
        return null
    }

    private suspend fun waitForConnection(store: Any): Boolean {
        val storeClass = Class.forName("$sdkRoot.HealthDataStore")
        val method = storeClass.getMethod("getGrantedPermissionsAsync", Set::class.java)
        repeat(8) { attempt ->
            val isConnected = runCatching {
                val async = method.invoke(store, emptySet<Any>())
                asyncGet(async)
                true
            }.getOrElse { throwable ->
                Log.e(TAG, "Waiting for Samsung Health connection failed (attempt ${attempt + 1})", throwable)
                false
            }
            if (isConnected) {
                return true
            }
            delay(250)
        }
        Log.e(TAG, "Samsung Health connection not ready after retries")
        return false
    }

    private fun buildPermissions(): Set<Any> {
        val permissionClass = Class.forName("$permissionRoot.Permission")
        val accessTypeClass = Class.forName("$permissionRoot.AccessType")
        val read = java.lang.Enum.valueOf(accessTypeClass as Class<out Enum<*>>, "READ")
        val ofMethod = permissionClass.getMethod("of", Class.forName("$dataTypeRoot.DataType"), accessTypeClass)

        val steps = resolveDataTypeFromId(STEPS_DATA_TYPE_ID)
        val hr = resolveDataTypeFromId(HEART_RATE_DATA_TYPE_ID)

        return linkedSetOf(
            ofMethod.invoke(null, steps, read)!!,
            ofMethod.invoke(null, hr, read)!!,
        )
    }

    private fun getGrantedPermissions(store: Any, requested: Set<Any>): Boolean {
        val storeClass = Class.forName("$sdkRoot.HealthDataStore")
        val async = storeClass.getMethod("getGrantedPermissionsAsync", Set::class.java).invoke(store, requested)
        val grantedSet = asyncGet(async) as? Set<*> ?: emptySet<Any>()
        return grantedSet.containsAll(requested)
    }

    private fun requestPermissions(store: Any, permissions: Set<Any>, activity: Activity): Boolean {
        val storeClass = Class.forName("$sdkRoot.HealthDataStore")
        val async = storeClass.getMethod("requestPermissionsAsync", Set::class.java, Activity::class.java)
            .invoke(store, permissions, activity)
        val grantedSet = asyncGet(async) as? Set<*> ?: emptySet<Any>()
        return grantedSet.containsAll(permissions)
    }

    private fun asyncGet(asyncFuture: Any): Any? {
        return asyncFuture.javaClass.getMethod("get", Long::class.javaPrimitiveType, TimeUnit::class.java)
            .invoke(asyncFuture, 10L, TimeUnit.SECONDS)
    }

    private suspend fun tryReadLatestStepCount(): Double? {
        val stepsType = resolveDataTypeFromId(STEPS_DATA_TYPE_ID)
        if (stepsType.javaClass.getMethod("getName").invoke(stepsType)?.toString().isNullOrBlank()) {
            Log.e(TAG, "Invalid Samsung steps data type: $STEPS_DATA_TYPE_ID")
            return null
        }
        val stepsTypeClass = Class.forName("$dataTypeRoot.DataType\$StepsType")
        val totalOperation = stepsTypeClass.getField("TOTAL").get(null)
        return queryLatestAggregate(totalOperation)?.toDouble()
    }

    private suspend fun tryReadLatestHeartRate(): Double? {
        val item = queryLatestDataPoint(HEART_RATE_DATA_TYPE_ID) ?: return null
        val hrTypeClass = Class.forName("$dataTypeRoot.DataType\$HeartRateType")
        val hrField = hrTypeClass.getField("HEART_RATE").get(null)
        val getValue = item.javaClass.getMethod("getValue", Class.forName("$dataRoot.Field"))
        val value = getValue.invoke(item, hrField) as? Number ?: return null
        return value.toDouble()
    }

    private suspend fun queryLatestAggregate(operation: Any): Number? {
        val store = getConnectedStoreOrNull() ?: return null
        val getBuilder = operation.javaClass.getMethod("getRequestBuilder")
        val builder = getBuilder.invoke(operation) ?: return null
        applyTimeFilterAndOrdering(builder)
        val request = builder.javaClass.getMethod("build").invoke(builder)
        val storeClass = Class.forName("$sdkRoot.HealthDataStore")
        val async = storeClass.getMethod("aggregateDataAsync", Class.forName("$dataTypeRoot.AggregateRequest"))
            .invoke(store, request)
        val response = asyncGet(async) ?: return null
        val dataList = response.javaClass.getMethod("getDataList").invoke(response) as? List<*> ?: return null
        val first = dataList.firstOrNull() ?: return null
        val value = first.javaClass.getMethod("getValue").invoke(first) ?: return null
        return value as? Number
    }

    private suspend fun queryLatestDataPoint(dataTypeId: String): Any? {
        val store = getConnectedStoreOrNull() ?: return null
        val dataType = resolveDataTypeFromId(dataTypeId)
        val readBuilder = dataType.javaClass.getMethod("getReadDataRequestBuilder").invoke(dataType) ?: return null
        applyTimeFilterAndOrdering(readBuilder)
        val request = readBuilder.javaClass.getMethod("build").invoke(readBuilder)

        val storeClass = Class.forName("$sdkRoot.HealthDataStore")
        val async = storeClass.getMethod("readDataAsync", Class.forName("$dataTypeRoot.ReadDataRequest"))
            .invoke(store, request)
        val response = asyncGet(async) ?: return null
        val dataList = response.javaClass.getMethod("getDataList").invoke(response) as? List<*> ?: return null
        return dataList.firstOrNull()
    }

    private fun resolveDataTypeFromId(dataTypeId: String): Any {
        val dataTypesClass = Class.forName("$dataTypeRoot.DataTypes")
        val fieldName = when (dataTypeId) {
            STEPS_DATA_TYPE_ID -> "STEPS"
            HEART_RATE_DATA_TYPE_ID -> "HEART_RATE"
            else -> throw IllegalArgumentException("Unsupported Samsung Health data type id: $dataTypeId")
        }
        val dataType = dataTypesClass.getField(fieldName).get(null)
            ?: throw IllegalStateException("DataType field not found for $dataTypeId")
        return dataType
    }

    private fun applyTimeFilterAndOrdering(builder: Any) {
        runCatching {
            val orderingClass = Class.forName("$dataTypeRoot.Ordering")
            val desc = java.lang.Enum.valueOf(orderingClass as Class<out Enum<*>>, "DESC")
            builder.javaClass.getMethod("setOrdering", orderingClass).invoke(builder, desc)
        }
        runCatching {
            builder.javaClass.getMethod("setLimit", Int::class.javaPrimitiveType).invoke(builder, 1)
        }
        runCatching {
            val instantFilterClass = Class.forName("$dataTypeRoot.InstantTimeFilter")
            val sinceMethod = instantFilterClass.getMethod("since", Instant::class.java)
            val filter = sinceMethod.invoke(null, Instant.now().minusSeconds(LAST_24_HOURS_SECONDS))
            builder.javaClass.getMethod("setInstantTimeFilter", instantFilterClass).invoke(builder, filter)
        }
        runCatching {
            val localFilterClass = Class.forName("$dataTypeRoot.LocalTimeFilter")
            val sinceMethod = localFilterClass.getMethod("since", java.time.LocalDateTime::class.java)
            val filter = sinceMethod.invoke(null, java.time.LocalDateTime.now().minusHours(24))
            builder.javaClass.getMethod("setLocalTimeFilter", localFilterClass).invoke(builder, filter)
        }
    }
}
