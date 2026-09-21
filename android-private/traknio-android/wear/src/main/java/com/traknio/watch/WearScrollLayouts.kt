package com.traknio.watch

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.AutoCenteringParams
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.PositionIndicator

/** The current round-display policy, supplied once by [WearSafeScreen]. */
internal val LocalWearSafeArea = staticCompositionLocalOf {
    WearDimensions.safeArea(227.dp, 227.dp)
}

/**
 * Shared root for every in-app Wear screen. It is intentionally the single
 * owner of the physical round-display insets; children only express their
 * content and scroll needs through [WearScrollColumn] or [WearScalingColumn].
 */
@Composable
internal fun WearSafeScreen(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier) {
        val safeArea = WearDimensions.safeArea(maxWidth, maxHeight)
        CompositionLocalProvider(LocalWearSafeArea provides safeArea) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(
                        horizontal = safeArea.chromeHorizontal,
                        vertical = safeArea.chromeVertical,
                    ),
                contentAlignment = Alignment.Center,
            ) { content() }
        }
    }
}

/** Retains the layout on large watches; allows overflow at 192dp or larger font scales. */
@Composable
internal fun WearScrollColumn(
    modifier: Modifier = Modifier,
    horizontalAlignment: Alignment.Horizontal = Alignment.CenterHorizontally,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable ColumnScope.() -> Unit,
) {
    val scrollState = rememberScrollState()
    BoxWithConstraints(modifier) {
        val viewportHeight = maxHeight
        val safeArea = LocalWearSafeArea.current
        // Keep a deliberately larger trailing inset: without it the final card
        // can stop in the bottom curve, even though the list itself technically
        // remains scrollable.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .heightIn(min = viewportHeight)
                .padding(
                    start = safeArea.scrollHorizontal,
                    end = safeArea.scrollHorizontal,
                    top = safeArea.scrollTop,
                    bottom = safeArea.scrollBottom,
                ),
            horizontalAlignment = horizontalAlignment,
            verticalArrangement = verticalArrangement,
            content = content,
        )
        PositionIndicator(scrollState = scrollState)
    }
}

@Composable
internal fun WearScalingColumn(
    modifier: Modifier = Modifier,
    state: ScalingLazyListState = rememberScalingLazyListState(),
    horizontalAlignment: Alignment.Horizontal = Alignment.CenterHorizontally,
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(4.dp),
    autoCentering: AutoCenteringParams? = AutoCenteringParams(),
    content: ScalingLazyListScope.() -> Unit,
) {
    Box(modifier) {
        val safeArea = LocalWearSafeArea.current
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = safeArea.scrollHorizontal),
            state = state,
            horizontalAlignment = horizontalAlignment, verticalArrangement = verticalArrangement,
            autoCentering = autoCentering,
            contentPadding = PaddingValues(top = safeArea.scrollTop, bottom = safeArea.scrollBottom),
            content = content,
        )
        PositionIndicator(scalingLazyListState = state)
    }
}
