package com.traknio.watch

import android.os.SystemClock
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import java.time.Instant

fun createRestDeadline(restRemaining: Int, elapsedNowMs: Long = SystemClock.elapsedRealtime()): RestDeadline? {
    val seconds = max(0, restRemaining)
    if (seconds <= 0) return null
    return RestDeadline(
        deadlineElapsedMs = elapsedNowMs + seconds * 1_000L,
        sourceRemainingSeconds = seconds,
    )
}

fun remainingFromDeadline(deadline: RestDeadline?, elapsedNowMs: Long = SystemClock.elapsedRealtime()): Int {
    if (deadline == null) return 0
    return max(0, ceil((deadline.deadlineElapsedMs - elapsedNowMs) / 1_000.0).toInt())
}

fun shouldReplaceDeadline(
    current: RestDeadline?,
    next: RestDeadline?,
    contextChanged: Boolean,
    elapsedNowMs: Long = SystemClock.elapsedRealtime(),
): Boolean {
    if (contextChanged) return true
    if (current == null || next == null) return current != next
    val currentRemaining = remainingFromDeadline(current, elapsedNowMs)
    val nextRemaining = remainingFromDeadline(next, elapsedNowMs)
    return abs(currentRemaining - nextRemaining) > 2
}

fun isRestSnapshotAtLeastAsRecent(currentUpdatedAt: String?, nextUpdatedAt: String?): Boolean {
    if (currentUpdatedAt.isNullOrBlank()) return true
    if (nextUpdatedAt.isNullOrBlank()) return false
    val current = runCatching { Instant.parse(currentUpdatedAt) }.getOrNull() ?: return true
    val next = runCatching { Instant.parse(nextUpdatedAt) }.getOrNull() ?: return true
    return !next.isBefore(current)
}

fun formatRest(seconds: Int): String {
    if (seconds <= 0) return "GO"
    if (seconds < 60) return seconds.toString()
    val minutes = seconds / 60
    val rest = seconds % 60
    return "$minutes:${rest.toString().padStart(2, '0')}"
}
