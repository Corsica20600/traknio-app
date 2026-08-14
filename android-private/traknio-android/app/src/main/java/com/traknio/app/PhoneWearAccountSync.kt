package com.traknio.app

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

object PhoneWearAccountSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun broadcastConnectedAccount(context: Context) {
        val appContext = context.applicationContext
        scope.launch {
            try {
                val accountState = readAccountState() ?: return@launch
                val nodes = Wearable.getNodeClient(appContext).connectedNodes.await()
                Log.i(TAG, "account broadcast nodes count=${nodes.size}")
                for (node in nodes) {
                    Wearable.getMessageClient(appContext)
                        .sendMessage(node.id, WearPairingPaths.ACCOUNT_STATE, accountState.toString().toByteArray())
                        .await()
                    Log.i(TAG, "account state sent to watch path=${WearPairingPaths.ACCOUNT_STATE}")
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                // A phone without Wear OS must never lose its UI session because the optional
                // watch bridge is unavailable (for example a phone-only emulator).
                Log.w(TAG, "account broadcast skipped; Wearable API unavailable", error)
            }
        }
    }

    fun readAccountState(): JSONObject? {
        val baseUrl = BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/')
        val cookies = CookieManager.getInstance().getCookie(baseUrl).orEmpty()
        Log.i(TAG, "account state requested cookiesPresent=${cookies.isNotBlank()}")
        if (cookies.isBlank()) return null

        val connection = (URL("$baseUrl/api/watch/pair/account-state").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("accept", "application/json")
            setRequestProperty("cookie", cookies)
        }

        return try {
            val statusCode = connection.responseCode
            Log.i(TAG, "account state backend response status=$statusCode")
            if (statusCode !in 200..299) return null
            JSONObject(connection.inputStream?.bufferedReader()?.use(BufferedReader::readText).orEmpty())
        } catch (error: Throwable) {
            Log.w(TAG, "account state backend request failed", error)
            null
        } finally {
            connection.disconnect()
        }
    }
    private const val TAG = "WATCH_PAIR"
}
