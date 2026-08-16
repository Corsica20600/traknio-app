package com.traknio.watch

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Shared, deliberately small sizing vocabulary for the round Wear layouts.
 * Values favour the 47 mm / 480 px Galaxy Watch Ultra while remaining safe on
 * the smaller round Wear OS presets.
 */
internal object WearDimensions {
    val roundHorizontalSafe: Dp = 19.dp
    val rectangularHorizontalSafe: Dp = 18.dp
    val roundVerticalSafe: Dp = 24.dp
    val compactVerticalSafe: Dp = 10.dp

    val listCardHeight: Dp = 52.dp
    val activeListCardHeight: Dp = 58.dp
    val setRowHeight: Dp = 48.dp
    val minimumActionHeight: Dp = 48.dp
    val cardRadius: Dp = 18.dp
    val contentWidthFraction = 0.88f
    val workoutListWidthFraction = 0.91f
}
