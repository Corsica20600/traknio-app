package com.traknio.watch

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object WatchRelayEvents {
    private val events = MutableSharedFlow<PhoneRelayResult>(extraBufferCapacity = 16)
    val flow = events.asSharedFlow()

    fun emit(result: PhoneRelayResult) {
        events.tryEmit(result)
    }
}
