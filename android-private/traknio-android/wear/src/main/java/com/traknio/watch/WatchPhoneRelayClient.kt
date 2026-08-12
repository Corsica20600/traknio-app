package com.traknio.watch

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class WatchPhoneRelayClient(context: Context) {
    private val appContext = context.applicationContext
    private val awaitingResponses = ConcurrentHashMap<String, CompletableDeferred<PhoneRelayResult>>()

    private val listener = object : MessageClient.OnMessageReceivedListener {
        override fun onMessageReceived(event: MessageEvent) {
            if (event.path != WearPairingPaths.API_RESPONSE && event.path != WearPairingPaths.API_STATUS) return
            val result = PhoneRelayResult.fromJson(event.data) ?: return
            Log.i(TAG, "relay message received request=${result.requestId.takeLast(8)} state=${result.state}")
            if (result.isTerminal()) {
                awaitingResponses.remove(result.requestId)?.complete(result)
            }
            WatchRelayEvents.emit(result)
        }
    }

    private val dataListener = DataClient.OnDataChangedListener { events: DataEventBuffer ->
        events.forEach { event ->
            if (event.type != com.google.android.gms.wearable.DataEvent.TYPE_CHANGED || !event.dataItem.uri.path.orEmpty().startsWith("${WearPairingPaths.API_RESPONSE}/")) return@forEach
            val result = runCatching {
                PhoneRelayResult.fromJson(DataMapItem.fromDataItem(event.dataItem).dataMap.getString("responseJson").orEmpty().toByteArray())
            }.getOrNull() ?: return@forEach
            if (result.isTerminal()) {
                awaitingResponses.remove(result.requestId)?.complete(result)
            }
            WatchRelayEvents.emit(result)
        }
    }

    init {
        Wearable.getMessageClient(appContext).addListener(listener)
        Wearable.getDataClient(appContext).addListener(dataListener)
    }

    suspend fun relay(request: WatchRelayRequest): WatchPayload = withContext(Dispatchers.IO) {
        val nodes = Wearable.getNodeClient(appContext).connectedNodes.await()
        Log.i(TAG, "relay nodes=${nodes.size} request=${request.requestId.takeLast(8)} operation=${request.operation}")
        if (nodes.isEmpty()) throw WatchPhoneUnavailableException()

        val response = CompletableDeferred<PhoneRelayResult>()
        awaitingResponses[request.requestId] = response
        try {
            WatchRelayEvents.emit(PhoneRelayResult(request.requestId, "SENDING", null, null, null))
            Wearable.getMessageClient(appContext)
                .sendMessage(nodes.first().id, WearPairingPaths.API_REQUEST, request.toJson().toByteArray())
                .await()
            Log.i(TAG, "relay request sent request=${request.requestId.takeLast(8)}")
            WatchRelayEvents.emit(PhoneRelayResult(request.requestId, "WAITING_PHONE", null, null, null))

            when (val result = withTimeout(INITIAL_RESPONSE_TIMEOUT_MS) { response.await() }) {
                else -> result.toPayloadOrThrow()
            }
        } catch (_: TimeoutCancellationException) {
            throw WatchPhoneUnavailableException("Le téléphone ne répond pas")
        } finally {
            awaitingResponses.remove(request.requestId)
        }
    }

    fun close() {
        Wearable.getMessageClient(appContext).removeListener(listener)
        Wearable.getDataClient(appContext).removeListener(dataListener)
    }

    companion object {
        private const val TAG = "WATCH_RELAY"
        private const val INITIAL_RESPONSE_TIMEOUT_MS = 12_000L
    }
}

data class WatchRelayRequest(
    val requestId: String,
    val operation: String,
    val sessionId: String?,
    val actualReps: Int? = null,
    val weight: Double? = null,
    val deltaSeconds: Int? = null,
) {
    fun toJson(): String = JSONObject()
        .put("requestId", requestId)
        .put("operation", operation)
        .put("sessionId", sessionId)
        .put("actualReps", actualReps)
        .put("weight", weight)
        .put("deltaSeconds", deltaSeconds)
        .toString()
}

data class PhoneRelayResult(
    val requestId: String,
    val state: String,
    val httpStatus: Int?,
    val payload: JSONObject?,
    val error: String?,
) {
    fun isTerminal() = state == "COMPLETED" || state == "QUEUED" || state == "FAILED"

    fun toPayloadOrThrow(): WatchPayload {
        when (state) {
            "COMPLETED" -> return payload?.let(WatchPayloadJson::parse)
                ?: throw IllegalStateException("Réponse téléphone invalide")
            "QUEUED" -> throw WatchRelayQueuedException()
            else -> throw IllegalStateException(error ?: "Synchronisation téléphone impossible")
        }
    }

    companion object {
        fun fromJson(raw: ByteArray): PhoneRelayResult? = runCatching {
            val json = JSONObject(String(raw))
            PhoneRelayResult(
                requestId = json.getString("requestId"),
                state = json.optString("state", "FAILED"),
                httpStatus = if (json.isNull("httpStatus")) null else json.optInt("httpStatus"),
                payload = json.optJSONObject("payload"),
                error = json.optString("error").takeIf { it.isNotBlank() },
            )
        }.getOrNull()
    }
}

object WatchPayloadJson {
    fun parse(json: JSONObject): WatchPayload = WatchPayload(
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
        summary = json.optJSONObject("summary")?.let { summary ->
            WatchSessionSummary(
                durationSeconds = if (summary.isNull("durationSeconds")) null else summary.optInt("durationSeconds"),
                volumeKg = summary.optInt("volumeKg", 0),
                sets = summary.optInt("sets", 0),
                calories = if (summary.isNull("calories")) null else summary.optInt("calories"),
                xpGained = summary.optInt("xpGained", 100),
                level = summary.optInt("level", 1),
                levelReached = summary.optBoolean("levelReached", false),
            )
        },
    )
}

class WatchTransportException(cause: Throwable) : IllegalStateException("Réseau montre indisponible", cause)
class WatchPhoneUnavailableException(message: String = "Téléphone non joignable") : IllegalStateException(message)
class WatchRelayQueuedException : IllegalStateException("En attente du réseau du téléphone")
