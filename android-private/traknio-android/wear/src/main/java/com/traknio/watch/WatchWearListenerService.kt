package com.traknio.watch

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

class WatchWearListenerService : WearableListenerService() {
    override fun onMessageReceived(messageEvent: MessageEvent) {
        Log.i(TAG, "watch listener message path=${messageEvent.path} bytes=${messageEvent.data.size}")
        if (messageEvent.path != WearPairingPaths.ACCOUNT_STATE) return

        val accountPairingId = runCatching {
            JSONObject(String(messageEvent.data)).optString("accountPairingId")
        }.getOrNull()?.takeIf { it.isNotBlank() } ?: return

        WatchTokenStore(applicationContext).clearIfAccountChanged(accountPairingId)
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED || !event.dataItem.uri.path.orEmpty().startsWith("${WearPairingPaths.API_RESPONSE}/")) {
                return@forEach
            }
            val result = runCatching {
                PhoneRelayResult.fromJson(
                    DataMapItem.fromDataItem(event.dataItem).dataMap
                        .getString("responseJson")
                        .orEmpty()
                        .toByteArray(),
                )
            }.getOrNull() ?: return@forEach
            WatchRelayResultStore.save(applicationContext, result)
            WatchRelayEvents.emit(result)
            Log.i(TAG, "watch relay result stored request=${result.requestId.takeLast(8)} state=${result.state}")
        }
    }
    companion object {
        private const val TAG = "WATCH_PAIR"
    }
}
