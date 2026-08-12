package com.traknio.app

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

data class PhoneWatchRelayRequest(
    val requestId: String,
    val operation: String,
    val sessionId: String?,
    val actualReps: Int?,
    val weight: Double?,
    val deltaSeconds: Int?,
    val sourceNodeId: String,
    val createdAtMs: Long,
) {
    fun toJson(): String = JSONObject()
        .put("requestId", requestId)
        .put("operation", operation)
        .put("sessionId", sessionId)
        .put("actualReps", actualReps)
        .put("weight", weight)
        .put("deltaSeconds", deltaSeconds)
        .put("sourceNodeId", sourceNodeId)
        .put("createdAtMs", createdAtMs)
        .toString()

    companion object {
        fun fromJson(raw: String): PhoneWatchRelayRequest? = runCatching {
            val json = JSONObject(raw)
            PhoneWatchRelayRequest(
                requestId = json.getString("requestId"),
                operation = json.getString("operation"),
                sessionId = json.optString("sessionId").takeIf { it.isNotBlank() },
                actualReps = if (json.isNull("actualReps")) null else json.optInt("actualReps"),
                weight = if (json.isNull("weight")) null else json.optDouble("weight"),
                deltaSeconds = if (json.isNull("deltaSeconds")) null else json.optInt("deltaSeconds"),
                sourceNodeId = json.optString("sourceNodeId"),
                createdAtMs = json.optLong("createdAtMs", System.currentTimeMillis()),
            )
        }.getOrNull()
    }
}

object PhoneWatchRelayQueue {
    private const val PREFS = "traknio_watch_relay_queue"
    private const val KEY_PENDING = "pending"
    private const val EXPIRY_MS = 15 * 60 * 1000L
    private const val TAG = "WATCH_RELAY"

    fun enqueue(context: Context, request: PhoneWatchRelayRequest) {
        val pending = read(context).toMutableMap()
        pending[request.requestId] = request.toJson()
        write(context, pending)
    }

    fun remove(context: Context, requestId: String) {
        val pending = read(context).toMutableMap()
        if (pending.remove(requestId) != null) write(context, pending)
    }

    fun all(context: Context): List<PhoneWatchRelayRequest> = read(context).values.mapNotNull(PhoneWatchRelayRequest::fromJson)

    fun isExpired(request: PhoneWatchRelayRequest) = System.currentTimeMillis() - request.createdAtMs > EXPIRY_MS

    fun shouldPersist(request: PhoneWatchRelayRequest) = request.operation != "current-session"

    private fun read(context: Context): Map<String, String> {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PENDING, null).orEmpty()
        return runCatching {
            val json = JSONObject(raw)
            json.keys().asSequence().associateWith { json.getString(it) }
        }.getOrDefault(emptyMap())
    }

    private fun write(context: Context, entries: Map<String, String>) {
        val json = JSONObject()
        entries.forEach { (id, payload) -> json.put(id, payload) }
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PENDING, json.toString()).apply()
    }

    fun schedule(context: Context) {
        val request = OneTimeWorkRequestBuilder<PhoneWatchRelayWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            "traknio_watch_relay_queue",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun log(message: String) = Log.i(TAG, message)
}

class PhoneWatchRelayWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val pending = PhoneWatchRelayQueue.all(applicationContext)
        if (pending.isEmpty()) return Result.success()
        var shouldRetry = false
        for (request in pending) {
            if (PhoneWatchRelayQueue.isExpired(request)) {
                val delivered = PhoneWatchRelayClient(applicationContext).respond(
                    request,
                    state = "FAILED",
                    httpStatus = null,
                    payload = null,
                    error = "Délai de synchronisation dépassé",
                )
                if (delivered) PhoneWatchRelayQueue.remove(applicationContext, request.requestId) else shouldRetry = true
                continue
            }
            when (val outcome = PhoneWatchRelayClient(applicationContext).execute(request)) {
                is RelayExecution.Completed -> {
                    val delivered = PhoneWatchRelayClient(applicationContext)
                        .respond(request, "COMPLETED", outcome.status, outcome.payload, null)
                    if (delivered) PhoneWatchRelayQueue.remove(applicationContext, request.requestId) else shouldRetry = true
                }
                is RelayExecution.FinalFailure -> {
                    val delivered = PhoneWatchRelayClient(applicationContext)
                        .respond(request, "FAILED", outcome.status, null, outcome.error)
                    if (delivered) PhoneWatchRelayQueue.remove(applicationContext, request.requestId) else shouldRetry = true
                }
                RelayExecution.Retry -> shouldRetry = true
            }
        }
        return if (shouldRetry) Result.retry() else Result.success()
    }
}

sealed interface RelayExecution {
    data class Completed(val status: Int, val payload: JSONObject) : RelayExecution
    data class FinalFailure(val status: Int, val error: String) : RelayExecution
    data object Retry : RelayExecution
}

class PhoneWatchRelayClient(private val context: Context) {
    private val baseUrl = BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/')

    suspend fun execute(request: PhoneWatchRelayRequest): RelayExecution {
        val cookies = CookieManager.getInstance().getCookie(baseUrl).orEmpty()
        if (cookies.isBlank()) return RelayExecution.FinalFailure(401, "Connecte-toi sur le téléphone")
        val endpoint = when (request.operation) {
            "current-session" -> "/api/watch/current-session" + request.sessionId?.let { "?sessionId=${java.net.URLEncoder.encode(it, Charsets.UTF_8.name())}" }.orEmpty()
            "validate-set" -> "/api/watch/validate-set"
            "skip-rest" -> "/api/watch/skip-rest"
            "adjust-rest" -> "/api/watch/adjust-rest"
            "pause-rest" -> "/api/watch/pause-rest"
            "resume-rest" -> "/api/watch/resume-rest"
            "next-exercise" -> "/api/watch/next-exercise"
            "previous-exercise" -> "/api/watch/previous-exercise"
            "complete-session" -> "/api/watch/complete-session"
            else -> return RelayExecution.FinalFailure(400, "Action montre inconnue")
        }
        return try {
            val connection = (URL("$baseUrl$endpoint").openConnection() as HttpURLConnection).apply {
                requestMethod = if (request.operation == "current-session") "GET" else "POST"
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("accept", "application/json")
                setRequestProperty("cookie", cookies)
                setRequestProperty("x-traknio-action-id", request.requestId)
                if (request.operation != "current-session") {
                    doOutput = true
                    setRequestProperty("content-type", "application/json")
                }
            }
            if (request.operation != "current-session") {
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(JSONObject()
                        .put("sessionId", request.sessionId)
                        .put("actualReps", request.actualReps)
                        .put("weight", request.weight)
                        .put("deltaSeconds", request.deltaSeconds)
                        .toString())
                }
            }
            val status = connection.responseCode
            val raw = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val json = JSONObject(raw.ifBlank { "{}" })
            when {
                status == 202 -> RelayExecution.Retry
                status in 200..299 -> RelayExecution.Completed(status, json.getJSONObject("payload"))
                status >= 500 -> RelayExecution.Retry
                else -> RelayExecution.FinalFailure(status, json.optString("error", "Synchronisation refusée"))
            }
        } catch (error: Throwable) {
            Log.w("WATCH_RELAY", "phone relay network failure operation=${request.operation} request=${request.requestId.takeLast(8)} type=${error.javaClass.simpleName}")
            RelayExecution.Retry
        }
    }

    suspend fun sendStatus(request: PhoneWatchRelayRequest, state: String) {
        val json = JSONObject()
            .put("requestId", request.requestId)
            .put("state", state)
        runCatching {
            Wearable.getMessageClient(context)
                .sendMessage(request.sourceNodeId, WearPairingPaths.API_STATUS, json.toString().toByteArray())
                .await()
        }
    }

    suspend fun respond(
        request: PhoneWatchRelayRequest,
        state: String,
        httpStatus: Int?,
        payload: JSONObject?,
        error: String?,
    ): Boolean {
        val json = JSONObject()
            .put("requestId", request.requestId)
            .put("state", state)
            .put("httpStatus", httpStatus)
            .put("payload", payload)
            .put("error", error)
        val bytes = json.toString().toByteArray()
        // DataItem retains the final outcome until the watch reconnects; payloads are small WatchPayload JSON.
        val put = PutDataMapRequest.create("${WearPairingPaths.API_RESPONSE}/${request.requestId}").apply {
            dataMap.putString("responseJson", json.toString())
            setUrgent()
        }.asPutDataRequest()
        runCatching {
            Wearable.getMessageClient(context).sendMessage(request.sourceNodeId, WearPairingPaths.API_RESPONSE, bytes).await()
        }
        return runCatching {
            Wearable.getDataClient(context).putDataItem(put).await()
            Log.i("WATCH_RELAY", "response state=$state request=${request.requestId.takeLast(8)}")
            true
        }.getOrElse { throwable ->
            Log.w("WATCH_RELAY", "response delivery deferred state=$state request=${request.requestId.takeLast(8)} type=${throwable.javaClass.simpleName}")
            false
        }
    }
}
