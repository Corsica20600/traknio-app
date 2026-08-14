package com.traknio.watch

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Wear counterpart of Traknio's web hierarchy: Raleway titles, Exo 2 functional text
 * and Orbitron metric/accent roles. The web fonts are not Android resources, so this
 * uses the project's existing system-sans fallback rather than adding a new font asset.
 */
object WearTypography {
    private val functional = FontFamily.SansSerif

    val display = TextStyle(fontFamily = functional, fontWeight = FontWeight.Black, fontSize = 40.sp, lineHeight = 40.sp)
    val title = TextStyle(fontFamily = functional, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 16.sp)
    val label = TextStyle(fontFamily = functional, fontWeight = FontWeight.Bold, fontSize = 8.sp, letterSpacing = 0.8.sp)
    val action = TextStyle(fontFamily = functional, fontWeight = FontWeight.Black, fontSize = 11.sp, letterSpacing = 0.3.sp)
    val accent = TextStyle(fontFamily = functional, fontWeight = FontWeight.Black, fontSize = 9.sp, letterSpacing = 1.sp)
}
