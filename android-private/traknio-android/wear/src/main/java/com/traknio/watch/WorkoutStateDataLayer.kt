package com.traknio.watch

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

data class WorkoutStateMessage(
    val sessionId: String,
    val revision: String,
    val status: String,
    val exerciseIndex: Int,
    val setIndex: Int,
    val targetReps: Int?,
    val weight: Double?,
    val restRemaining: Int,
    val restStatus: String,
    val restUpdatedAt: String?,
) {
    fun toJson(): String = JSONObject()
        .put("sessionId", sessionId)
        .put("revision", revision)
        .put("status", status)
        .put("exerciseIndex", exerciseIndex)
        .put("setIndex", setIndex)
        .put("targetReps", targetReps)
        .put("weight", weight)
        .put("restRemaining", restRemaining)
        .put("restStatus", restStatus)
        .put("restUpdatedAt", restUpdatedAt)
        .toString()

    companion object {
        fun fromJson(raw: String): WorkoutStateMessage? = runCatching {
            val value = JSONObject(raw)
            val sessionId = value.optString("sessionId")
            val revision = value.optString("revision")
            if (sessionId.isBlank() || revision.isBlank()) return null
            WorkoutStateMessage(
                sessionId = sessionId,
                revision = revision,
                status = value.optString("status", "IN_PROGRESS"),
                exerciseIndex = value.optInt("exerciseIndex", 0).coerceAtLeast(0),
                setIndex = value.optInt("setIndex", 1).coerceAtLeast(1),
                targetReps = value.takeIf { !it.isNull("targetReps") }?.optInt("targetReps"),
                weight = value.takeIf { !it.isNull("weight") }?.optDouble("weight"),
                restRemaining = value.optInt("restRemaining", 0).coerceAtLeast(0),
                restStatus = value.optString("restStatus", "IDLE"),
                restUpdatedAt = value.optString("restUpdatedAt").takeIf { it.isNotBlank() },
            )
        }.getOrNull()
    }
}

object WatchWorkoutStateEvents {
    private val _flow = MutableSharedFlow<WorkoutStateMessage>(extraBufferCapacity = 8)
    val flow = _flow.asSharedFlow()
    fun emit(state: WorkoutStateMessage) { _flow.tryEmit(state) }
}

object WatchWorkoutStateDataLayer {
    private const val PREFS = "traknio_workout_state"
    private const val KEY_LAST_STATE = "lastState"
    private const val TAG = "WORKOUT_STATE"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun publish(context: Context, payload: WatchPayload) {
        val state = WorkoutStateMessage(
            sessionId = payload.sessionId,
            revision = payload.revision,
            status = payload.status,
            exerciseIndex = (payload.exerciseIndex - 1).coerceAtLeast(0),
            setIndex = payload.setIndex,
            targetReps = payload.targetReps,
            weight = payload.activeWeight ?: payload.weight,
            restRemaining = payload.restRemaining,
            restStatus = payload.restStatus,
            restUpdatedAt = payload.restUpdatedAt,
        )
        publish(context, state)
    }

    fun publish(context: Context, state: WorkoutStateMessage) {
        scope.launch {
            val nodes = runCatching { Wearable.getNodeClient(context.applicationContext).connectedNodes.await() }
                .getOrElse { emptyList() }
            nodes.forEach { node ->
                runCatching {
                    Wearable.getMessageClient(context.applicationContext)
                        .sendMessage(node.id, WearPairingPaths.WORKOUT_STATE, state.toJson().toByteArray())
                        .await()
                }.onFailure { Log.w(TAG, "state delivery failed type=${it.javaClass.simpleName}") }
            }
        }
    }

    fun receive(context: Context, state: WorkoutStateMessage) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_LAST_STATE, state.toJson()).apply()
        WatchWorkoutStateEvents.emit(state)
    }

    fun consumeLast(context: Context): WorkoutStateMessage? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_LAST_STATE, null) ?: return null
        prefs.edit().remove(KEY_LAST_STATE).apply()
        return WorkoutStateMessage.fromJson(raw)
    }
}
