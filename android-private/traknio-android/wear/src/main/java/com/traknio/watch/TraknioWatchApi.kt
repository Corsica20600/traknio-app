package com.traknio.watch

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.io.IOException
import java.util.UUID

class TraknioWatchApi(
    private val baseUrl: String = BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/'),
    private val deviceTokenProvider: () -> String? = { null },
    private val phoneRelayClient: WatchPhoneRelayClient? = null,
) {
    suspend fun currentSession(sessionId: String? = null): WatchPayload = executeWithFallback(
        WatchRelayRequest(UUID.randomUUID().toString(), "current-session", sessionId),
    ) {
        requestPayload(
            path = if (sessionId.isNullOrBlank()) "/api/watch/current-session" else "/api/watch/current-session?sessionId=${sessionId.urlEncode()}",
            method = "GET",
            body = null,
            requestId = null,
        )
    }

    suspend fun validateSet(payload: WatchPayload): WatchPayload = postAction(
        operation = "validate-set",
        path = "/api/watch/validate-set",
        sessionId = payload.sessionId,
        extra = mapOf(
            "actualReps" to payload.targetReps,
            "weight" to payload.weight,
        ),
    )

    suspend fun skipRest(sessionId: String): WatchPayload = postAction("skip-rest", "/api/watch/skip-rest", sessionId)

    suspend fun addRest(sessionId: String, seconds: Int): WatchPayload = postAction(
        operation = "adjust-rest",
        path = "/api/watch/adjust-rest",
        sessionId = sessionId,
        extra = mapOf("deltaSeconds" to seconds),
    )

    suspend fun removeRest(sessionId: String, seconds: Int): WatchPayload = postAction(
        operation = "adjust-rest",
        path = "/api/watch/adjust-rest",
        sessionId = sessionId,
        extra = mapOf("deltaSeconds" to -seconds),
    )

    suspend fun nextExercise(sessionId: String): WatchPayload = postAction("next-exercise", "/api/watch/next-exercise", sessionId)

    suspend fun previousExercise(sessionId: String): WatchPayload = postAction("previous-exercise", "/api/watch/previous-exercise", sessionId)

    suspend fun completeSession(sessionId: String): WatchPayload = postAction("complete-session", "/api/watch/complete-session", sessionId)

    suspend fun completePairing(pairingToken: String, label: String): PairingResult = withContext(Dispatchers.IO) {
        Log.i(TAG, "pair complete called labelPresent=${label.isNotBlank()}")
        val body = JSONObject()
            .put("pairingToken", pairingToken)
            .put("label", label)

        val connection = (URL("$baseUrl/api/watch/pair/complete").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 8_000
            doOutput = true
            setRequestProperty("accept", "application/json")
            setRequestProperty("content-type", "application/json")
        }

        try {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body.toString())
            }

            val statusCode = connection.responseCode
            val raw = readBody(connection, statusCode)
            val json = JSONObject(raw.ifBlank { "{}" })
            Log.i(TAG, "pair complete backend response status=$statusCode ok=${statusCode in 200..299}")
            if (statusCode !in 200..299) {
                throw IllegalStateException(json.optString("error", "Appairage refusé"))
            }
            PairingResult(
                deviceToken = json.getString("deviceToken"),
                accountPairingId = json.getString("accountPairingId"),
            )
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun postAction(
        operation: String,
        path: String,
        sessionId: String,
        extra: Map<String, Any?> = emptyMap(),
    ): WatchPayload {
        val body = JSONObject()
            .put("sessionId", sessionId)
        for ((key, value) in extra) {
            body.put(key, value)
        }
        val request = WatchRelayRequest(
            requestId = UUID.randomUUID().toString(),
            operation = operation,
            sessionId = sessionId,
            actualReps = extra["actualReps"] as? Int,
            weight = extra["weight"] as? Double,
            deltaSeconds = extra["deltaSeconds"] as? Int,
        )
        return executeWithFallback(request) { requestPayload(path, "POST", body, request.requestId) }
    }

    private suspend fun executeWithFallback(request: WatchRelayRequest, direct: suspend () -> WatchPayload): WatchPayload {
        return try {
            direct()
        } catch (error: Throwable) {
            if (!isTransportFailure(error)) throw error
            Log.i(TAG, "direct transport failed; falling back operation=${request.operation} request=${request.requestId.takeLast(8)}")
            val relay = phoneRelayClient ?: throw error
            relay.relay(request)
        }
    }

    private suspend fun requestPayload(path: String, method: String, body: JSONObject?, requestId: String?): WatchPayload = withContext(Dispatchers.IO) {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("accept", "application/json")
            val deviceToken = deviceTokenProvider()?.trim().orEmpty()
            if (deviceToken.isNotBlank()) {
                setRequestProperty("x-watch-device-token", deviceToken)
            }
            if (!requestId.isNullOrBlank()) {
                setRequestProperty("x-traknio-action-id", requestId)
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("content-type", "application/json")
            }
        }

        try {
            if (body != null) {
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(body.toString())
                }
            }

            val statusCode = connection.responseCode
            val raw = readBody(connection, statusCode)
            val json = JSONObject(raw.ifBlank { "{}" })
            Log.i(TAG, "watch api response path=$path status=$statusCode ok=${statusCode in 200..299}")
            if (statusCode !in 200..299) {
                throw IllegalStateException(json.optString("error", "Erreur serveur"))
            }
            parsePayload(json.getJSONObject("payload"))
        } catch (error: IOException) {
            throw WatchTransportException(error)
        } finally {
            connection.disconnect()
        }
    }

    private fun isTransportFailure(error: Throwable): Boolean {
        val cause = generateSequence(error) { it.cause }.firstOrNull {
            it is WatchTransportException || it is UnknownHostException || it is ConnectException || it is SocketTimeoutException
        }
        return cause != null
    }

    private fun readBody(connection: HttpURLConnection, statusCode: Int): String {
        val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
        return stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
    }

    private fun parsePayload(json: JSONObject): WatchPayload {
        return WatchPayload(
            sessionId = json.getString("sessionId"),
            exerciseName = json.getString("exerciseName"),
            exerciseIndex = json.optInt("exerciseIndex", 1),
            totalExercises = json.optInt("totalExercises", 1),
            setIndex = json.optInt("setIndex", 1),
            totalSets = json.optInt("totalSets", 1),
            targetReps = json.optInt("targetReps", 10),
            weight = if (json.isNull("weight")) null else json.optDouble("weight"),
            restRemaining = json.optInt("restRemaining", 0),
            status = json.optString("status", "IN_PROGRESS"),
            summary = parseSummary(json.optJSONObject("summary")),
        )
    }

    private fun parseSummary(json: JSONObject?): WatchSessionSummary? {
        if (json == null) return null
        return WatchSessionSummary(
            durationSeconds = if (json.isNull("durationSeconds")) null else json.optInt("durationSeconds"),
            volumeKg = json.optInt("volumeKg", 0),
            sets = json.optInt("sets", 0),
            calories = if (json.isNull("calories")) null else json.optInt("calories"),
            xpGained = json.optInt("xpGained", 100),
            level = json.optInt("level", 1),
            levelReached = json.optBoolean("levelReached", false),
        )
    }
}

data class PairingResult(
    val deviceToken: String,
    val accountPairingId: String,
)

private const val TAG = "WATCH_PAIR"

private fun String.urlEncode(): String = java.net.URLEncoder.encode(this, Charsets.UTF_8.name())
