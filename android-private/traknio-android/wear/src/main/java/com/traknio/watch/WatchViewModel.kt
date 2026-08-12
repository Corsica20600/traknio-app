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
    private var pollingJob: Job? = null
    private var pairingInProgress = false
    private var lastAccountCheckElapsedMs = 0L

    init {
        startPolling()
        startDisplayTicker()
        viewModelScope.launch {
            WatchRelayEvents.flow.collectLatest { result ->
                applyRelayResult(result)
            }
        }
    }

    fun refresh() {
        viewModelScope.launch { fetchState(silent = false) }
    }

    fun validateSet() = perform("validate") { payload -> api.validateSet(payload) }

    fun skipRest() = perform("skip") { payload -> api.skipRest(payload.sessionId) }

    fun toggleRestPause() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        if (ready.busyAction != null) return
        if (ready.displayRestRemaining <= 0) return
        if (ready.payload.restStatus == "PAUSED") {
            perform("resume-rest") { payload -> api.resumeRest(payload.sessionId) }
        } else {
            // The API owns pause state so the phone and watch cannot drift apart.
            perform("pause-rest", optimistic = {
                deadline = null
                val current = _state.value as? WatchScreenState.Ready
                if (current != null) {
                    _state.value = current.copy(
                        pausedRestRemaining = current.displayRestRemaining,
                        syncLabel = "Sync...",
                    )
                }
            }) { payload -> api.pauseRest(payload.sessionId) }
        }
    }

    fun addRest() = perform("add-rest", optimistic = { addOptimisticRest(15) }) { payload ->
        api.addRest(payload.sessionId, 15)
    }

    fun removeRest() = perform("remove-rest", optimistic = { addOptimisticRest(-15) }) { payload ->
        api.removeRest(payload.sessionId, 15)
    }

    fun nextExercise() = perform("next") { payload -> api.nextExercise(payload.sessionId) }

    fun previousExercise() = perform("previous") { payload -> api.previousExercise(payload.sessionId) }

    fun requestFinish() {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        _state.value = ready.copy(finishConfirm = true)
    }

    fun completeSession() = perform("finish") { payload -> api.completeSession(payload.sessionId) }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            fetchState(silent = false)
            while (true) {
                delay(nextPollingDelayMs())
                fetchState(silent = true)
            }
        }
    }

    private fun nextPollingDelayMs(): Long {
        val ready = _state.value as? WatchScreenState.Ready ?: return 8_000
        return if (ready.payload.status == "IN_PROGRESS") 1_000 else 8_000
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
        val current = _state.value
        if (!silent && current is WatchScreenState.Ready) {
            _state.value = current.copy(syncLabel = "Sync...", error = null)
        }

        try {
            ensurePaired()
            applyPayload(api.currentSession(latestPayload?.sessionId), syncLabel = "Sync OK")
            consumeStoredRelayResults()
        } catch (error: Throwable) {
            if (isPairingRequired(error)) {
                tokenStore.clear()
                val recovered = runCatching {
                    ensurePaired()
                    applyPayload(api.currentSession(latestPayload?.sessionId), syncLabel = "Sync OK")
                    consumeStoredRelayResults()
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

        _state.value = ready.copy(busyAction = actionId, syncLabel = "Sync...", finishConfirm = false, error = null)
        optimistic?.invoke()

        viewModelScope.launch {
            try {
                ensurePaired()
                applyPayload(action(payload), syncLabel = "Sync OK")
            } catch (error: Throwable) {
                if (error is WatchRelayQueuedException) {
                    val queued = _state.value as? WatchScreenState.Ready
                    if (queued != null) {
                        _state.value = queued.copy(
                            syncLabel = "Attente téléphone",
                            error = null,
                        )
                    }
                    return@launch
                }
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
                applyPayload(WatchPayloadJson.parse(payload), syncLabel = "Synchronisé")
            }
            "QUEUED" -> _state.value = ready.copy(
                syncLabel = "En attente réseau",
                error = null,
            )
            "FAILED" -> _state.value = ready.copy(
                busyAction = null,
                syncLabel = "Échec",
                error = result.error ?: "Synchronisation impossible",
            )
        }
    }

    override fun onCleared() {
        phoneRelayClient.close()
        super.onCleared()
    }

    private fun applyPayload(payload: WatchPayload, syncLabel: String) {
        latestPayload = payload
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
        val nextRemaining = (remaining + seconds).coerceAtLeast(0)
        if (pausedRemaining != null) {
            deadline = null
            _state.value = ready.copy(displayRestRemaining = nextRemaining, pausedRestRemaining = nextRemaining)
            return
        }
        deadline = createRestDeadline(nextRemaining, now)
        updateDisplayRemaining()
    }
}

private const val TAG = "WATCH_PAIR"
