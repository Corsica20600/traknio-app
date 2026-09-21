package com.traknio.watch

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Insets for content that must remain legible and tappable inside a circular
 * display. The values are selected from the *actual* composable constraints,
 * not from a device model, so the same policy covers current and future round
 * Wear displays.
 */
internal data class WearSafeArea(
    val chromeHorizontal: Dp,
    val chromeVertical: Dp,
    val scrollHorizontal: Dp,
    val scrollTop: Dp,
    val scrollBottom: Dp,
)

/**
 * Shared, deliberately small sizing vocabulary for the round Wear layouts.
 * Values favour the 47 mm / 480 px Galaxy Watch Ultra while remaining safe on
 * the smaller round Wear OS presets.
 */
internal object WearDimensions {
    /**
     * A smaller round face loses proportionally more usable width near its
     * curved top and bottom. Lists receive enough trailing space to scroll the
     * first and last controls into the central, physical safe area.
     */
    fun safeArea(width: Dp, height: Dp): WearSafeArea = when {
        width <= 192.dp || height <= 192.dp -> WearSafeArea(
            chromeHorizontal = 18.dp,
            chromeVertical = 28.dp,
            scrollHorizontal = 6.dp,
            scrollTop = 12.dp,
            scrollBottom = 34.dp,
        )
        width <= 213.dp || height <= 213.dp -> WearSafeArea(
            chromeHorizontal = 17.dp,
            chromeVertical = 27.dp,
            scrollHorizontal = 6.dp,
            scrollTop = 13.dp,
            scrollBottom = 30.dp,
        )
        else -> WearSafeArea(
            chromeHorizontal = 16.dp,
            chromeVertical = 26.dp,
            scrollHorizontal = 5.dp,
            scrollTop = 14.dp,
            scrollBottom = 28.dp,
        )
    }

    val listCardHeight: Dp = 52.dp
    // Two-line exercise names plus a secondary status must never be compressed.
    val exerciseListCardHeight: Dp = 64.dp
    val activeListCardHeight: Dp = 58.dp
    val setRowHeight: Dp = 48.dp
    val minimumActionHeight: Dp = 48.dp
    val cardRadius: Dp = 18.dp
    val contentWidthFraction = 0.88f
    val workoutListWidthFraction = 0.91f
}
