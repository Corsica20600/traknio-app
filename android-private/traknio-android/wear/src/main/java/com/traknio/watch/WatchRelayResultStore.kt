package com.traknio.watch

import android.content.Context
import org.json.JSONObject

/** Retains terminal phone-relay results delivered while the watch UI is not running. */
object WatchRelayResultStore {
    private const val PREFS = "traknio_watch_relay_results"
    private const val KEY_RESULTS = "results"

    fun save(context: Context, result: PhoneRelayResult) {
        if (!result.isTerminal()) return
        val results = read(context).toMutableMap()
        results[result.requestId] = JSONObject()
            .put("requestId", result.requestId)
            .put("state", result.state)
            .put("httpStatus", result.httpStatus)
            .put("payload", result.payload)
            .put("error", result.error)
            .toString()
        write(context, results)
    }

    fun consumeAll(context: Context): List<PhoneRelayResult> {
        val results = read(context).values.mapNotNull { PhoneRelayResult.fromJson(it.toByteArray()) }
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_RESULTS)
            .apply()
        return results
    }

    fun remove(context: Context, requestId: String) {
        val results = read(context).toMutableMap()
        if (results.remove(requestId) != null) write(context, results)
    }

    private fun read(context: Context): Map<String, String> {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_RESULTS, null)
            .orEmpty()
        return runCatching {
            val json = JSONObject(raw)
            json.keys().asSequence().associateWith { json.getString(it) }
        }.getOrDefault(emptyMap())
    }

    private fun write(context: Context, results: Map<String, String>) {
        val json = JSONObject()
        results.forEach { (requestId, value) -> json.put(requestId, value) }
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_RESULTS, json.toString())
            .apply()
    }
}
