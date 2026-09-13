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
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive

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
    private val _feedback = MutableStateFlow(WatchFeedbackState())
    val feedback: StateFlow<WatchFeedbackState> = _feedback.asStateFlow()
    private var feedbackRequest: Pair<String, String>? = null
    fun submitFeedback(sessionId: String, rating: Int, note: String) {
        if (_feedback.value.loading || latestPayload?.sessionId != sessionId || latestPayload?.status != "COMPLETED") return
        val key = "$sessionId:$rating:$note"
        val requestId = feedbackRequest?.takeIf { it.first == key }?.second ?: java.util.UUID.randomUUID().toString().also { feedbackRequest = key to it }
        _feedback.value = WatchFeedbackState(sessionId, loading = true)
        viewModelScope.launch {
            try {
                ensurePaired()
                check(api.feedback(sessionId, rating, note, requestId))
                _feedback.value = WatchFeedbackState(sessionId, saved = true)
                insightsCache.clear()
            } catch (error: Throwable) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                _feedback.value = WatchFeedbackState(sessionId, error = "Ressenti non confirmé. Réessaie.")
            }
        }
    }
    private val _insights = MutableStateFlow(WatchInsightsState())
    val insights: StateFlow<WatchInsightsState> = _insights.asStateFlow()
    private val insightsCache = mutableMapOf<String, Pair<Long, org.json.JSONObject>>()
    private var insightsAccount: String? = null
    private var insightsJob: Job? = null
    fun closeInsights() {
        insightsJob?.cancel()
        _insights.value = WatchInsightsState(page = if (_insights.value.page == "menu") null else "menu")
    }
    fun openInsights(page: String) {
        if (page in setOf("menu", "settings")) { insightsJob?.cancel(); _insights.value = WatchInsightsState(page = page); return }
        if (page !in setOf("history", "statistics")) return
        _insights.value = WatchInsightsState(page = page)
        loadInsights()
    }
    fun refreshInsights() = loadInsights(force = true)
    fun moreHistory() = loadInsights(more = true)
    private fun loadInsights(force: Boolean = false, more: Boolean = false) {
        val page = _insights.value.page?.takeIf { it in setOf("history", "statistics") } ?: return
        if (_insights.value.loading) return
        _insights.value = _insights.value.copy(loading = true, error = null)
        insightsJob?.cancel()
        insightsJob = viewModelScope.launch {
            try {
                ensurePaired()
                val account = tokenStore.accountPairingId()
                if (account != insightsAccount) {
                    insightsCache.clear()
                    insightsAccount = account
                    _insights.value = WatchInsightsState(page = page, loading = true)
                }
                val cached = insightsCache[page]
                if (!force && !more && cached != null && SystemClock.elapsedRealtime() - cached.first < 300_000) {
                    _insights.value = _insights.value.copy(payload = cached.second)
                    return@launch
                }
                val old = _insights.value.payload
                val cursor = if (more && page == "history" && old?.isNull("nextCursor") == false) old.getString("nextCursor") else null
                if (more && cursor == null) return@launch
                val result = api.insights(page, cursor)
                kotlinx.coroutines.currentCoroutineContext().ensureActive()
                if (account != tokenStore.accountPairingId()) return@launch
                if (cursor != null && old != null) {
                    val merged = org.json.JSONArray()
                    val seen = mutableSetOf<String>()
                    for (list in listOf(old.getJSONArray("history"), result.getJSONArray("history"))) {
                        for (index in 0 until list.length()) {
                            val item = list.getJSONObject(index)
                            if (seen.add(item.getString("id"))) merged.put(item)
                        }
                    }
                    result.put("history", merged)
                }
                insightsCache[page] = SystemClock.elapsedRealtime() to result
                _insights.value = _insights.value.copy(payload = result)
            } catch (error: Throwable) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                _insights.value = _insights.value.copy(error = "Données indisponibles. Réessaie avec une connexion.")
            } finally {
                if (kotlinx.coroutines.currentCoroutineContext().isActive) _insights.value = _insights.value.copy(loading = false)
            }
        }
    }
    private val _setConfirmation = MutableStateFlow<WatchSetConfirmation?>(null)
    val setConfirmation: StateFlow<WatchSetConfirmation?> = _setConfirmation.asStateFlow()
    fun dismissSetConfirmation() { _setConfirmation.value = null }
    private val _programLibrary = MutableStateFlow(WatchProgramLibrary())
    val programLibrary: StateFlow<WatchProgramLibrary> = _programLibrary.asStateFlow()
    private var programCacheAt = 0L
    private var programAccountId: String? = null
    private var pendingStart: Triple<String, String, String>? = null
    private var sessionGeneration = 0L

    fun openPrograms() { loadPrograms() }
    fun closePrograms() { if (!_programLibrary.value.starting) _programLibrary.value = _programLibrary.value.copy(open = false) }
    fun refreshPrograms() { loadPrograms(force = true) }
    fun morePrograms() { loadPrograms(more = true) }

    private fun loadPrograms(force: Boolean = false, more: Boolean = false) {
        if (_programLibrary.value.loading || _programLibrary.value.starting) return
        _programLibrary.value = _programLibrary.value.copy(open = true, loading = true, error = null)
        viewModelScope.launch {
            try {
                ensurePaired()
                val account = tokenStore.accountPairingId()
                if (account != programAccountId) {
                    _programLibrary.value = WatchProgramLibrary(open = true, loading = true)
                    programCacheAt = 0L
                    pendingStart = null
                    programAccountId = account
                }
                if (!force && !more && programCacheAt > 0 && SystemClock.elapsedRealtime() - programCacheAt < 300_000) return@launch
                val cursor = if (more) _programLibrary.value.nextCursor else null
                if (more && cursor == null) return@launch
                val page = api.programs(cursor)
                _programLibrary.value = _programLibrary.value.copy(
                    programs = (if (cursor != null) _programLibrary.value.programs + page.programs else page.programs).distinctBy { it.id },
                    nextCursor = page.nextCursor)
                programCacheAt = SystemClock.elapsedRealtime()
            } catch (error: Throwable) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                _programLibrary.value = _programLibrary.value.copy(error = "Programmes indisponibles. Vérifie la connexion et réessaie.")
            } finally { _programLibrary.value = _programLibrary.value.copy(loading = false) }
        }
    }

    fun startProgram(programId: String, dayId: String) {
        if (_programLibrary.value.starting || _programLibrary.value.loading) return
        val request = pendingStart?.takeIf { it.first == programId && it.second == dayId }
            ?: Triple(programId, dayId, java.util.UUID.randomUUID().toString()).also { pendingStart = it }
        _programLibrary.value = _programLibrary.value.copy(starting = true, error = null)
        sessionGeneration++ // Discard reads launched before this start request.
        viewModelScope.launch {
            try {
                ensurePaired()
                if (tokenStore.accountPairingId() != programAccountId) {
                    pendingStart = null
                    programCacheAt = 0L
                    _programLibrary.value = WatchProgramLibrary(open = true, starting = true)
                    throw IllegalStateException("program_account_changed")
                }
                val payload = api.startSession(programId, dayId, request.third)
                pendingStart = null
                newestRevisionMs = Long.MIN_VALUE
                applyPayload(payload, "Synchronisé")
                WatchWorkoutStateDataLayer.publish(appContext, payload, "start-session")
                _programLibrary.value = _programLibrary.value.copy(open = false)
                insightsJob?.cancel()
                _insights.value = WatchInsightsState()
                if (pollingJob?.isActive != true) startPolling()
            } catch (error: Throwable) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                _programLibrary.value = _programLibrary.value.copy(error = when (error.message) {
                    "program_day_empty" -> "Cette séance ne contient aucun exercice."
                    "program_day_not_found" -> "Programme modifié. Actualise la liste."
                    "program_account_changed" -> "Compte modifié. Actualise les programmes."
                    else -> "Démarrage non confirmé. Réessaie : la même demande sera vérifiée."
                })
            } finally { _programLibrary.value = _programLibrary.value.copy(starting = false) }
        }
    }

    private var latestPayload: WatchPayload? = null
    private var latestKey: String? = null
    private var deadline: RestDeadline? = null
    private var newestRestUpdatedAt: String? = null
    private var newestRevisionMs = Long.MIN_VALUE
    private var restMutationPending = false
    private var pollingJob: Job? = null
    private var pairingInProgress = false
    private var ongoingSessionMissing = false
    private var lastAccountCheckElapsedMs = 0L
    private val metricsFinalizationInFlight = mutableSetOf<String>()

    init {
        // Observe presentation transitions, including optimistic finish, without changing polling.
        viewModelScope.launch {
            state.mapNotNull { screen ->
                (screen as? WatchScreenState.Ready)?.let {
                    WorkoutOngoingState.from(it.payload.copy(restRemaining = it.displayRestRemaining))
                }
            }
                .distinctUntilChanged()
                .collectLatest { if (!ongoingSessionMissing) WorkoutOngoingActivity.update(appContext, it) }
        }
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

    fun onForeground() {
        if (_state.value is WatchScreenState.Empty) refresh()
    }

    fun onExercisePermissionsUpdated() {
        val payload = latestPayload ?: return
        if (ongoingSessionMissing) return
        WorkoutOngoingActivity.update(appContext, payload)
        if (payload.status != "IN_PROGRESS") return
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
        onSuccess = { before, after ->
            _setConfirmation.value = WatchSetConfirmation(before.sessionId, actualReps.coerceAtLeast(1), weight?.coerceAtLeast(0.0),
                after.exerciseName.takeIf { after.exerciseIndex != before.exerciseIndex && after.status == "IN_PROGRESS" })
        },
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
                if (!ExerciseTrackingService.activityVisible && latestPayload?.status != "IN_PROGRESS") continue
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
        if (_programLibrary.value.starting) return
        val generation = sessionGeneration
        // A background refresh must not overwrite an optimistic rest mutation before its
        // direct or relayed acknowledgement has supplied the authoritative timestamp.
        if (silent && restMutationPending) return

        val current = _state.value
        if (!silent && current is WatchScreenState.Ready) {
            _state.value = current.copy(syncLabel = "Sync...", error = null)
        }

        try {
            ensurePaired()
            val fetched = api.currentSession(latestPayload?.sessionId, bootstrap = latestPayload == null)
            if (generation != sessionGeneration) return
            applyPayload(fetched, syncLabel = "Sync OK")
            consumeStoredRelayResults()
            WatchWorkoutStateDataLayer.consumeLast(appContext)?.let(::applyRealtimeState)
        } catch (error: Throwable) {
            if (generation != sessionGeneration) return
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
        onSuccess: ((WatchPayload, WatchPayload) -> Unit)? = null,
        action: suspend (WatchPayload) -> WatchPayload,
    ) {
        val payload = latestPayload ?: return
        val ready = _state.value as? WatchScreenState.Ready ?: return
        if (ready.busyAction != null) return

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "workout_state_wear_ui_emit t=${System.currentTimeMillis()} action=$actionId revision=${payload.revision.takeLast(24)}")
        }

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
                onSuccess?.invoke(payload, result)
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
        if (error.message == "session_not_found") {
            ongoingSessionMissing = true
            WorkoutOngoingActivity.sessionNotFound(appContext)
        }
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
        if (result.payload?.let { it.has("programs") || it.has("history") || it.has("statistics") || it.has("feedbackSaved") } == true) {
            WatchRelayResultStore.remove(appContext, result.requestId)
            return
        }
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
        if (payload.status == "COMPLETED") insightsCache.clear()
        latestPayload = payload
        ongoingSessionMissing = false
        WorkoutOngoingActivity.update(appContext, payload)
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
        val current = latestPayload
        if (current == null) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "workout_state_wear_ignored t=${System.currentTimeMillis()} reason=viewmodel_unavailable action=${state.action ?: "confirmed"} revision=${state.revision.takeLast(24)}")
            }
            return
        }
        if (state.sessionId != current.sessionId) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "workout_state_wear_ignored t=${System.currentTimeMillis()} reason=session_different action=${state.action ?: "confirmed"} revision=${state.revision.takeLast(24)}")
            }
            return
        }
        val optimistic = state.optimistic || state.revision.startsWith("optimistic:")
        if (!optimistic && revisionMillis(state.revision) < newestRevisionMs) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "workout_state_wear_ignored t=${System.currentTimeMillis()} reason=revision_stale action=${state.action ?: "confirmed"} revision=${state.revision.takeLast(24)}")
            }
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
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "workout_state_wear_applied t=${System.currentTimeMillis()} action=${state.action ?: "confirmed"} revision=${state.revision.takeLast(24)} optimistic=$optimistic")
            Log.d(TAG, "workout_state_wear_ui_updated t=${System.currentTimeMillis()} action=${state.action ?: "confirmed"} revision=${state.revision.takeLast(24)}")
        }
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

    private fun selectOptimisticExercise(exerciseIndex: Int, setIndex: Int? = null) {
        val ready = _state.value as? WatchScreenState.Ready ?: return
        val current = ready.payload
        val normalizedIndex = exerciseIndex.coerceIn(1, current.totalExercises)
        val selectedExercise = current.exercises.firstOrNull { it.index == normalizedIndex - 1 }
        val selectedTotalSets = selectedExercise?.totalSets ?: current.totalSets
        val selectedSetIndex = (setIndex ?: selectedExercise?.activeSetIndex ?: 1)
            .coerceIn(1, selectedTotalSets.coerceAtLeast(1))
        val updated = current.copy(
            exerciseIndex = normalizedIndex,
            exerciseName = selectedExercise?.name ?: current.exerciseName,
            totalSets = selectedTotalSets,
            setIndex = selectedSetIndex,
            targetReps = selectedExercise?.targetReps ?: current.targetReps,
            weight = if (selectedExercise != null) selectedExercise.weight else current.weight,
            activeWeight = if (selectedExercise != null) selectedExercise.weight else current.activeWeight,
            proposedWeight = null,
            weightConfirmationRequired = false,
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
