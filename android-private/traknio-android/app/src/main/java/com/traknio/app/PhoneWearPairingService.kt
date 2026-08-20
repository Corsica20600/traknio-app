package com.traknio.app

import android.webkit.CookieManager
import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class PhoneWearPairingService : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val baseUrl = BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/')

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path == WearPairingPaths.WORKOUT_STATE) {
            WorkoutStateDataLayer.receiveFromWatch(applicationContext, String(messageEvent.data))
            return
        }
        if (messageEvent.path != WearPairingPaths.PAIRING_REQUEST && messageEvent.path != WearPairingPaths.ACCOUNT_STATE_REQUEST && messageEvent.path != WearPairingPaths.API_REQUEST) {
            return
        }
        Log.i(TAG, "message received on phone path=${messageEvent.path} bytes=${messageEvent.data.size}")

        scope.launch {
            if (messageEvent.path == WearPairingPaths.API_REQUEST) {
                handleApiRelay(messageEvent)
                return@launch
            }
            val response = if (messageEvent.path == WearPairingPaths.PAIRING_REQUEST) {
                requestPairingToken(messageEvent.data)
            } else {
                PhoneWearAccountSync.readAccountState()
                    ?: JSONObject()
                        .put("ok", false)
                        .put("error", "auth_required")
            }
            val responsePath = if (messageEvent.path == WearPairingPaths.PAIRING_REQUEST) {
                WearPairingPaths.PAIRING_RESPONSE
            } else {
                WearPairingPaths.ACCOUNT_STATE
            }
            Wearable.getMessageClient(this@PhoneWearPairingService)
                .sendMessage(messageEvent.sourceNodeId, responsePath, response.toString().toByteArray())
                .await()
            Log.i(TAG, "response sent to watch path=$responsePath ok=${response.optBoolean("ok", false)}")
        }
    }

    private suspend fun handleApiRelay(messageEvent: MessageEvent) {
        val request = PhoneWatchRelayRequest.fromJson(String(messageEvent.data))?.copy(sourceNodeId = messageEvent.sourceNodeId)
        if (request == null || request.requestId.length !in 8..128) return
        Log.i(TAG, "relay received operation=${request.operation} request=${request.requestId.takeLast(8)}")
        val persistForRetry = PhoneWatchRelayQueue.shouldPersist(request)
        if (persistForRetry) PhoneWatchRelayQueue.enqueue(applicationContext, request)
        val relayClient = PhoneWatchRelayClient(applicationContext)
        relayClient.sendStatus(request, "WAITING_PHONE")
        when (val outcome = relayClient.execute(request)) {
            is RelayExecution.Completed -> {
                if (relayClient.respond(request, "COMPLETED", outcome.status, outcome.payload, null)) {
                    PhoneWatchRelayQueue.remove(applicationContext, request.requestId)
                } else {
                    PhoneWatchRelayQueue.schedule(applicationContext)
                }
            }
            is RelayExecution.FinalFailure -> {
                if (relayClient.respond(request, "FAILED", outcome.status, null, outcome.error)) {
                    PhoneWatchRelayQueue.remove(applicationContext, request.requestId)
                } else {
                    PhoneWatchRelayQueue.schedule(applicationContext)
                }
            }
            RelayExecution.Retry -> {
                if (persistForRetry) {
                    relayClient.respond(
                        request = request,
                        state = "QUEUED",
                        httpStatus = null,
                        payload = null,
                        error = "En attente du réseau du téléphone",
                    )
                    PhoneWatchRelayQueue.schedule(applicationContext)
                } else {
                    relayClient.respond(
                        request = request,
                        state = "FAILED",
                        httpStatus = null,
                        payload = null,
                        error = "Aucun accès réseau disponible",
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun requestPairingToken(rawRequest: ByteArray): JSONObject {
        val label = runCatching {
            JSONObject(String(rawRequest)).optString("label", "Montre Wear OS")
        }.getOrDefault("Montre Wear OS")

        val cookies = CookieManager.getInstance().getCookie(baseUrl).orEmpty()
        Log.i(TAG, "pairing token requested backend cookiesPresent=${cookies.isNotBlank()}")
        if (cookies.isBlank()) {
            return JSONObject()
                .put("ok", false)
                .put("error", "auth_required")
        }

        val body = JSONObject().put("label", label)
        val connection = (URL("$baseUrl/api/watch/pair/request").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 8_000
            doOutput = true
            setRequestProperty("accept", "application/json")
            setRequestProperty("content-type", "application/json")
            setRequestProperty("cookie", cookies)
        }

        return try {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body.toString())
            }

            val statusCode = connection.responseCode
            val rawBody = readBody(connection, statusCode)
            val json = JSONObject(rawBody.ifBlank { "{}" })
            Log.i(TAG, "pairing token backend response status=$statusCode ok=${statusCode in 200..299}")
            if (statusCode in 200..299) {
                json
            } else {
                JSONObject()
                    .put("ok", false)
                    .put("error", json.optString("error", "pairing_failed"))
            }
        } catch (error: Throwable) {
            Log.w(TAG, "pairing token backend request failed", error)
            JSONObject()
                .put("ok", false)
                .put("error", error.message ?: "pairing_failed")
        } finally {
            connection.disconnect()
        }
    }

    private fun readBody(connection: HttpURLConnection, statusCode: Int): String {
        val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
        return stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
    }
    companion object {
        private const val TAG = "WATCH_PAIR"
    }
}
