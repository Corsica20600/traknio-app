package com.traknio.app

import android.util.Log
import org.json.JSONObject

/** Logging-only sync telemetry. It must never influence workout control flow. */
object SyncMetrics {
    fun log(event: String, sessionId: String? = null, actionId: String? = null, action: String? = null, transport: String? = null, status: Int? = null) {
        runCatching {
            val json = JSONObject().put("ts", System.currentTimeMillis()).put("event", event).put("origin", "PHONE")
            sessionId?.takeIf { it.isNotBlank() }?.let { json.put("sessionId", it) }
            actionId?.takeIf { it.isNotBlank() }?.let { json.put("actionId", it) }
            action?.takeIf { it.isNotBlank() }?.let { json.put("action", it) }
            transport?.takeIf { it.isNotBlank() }?.let { json.put("transport", it) }
            status?.let { json.put("status", it) }
            Log.i("TRAKNIO_SYNC_METRIC", json.toString())
        }
    }
}
