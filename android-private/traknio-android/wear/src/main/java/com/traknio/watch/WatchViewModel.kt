package com.traknio.watch

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class WatchViewModel(context: Context) : ViewModel() {
    private val appContext = context.applicationContext
    private val tokenStore = WatchTokenStore(appContext)
    private val pairingClient = WearPairingClient(appContext)
    private val phoneRelayClient = WatchPhoneRelayClient(appContext)
    private val exerciseHealth = ExerciseHealthRepository(appContext)
    private val watchLabel = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Montre Wear OS"
    private val api: TraknioWatchApi = TraknioWatchApi(
        deviceTokenProvider = { tokenStore.deviceToken() },
        phoneRelayClient = phoneRelayClient,
    )

    private val _state = MutableStateFlow<WatchScreenState>(WatchScreenState.Loading)
    val state: StateFlow<WatchScreenState> = _state.asStateFlow()

    private var latestPayload: WatchPayload? = null
    private var latestKey: String? = null
    private var deadline: RestDeadline? = null
    private var newestRestUpdatedAt: String? = null
    private var newestRevisionMs = Long.MIN_VALUE
    private var restMutationPending = false
    private var pollingJob: Job? = null
    private var pairingInProgress = false
    private var lastAccountCheckElapsedMs = 0L
    private val metricsFinalizationInFlight = mutableSetOf<String>()

    init {
        startPolling()
        startDisplayTicker()
        viewModelScope.launch {
            WatchRelayEvents.flow.collectLatest { result ->
                applyRelayResult(result)
            }
        }
        viewModelScope.launch {
            WatchWorkoutStateEvents.flow.collectLatest(::applyRealtimeState)
        }
    }

    fun refresh() {
        viewModelScope.launch { fetchState(silent = false) }
    }

    fun onExercisePermissionsUpdated() {
        val payload = latestPayload?.takeIf { it.status == "IN_PROGRESS" } ?: return
        if (ExerciseTrackingService.startIfPermitted(appContext, payload.sessionId)) {
            (_state.value as? WatchScreenState.Ready)?.let { ready ->
                _state.value = ready.copy(error = null)
            }
        } else {
            (_state.value as? WatchScreenState.Ready)?.let { ready ->
                _state.value = ready.copy(error = "Autorise les capteurs pour activer la fréquence cardiaque")
            }
        }
    }

    fun validateSet(actualReps: Int, weight: Double?) = perform(
        "validate",
        optimistic = ::advanceOptimisticSet,
    ) { payload ->
        api.validateSet(payload, actualReps.coerceAtLeast(1), weight?.coerceAtLeast(0.0))
    }

    fun updateLiveTarget(targetReps: Int, weight: Double?) = perform(
        "update-live-target",
        optimistic = { updateOptimisticLiveTarget(targetReps, weight) },
    ) { payload ->
        api.updateLiveTarget(payload, targetReps.coerceAtLeast(1), weight?.coerceAtLeast(0.0))
    }

    fun skipRest() = perform(
        "skip-rest",
        optimistic = {
            deadline = null
            updateOptimisticRest(remainingSeconds = 0, paused = false)
        },
    ) { payload -> api.skipRest(payload.sessionId) }

    fun toggleRestPause() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        if (ready.busyAction != null) return
        if (ready.displayRestRemaining <= 0) return
        if (ready.payload.restStatus == "PAUSED") {
            perform("resume-rest", optimistic = {
                updateOptimisticRest(ready.displayRestRemaining, paused = false)
            }) { payload -> api.resumeRest(payload.sessionId) }
        } else {
            // The API owns pause state so the phone and watch cannot drift apart.
            perform("pause-rest", optimistic = {
                deadline = null
                updateOptimisticRest(ready.displayRestRemaining, paused = true)
            }) { payload -> api.pauseRest(payload.sessionId) }
        }
    }

    fun addRest() = perform("add-rest", optimistic = { addOptimisticRest(15) }) { payload ->
        api.addRest(payload.sessionId, 15)
    }

    fun removeRest() = perform("remove-rest", optimistic = { addOptimisticRest(-15) }) { payload ->
        api.removeRest(payload.sessionId, 15)
    }

    fun nextExercise() = perform("next", optimistic = { moveOptimisticExercise(1) }) { payload -> api.nextExercise(payload.sessionId) }

    fun previousExercise() = perform("previous", optimistic = { moveOptimisticExercise(-1) }) { payload -> api.previousExercise(payload.sessionId) }

    fun selectExercise(exerciseIndex: Int) = perform("select-exercise", optimistic = {
        selectOptimisticExercise(exerciseIndex)
    }) { payload ->
        api.selectExercise(payload.sessionId, exerciseIndex)
    }

    fun requestFinish() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        _state.value = ready.copy(finishConfirm = true)
    }

    fun completeSession() = perform("finish", optimistic = ::completeOptimisticSession) { payload -> api.completeSession(payload.sessionId) }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            fetchState(silent = false)
            while (true) {
                if ((latestPayload?.status) == "COMPLETED") break
                delay(nextPollingDelayMs())
                fetchState(silent = true)
            }
        }
    }

    private fun nextPollingDelayMs(): Long {
        val ready = _state.value as? WatchScreenState.Ready ?: return 60_000
        return if (ready.payload.status == "IN_PROGRESS") 15_000 else 60_000
    }

    private fun startDisplayTicker() {
        viewModelScope.launch {
            while (true) {
                delay(250)
                updateDisplayRemaining()
            }
        }
    }

    private suspend fun fetchState(silent: Boolean) {
        // A background refresh must not overwrite an optimistic rest mutation before its
        // direct or relayed acknowledgement has supplied the authoritative timestamp.
        if (silent && restMutationPending) return

        val current = _state.value
        if (!silent && current is WatchScreenState.Ready) {
            _state.value = current.copy(syncLabel = "Sync...", error = null)
        }

        try {
            ensurePaired()
            applyPayload(api.currentSession(latestPayload?.sessionId, bootstrap = latestPayload == null), syncLabel = "Sync OK")
            consumeStoredRelayResults()
            WatchWorkoutStateDataLayer.consumeLast(appContext)?.let(::applyRealtimeState)
        } catch (error: Throwable) {
            if (isPairingRequired(error)) {
                tokenStore.clear()
                val recovered = runCatching {
                    ensurePaired()
                    applyPayload(api.currentSession(latestPayload?.sessionId, bootstrap = latestPayload == null), syncLabel = "Sync OK")
                    consumeStoredRelayResults()
                    WatchWorkoutStateDataLayer.consumeLast(appContext)?.let(::applyRealtimeState)
                }.isSuccess
                if (recovered) return
            }
            handleFetchError(error)
        }
    }

    private fun perform(
        actionId: String,
        optimistic: (() -> Unit)? = null,
        action: suspend (WatchPayload) -> WatchPayload,
    ) {
        val payload = latestPayload ?: return
        val ready = _state.value as? WatchScreenState.Ready ?: return
        if (ready.busyAction != null) return

        val mutatesRest = actionId in REST_ACTIONS
        if (mutatesRest) restMutationPending = true
        _state.value = ready.copy(busyAction = actionId, syncLabel = "Sync...", finishConfirm = false, error = null)
        optimistic?.invoke()
        // Propagate the UI transition over the Data Layer before waiting for HTTPS.
        // The server result below remains authoritative and will reconcile this snapshot.
        (latestPayload ?: payload).let { WatchWorkoutStateDataLayer.publishOptimistic(appContext, it, actionId) }

        viewModelScope.launch {
            try {
                ensurePaired()
                val result = action(payload)
                applyPayload(result, syncLabel = "Sync OK", confirmedRestMutation = mutatesRest)
                WatchWorkoutStateDataLayer.publish(appContext, result, actionId)
            } catch (error: Throwable) {
                if (error is WatchRelayQueuedException) {
                    val queued = _state.value as? WatchScreenState.Ready
                    if (queued != null) {
                        _state.value = queued.copy(
                            busyAction = null,
                            syncLabel = "Attente téléphone",
                            error = null,
                        )
                    }
                    return@launch
                }
                if (mutatesRest) restMutationPending = false
                if (isPairingRequired(error)) {
                    tokenStore.clear()
                    Log.i(TAG, "pairing required from backend; token cleared")
                }
                val fallback = _state.value as? WatchScreenState.Ready
                if (fallback != null) {
                    _state.value = fallback.copy(
                        busyAction = null,
                        syncLabel = "Erreur",
                        error = error.message ?: "Action refusée",
                    )
                }
                fetchState(silent = true)
            }
        }
    }

    private suspend fun ensurePaired() {
        if (!tokenStore.deviceToken().isNullOrBlank()) {
            Log.i(TAG, "watch token present; verifying account if needed")
            verifyPhoneAccountIfNeeded()
        }
        if (!tokenStore.deviceToken().isNullOrBlank()) return
        if (pairingInProgress) return

        pairingInProgress = true
        try {
            Log.i(TAG, "watch token missing; requesting temporary pairing token")
            val temporaryToken = pairingClient.requestTemporaryPairingToken(watchLabel)
            Log.i(TAG, "temporary pairing token received accountPairingIdPresent=${temporaryToken.accountPairingId.isNotBlank()}")
            val result = api.completePairing(temporaryToken.token, watchLabel)
            tokenStore.save(result.deviceToken, result.accountPairingId)
            Log.i(TAG, "watch pairing completed")
        } finally {
            pairingInProgress = false
        }
    }

    private suspend fun verifyPhoneAccountIfNeeded() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastAccountCheckElapsedMs < 30_000) return
        lastAccountCheckElapsedMs = now

        val accountPairingId = runCatching {
            pairingClient.requestCurrentAccountPairingId()
        }.getOrNull()
        if (!accountPairingId.isNullOrBlank()) {
            Log.i(TAG, "phone account state received; checking account")
            tokenStore.clearIfAccountChanged(accountPairingId)
        }
    }

    private fun isPairingRequired(error: Throwable): Boolean {
        val message = error.message.orEmpty()
        return message == "watch_pairing_required" || message == "pairing_token_expired"
    }

    private fun handleFetchError(error: Throwable) {
        if (latestPayload == null) {
            _state.value = WatchScreenState.Empty(error.message ?: "Aucune séance active")
            return
        }

        val ready = _state.value as? WatchScreenState.Ready
        if (ready != null) {
            _state.value = ready.copy(syncLabel = "Sync locale", error = null, busyAction = null)
        }
    }

    private fun consumeStoredRelayResults() {
        WatchRelayResultStore.consumeAll(appContext).forEach(::applyRelayResult)
    }

    private fun applyRelayResult(result: PhoneRelayResult) {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        if (result.isTerminal()) WatchRelayResultStore.remove(appContext, result.requestId)
        when (result.state) {
            "SENDING" -> _state.value = ready.copy(syncLabel = "Envoi...", error = null)
            "WAITING_PHONE" -> _state.value = ready.copy(syncLabel = "Attente téléphone", error = null)
            "COMPLETED" -> result.payload?.let { payload ->
                applyPayload(WatchPayloadJson.parse(payload), syncLabel = "Synchronisé", confirmedRestMutation = true)
            }
            "QUEUED" -> _state.value = ready.copy(
                syncLabel = "En attente réseau",
                error = null,
            )
            "FAILED" -> _state.value = ready.copy(
                busyAction = null,
                syncLabel = "Échec",
                error = result.error ?: "Synchronisation impossible",
            ).also {
                restMutationPending = false
            }
        }
    }

    override fun onCleared() {
        phoneRelayClient.close()
        super.onCleared()
    }

    private fun applyPayload(
        incoming: WatchPayload,
        syncLabel: String,
        confirmedRestMutation: Boolean = false,
        finalizeMetrics: Boolean = true,
    ) {
        val currentPayload = latestPayload
        val incomingRevisionMs = revisionMillis(incoming.revision)
        if (currentPayload?.sessionId == incoming.sessionId && incomingRevisionMs < newestRevisionMs) return
        val restSnapshotIsCurrent = confirmedRestMutation || currentPayload == null || currentPayload.sessionId != incoming.sessionId ||
            (!restMutationPending && isRestSnapshotAtLeastAsRecent(newestRestUpdatedAt ?: currentPayload.restUpdatedAt, incoming.restUpdatedAt))
        val payloadWithLocalExercises = if (incoming.exercises.isEmpty() && currentPayload?.sessionId == incoming.sessionId) {
            incoming.copy(exercises = currentPayload.exercises)
        } else incoming
        val payload = if (currentPayload != null && currentPayload.sessionId == incoming.sessionId && !restSnapshotIsCurrent) {
            payloadWithLocalExercises.copy(
                restRemaining = currentPayload.restRemaining,
                restStatus = currentPayload.restStatus,
                restUpdatedAt = currentPayload.restUpdatedAt,
            )
        } else {
            payloadWithLocalExercises
        }
        if (restSnapshotIsCurrent && !payload.restUpdatedAt.isNullOrBlank()) {
            newestRestUpdatedAt = payload.restUpdatedAt
            restMutationPending = false
        }
        latestPayload = payload
        newestRevisionMs = maxOf(newestRevisionMs, incomingRevisionMs)
        if (payload.status == "IN_PROGRESS") {
            val health = exerciseHealth.snapshot.value
            if (health.sessionId != payload.sessionId || health.state != "ACTIVE") {
                // Safe during automatic session restoration: this call is a no-op
                // until the UI has obtained the Health Services permissions.
                ExerciseTrackingService.startIfPermitted(appContext, payload.sessionId)
            }
        } else if (payload.status == "COMPLETED") {
            pollingJob?.cancel()
            if (finalizeMetrics) finalizeExerciseMetrics(payload.sessionId)
        }
        val nextKey = "${payload.sessionId}:${payload.exerciseIndex}:${payload.setIndex}"
        val contextChanged = latestKey != nextKey
        latestKey = nextKey

        val elapsedNow = SystemClock.elapsedRealtime()
        val isPaused = payload.restStatus == "PAUSED" && payload.restRemaining > 0
        val nextDeadline = if (isPaused) null else createRestDeadline(payload.restRemaining, elapsedNow)
        if (!isPaused && shouldReplaceDeadline(deadline, nextDeadline, contextChanged, elapsedNow)) {
            deadline = nextDeadline
        } else if (isPaused) {
            deadline = null
        }

        _state.value = WatchScreenState.Ready(
            payload = payload,
            displayRestRemaining = if (isPaused) payload.restRemaining else remainingFromDeadline(deadline, elapsedNow),
            syncLabel = syncLabel,
            pausedRestRemaining = if (isPaused) payload.restRemaining else null,
        )
    }

    private fun applyRealtimeState(state: WorkoutStateMessage) {
        val current = latestPayload ?: return
        if (state.sessionId != current.sessionId) {
            Log.i(TAG, "workout_state_ignored reason=session action=${state.action ?: "confirmed"}")
            return
        }
        val optimistic = state.optimistic || state.revision.startsWith("optimistic:")
        if (!optimistic && revisionMillis(state.revision) < newestRevisionMs) {
            Log.i(TAG, "workout_state_ignored reason=stale action=${state.action ?: "confirmed"}")
            return
        }
        val exerciseName = current.exercises.firstOrNull { it.index == state.exerciseIndex }?.name ?: current.exerciseName
        applyPayload(
            current.copy(
                exerciseName = exerciseName,
                exerciseIndex = state.exerciseIndex + 1,
                setIndex = state.setIndex,
                targetReps = state.targetReps ?: current.targetReps,
                weight = state.weight ?: current.weight,
                activeWeight = state.weight ?: current.activeWeight,
                restRemaining = state.restRemaining,
                restStatus = state.restStatus,
                restUpdatedAt = state.restUpdatedAt ?: current.restUpdatedAt,
                // A temporary client revision is intentionally never promoted to the
                // authoritative revision watermark; a server confirmation must win later.
                revision = if (optimistic) current.revision else state.revision,
                status = state.status,
            ),
            syncLabel = "Synchronisé",
            confirmedRestMutation = !optimistic,
            finalizeMetrics = !optimistic,
        )
    }

    private fun revisionMillis(revision: String?): Long = runCatching {
        java.time.Instant.parse(revision).toEpochMilli()
    }.getOrDefault(0L)

    private fun finalizeExerciseMetrics(sessionId: String) {
        if (!metricsFinalizationInFlight.add(sessionId)) return
        viewModelScope.launch {
            try {
                val metrics = exerciseHealth.finish(sessionId)
                ExerciseTrackingService.stop(appContext)
                val average = metrics.averageHeartRateBpm
                val calories = metrics.sessionCaloriesKcal
                if (average != null || calories != null) {
                    ensurePaired()
                    applyPayload(api.submitSessionMetrics(sessionId, average, calories), syncLabel = "Synchronisé")
                }
                exerciseHealth.clear(sessionId)
            } catch (error: Throwable) {
                Log.w(TAG, "session metric finalization failed session=${sessionId.takeLast(8)} type=${error.javaClass.simpleName}")
            } finally {
                metricsFinalizationInFlight.remove(sessionId)
            }
        }
    }

    private fun updateDisplayRemaining() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        if (ready.pausedRestRemaining != null) return
        val remaining = remainingFromDeadline(deadline)
        if (remaining == ready.displayRestRemaining) return
        if (remaining <= 0) deadline = null
        _state.value = ready.copy(displayRestRemaining = remaining)
    }

    private fun addOptimisticRest(seconds: Int) {
        val now = SystemClock.elapsedRealtime()
        val ready = _state.value as? WatchScreenState.Ready
        val pausedRemaining = ready?.pausedRestRemaining
        val remaining = pausedRemaining ?: remainingFromDeadline(deadline, now)
        val nextRemaining = (remaining + seconds).coerceIn(0, 600)
        if (pausedRemaining != null) {
            deadline = null
            updateOptimisticRest(nextRemaining, paused = true)
        } else {
            deadline = createRestDeadline(nextRemaining, now)
            updateOptimisticRest(nextRemaining, paused = false)
        }
    }

    private fun updateOptimisticRest(remainingSeconds: Int, paused: Boolean) {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        val optimisticUpdatedAt = java.time.Instant.now().toString()
        val updatedPayload = ready.payload.copy(
            restRemaining = remainingSeconds,
            restStatus = when {
                remainingSeconds <= 0 -> "IDLE"
                paused -> "PAUSED"
                else -> "ACTIVE"
            },
            restUpdatedAt = optimisticUpdatedAt,
        )
        newestRestUpdatedAt = optimisticUpdatedAt
        latestPayload = updatedPayload
        _state.value = ready.copy(
            payload = updatedPayload,
            displayRestRemaining = remainingSeconds,
            pausedRestRemaining = if (paused && remainingSeconds > 0) remainingSeconds else null,
        )
    }

    private fun updateOptimisticLiveTarget(targetReps: Int, weight: Double?) {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        val updatedPayload = ready.payload.copy(
            targetReps = targetReps.coerceAtLeast(1),
            weight = weight?.coerceAtLeast(0.0),
            activeWeight = weight?.coerceAtLeast(0.0),
            proposedWeight = null,
            weightConfirmationRequired = false,
        )
        latestPayload = updatedPayload
        _state.value = ready.copy(payload = updatedPayload)
    }

    private fun advanceOptimisticSet() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        val current = ready.payload
        val nextExerciseIndex: Int
        val nextSetIndex: Int
        if (current.setIndex >= current.totalSets && current.exerciseIndex < current.totalExercises) {
            nextExerciseIndex = current.exerciseIndex + 1
            nextSetIndex = 1
        } else {
            nextExerciseIndex = current.exerciseIndex
            nextSetIndex = (current.setIndex + 1).coerceAtMost(current.totalSets)
        }
        selectOptimisticExercise(nextExerciseIndex, nextSetIndex)
    }

    private fun moveOptimisticExercise(delta: Int) {
        val current = latestPayload ?: return
        selectOptimisticExercise((current.exerciseIndex + delta).coerceIn(1, current.totalExercises), 1)
    }

    private fun selectOptimisticExercise(exerciseIndex: Int, setIndex: Int = 1) {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        val current = ready.payload
        val normalizedIndex = exerciseIndex.coerceIn(1, current.totalExercises)
        val name = current.exercises.firstOrNull { it.index == normalizedIndex - 1 }?.name ?: current.exerciseName
        val updated = current.copy(
            exerciseIndex = normalizedIndex,
            exerciseName = name,
            setIndex = setIndex.coerceAtLeast(1),
            restRemaining = 0,
            restStatus = "IDLE",
        )
        deadline = null
        latestPayload = updated
        _state.value = ready.copy(payload = updated, displayRestRemaining = 0, pausedRestRemaining = null)
    }

    private fun completeOptimisticSession() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        val updated = ready.payload.copy(status = "COMPLETED", restRemaining = 0, restStatus = "IDLE")
        deadline = null
        latestPayload = updated
        _state.value = ready.copy(payload = updated, displayRestRemaining = 0, pausedRestRemaining = null)
    }

    private companion object {
        val REST_ACTIONS = setOf("skip-rest", "pause-rest", "resume-rest", "add-rest", "remove-rest")
    }
}

private const val TAG = "WATCH_PAIR"
