package com.traknio.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZonedDateTime

class ReminderScheduleTest {
    @Test fun futureHourUsesToday() {
        val now = ZonedDateTime.parse("2026-09-13T12:30:00+02:00[Europe/Paris]")
        val next = nextReminderTime(now, 18)
        assertEquals(now.toLocalDate(), next.toLocalDate())
        assertEquals(18, next.hour)
    }
    @Test fun passedHourUsesTomorrow() {
        val now = ZonedDateTime.parse("2026-09-13T18:00:00+02:00[Europe/Paris]")
        assertEquals(now.toLocalDate().plusDays(1), nextReminderTime(now, 18).toLocalDate())
    }
    @Test fun springClockChangeProducesAFutureInstant() {
        val now = ZonedDateTime.parse("2026-03-29T01:30:00+01:00[Europe/Paris]")
        val next = nextReminderTime(now, 2)
        assertTrue(next.isAfter(now))
        assertEquals(3, next.hour)
    }
}
