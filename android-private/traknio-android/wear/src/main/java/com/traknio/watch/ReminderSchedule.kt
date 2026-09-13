package com.traknio.watch

import java.time.ZonedDateTime

internal fun nextReminderTime(now: ZonedDateTime, hour: Int): ZonedDateTime {
    val date = now.toLocalDate()
    val localHour = hour.coerceIn(0, 23)
    val today = date.atTime(localHour, 0).atZone(now.zone)
    return if (today.isAfter(now)) today else date.plusDays(1).atTime(localHour, 0).atZone(now.zone)
}
