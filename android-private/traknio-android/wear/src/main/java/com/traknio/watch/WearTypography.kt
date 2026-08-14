package com.traknio.watch

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Traknio's Wear hierarchy mirrors the web app: Raleway titles, Exo 2 functional text
 * and Orbitron accents. The bundled variable fonts are official Google Fonts releases
 * (SIL Open Font License 1.1); their weight axis avoids shipping duplicate static files.
 */
@OptIn(ExperimentalTextApi::class)
object WearTypography {
    private fun variableFont(resourceId: Int, weight: FontWeight) = FontFamily(
        Font(
            resId = resourceId,
            weight = weight,
            variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
        ),
    )

    private val exo2Regular = variableFont(R.font.exo2_variable, FontWeight.Normal)
    private val exo2SemiBold = variableFont(R.font.exo2_variable, FontWeight.SemiBold)
    private val ralewaySemiBold = variableFont(R.font.raleway_variable, FontWeight.SemiBold)
    private val orbitronMedium = variableFont(R.font.orbitron_variable, FontWeight.Medium)

    val display = TextStyle(fontFamily = exo2SemiBold, fontWeight = FontWeight.SemiBold, fontSize = 40.sp, lineHeight = 40.sp)
    val title = TextStyle(fontFamily = ralewaySemiBold, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 16.sp)
    val label = TextStyle(fontFamily = exo2Regular, fontWeight = FontWeight.Normal, fontSize = 8.sp, letterSpacing = 0.8.sp)
    val action = TextStyle(fontFamily = exo2SemiBold, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.3.sp)
    val accent = TextStyle(fontFamily = orbitronMedium, fontWeight = FontWeight.Medium, fontSize = 9.sp, letterSpacing = 1.sp)
}
