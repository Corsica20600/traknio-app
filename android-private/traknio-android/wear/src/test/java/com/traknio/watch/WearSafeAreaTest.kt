package com.traknio.watch

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Guards the shared policy rather than letting individual screens drift apart. */
class WearSafeAreaTest {
    @Test
    fun `small round screen reserves the largest physical edge inset`() {
        val safe = WearDimensions.safeArea(192.dp, 192.dp)

        assertEquals(18.dp, safe.chromeHorizontal)
        assertEquals(28.dp, safe.chromeVertical)
        assertEquals(34.dp, safe.scrollBottom)
    }

    @Test
    fun `intermediate and large round screens keep a trailing scroll safe area`() {
        val intermediate = WearDimensions.safeArea(213.dp, 213.dp)
        val large = WearDimensions.safeArea(227.dp, 227.dp)

        assertTrue(intermediate.scrollBottom > intermediate.scrollTop)
        assertTrue(large.scrollBottom > large.scrollTop)
        assertTrue(intermediate.chromeHorizontal >= large.chromeHorizontal)
    }

    @Test
    fun `three 48dp circular controls fit the 192dp safe content width`() {
        val safe = WearDimensions.safeArea(192.dp, 192.dp)
        val usableWidth = 192.dp - (safe.chromeHorizontal * 2) - (safe.scrollHorizontal * 2)

        assertEquals(144.dp, usableWidth)
        assertEquals(144.dp, WearDimensions.minimumActionHeight * 3)
    }
}
