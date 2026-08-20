package com.traknio.app

import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

/**
 * A compact, best-effort state notification. The backend remains authoritative;
 * this only removes the wait for the next reconciliation poll while devices are connected.
 */
object WorkoutStateDataLayer {
    const val ACTION_STATE_RECEIVED = "com.traknio.app.WORKOUT_STATE_RECEIVED"
    const val EXTRA_STATE_JSON = "stateJson"
    private const val PREFS = "traknio_workout_state"
    private const val KEY_LAST_STATE = "lastState"
    private const val TAG = "WORKOUT_STATE"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun publish(context: Context, stateJson: String) {
        val normalized = normalize(stateJson) ?: return
        scope.launch {
            val state = JSONObject(normalized)
            val action = state.optString("action", "confirmed")
            val revision = state.optString("revision").takeLast(24)
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "workout_state_phone_emit_start t=${System.currentTimeMillis()} action=$action revision=$revision")
            }
            val nodes = runCatching { Wearable.getNodeClient(context.applicationContext).connectedNodes.await() }
                .getOrElse {
                    Log.w(TAG, "nodes unavailable type=${it.javaClass.simpleName}")
                    emptyList()
                }
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "workout_state_phone_emit_nodes t=${System.currentTimeMillis()} action=$action revision=$revision nodes=${nodes.size} connected=${nodes.isNotEmpty()}")
            }
            nodes.forEach { node ->
                runCatching {
                    Wearable.getMessageClient(context.applicationContext)
                        .sendMessage(node.id, WearPairingPaths.WORKOUT_STATE, normalized.toByteArray())
                        .await()
                }.onSuccess {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "workout_state_phone_emit_success t=${System.currentTimeMillis()} action=$action revision=$revision node=${node.id.takeLast(8)}")
                    }
                }.onFailure {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "workout_state_phone_emit_failed t=${System.currentTimeMillis()} action=$action revision=$revision node=${node.id.takeLast(8)} error=${it.javaClass.simpleName}")
                    }
                }
            }
        }
    }

    fun receiveFromWatch(context: Context, stateJson: String) {
        val normalized = normalize(stateJson) ?: return
        val state = JSONObject(normalized)
        if (BuildConfig.DEBUG) {
            Log.d(
                TAG,
                "workout_state_phone_received t=${System.currentTimeMillis()} action=${state.optString("action", "confirmed")} revision=${state.optString("revision").takeLast(24)} optimistic=${state.optBoolean("optimistic", false)}",
            )
        }
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_LAST_STATE, normalized).apply()
        context.applicationContext.sendBroadcast(
            Intent(ACTION_STATE_RECEIVED)
                .setPackage(context.packageName)
                .putExtra(EXTRA_STATE_JSON, normalized),
        )
    }

    fun lastState(context: Context): String? =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_STATE, null)

    private fun normalize(raw: String): String? = runCatching {
        val value = JSONObject(raw)
        if (value.optString("sessionId").isBlank() || value.optString("revision").isBlank()) return null
        value.toString()
    }.getOrNull()
}
