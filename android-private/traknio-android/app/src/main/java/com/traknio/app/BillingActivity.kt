package com.traknio.app

import android.os.Bundle
import android.util.Log
import android.webkit.CookieManager
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.android.billingclient.api.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Native checkout: Play selects eligibility; the server alone grants entitlement. */
class BillingActivity : AppCompatActivity() {
    companion object { const val EXTRA_BASE_PLAN_ID = "com.traknio.app.EXTRA_BASE_PLAN_ID"; private const val DEFAULT_BASE_PLAN_ID = "monthly"; private const val TAG = "TraknioBilling" }
    private val baseUrl = BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/')
    private val productId = BuildConfig.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID
    private val packageNameForPlay = BuildConfig.GOOGLE_PLAY_PACKAGE_NAME
    private val trialOfferId = BuildConfig.GOOGLE_PLAY_TRIAL_OFFER_ID
    private val plan get() = intent.getStringExtra(EXTRA_BASE_PLAN_ID)?.trim()?.takeIf { it == "monthly" || it == "yearly" } ?: DEFAULT_BASE_PLAN_ID
    private lateinit var billingClient: BillingClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        billingClient = BillingClient.newBuilder(this).setListener(::onPurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).enableAutoServiceReconnection().build()
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) { if (result.responseCode == BillingClient.BillingResponseCode.OK) { queryExistingPurchases(); queryProduct() } else unavailable() }
            override fun onBillingServiceDisconnected() = Unit
        })
    }
    private fun event(name: String) = Log.i(TAG, "event=$name basePlan=$plan")
    private fun unavailable() { event("billing_products_failed"); showAndFinish("Google Play est indisponible. Réessaie dans un instant.") }
    private fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) = when (result.responseCode) {
        BillingClient.BillingResponseCode.OK -> purchases.orEmpty().forEach(::processPurchase)
        BillingClient.BillingResponseCode.USER_CANCELED -> { event("billing_purchase_cancelled"); finish() }
        else -> { event("billing_purchase_failed"); showAndFinish("Le paiement n’a pas abouti. Réessaie plus tard.") }
    }
    private fun queryExistingPurchases() = billingClient.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()) { r, purchases -> if (r.responseCode == BillingClient.BillingResponseCode.OK) purchases.filter { it.products.contains(productId) }.forEach(::processPurchase) }
    private fun queryProduct() {
        val product = QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(BillingClient.ProductType.SUBS).build()
        billingClient.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()) { r, result ->
            val details = result.productDetailsList.firstOrNull()
            if (r.responseCode != BillingClient.BillingResponseCode.OK || details == null) return@queryProductDetailsAsync unavailable()
            event("billing_products_loaded"); presentOffer(details)
        }
    }
    private fun presentOffer(details: ProductDetails) {
        val planOffers = details.subscriptionOfferDetails.orEmpty().filter { it.basePlanId == plan }
        val trial = if (plan == "monthly") planOffers.firstOrNull { it.offerId == trialOfferId } else null
        val selected = trial ?: planOffers.firstOrNull { it.offerId == null }
        if (selected == null) { event("billing_trial_offer_missing"); return showAndFinish("Cette formule n’est pas disponible dans Google Play.") }
        if (trial != null) event("billing_trial_offer_loaded") else if (plan == "monthly") event("billing_trial_offer_missing")
        val price = selected.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice ?: "le prix affiché par Google Play"
        val isTrial = trial != null && selected.pricingPhases.pricingPhaseList.any { it.priceAmountMicros == 0L }
        val period = if (plan == "yearly") "an" else "mois"
        val text = if (isTrial) "Découvre Traknio gratuitement pendant 7 jours. Puis $price / mois. Renouvellement automatique sauf résiliation depuis Google Play." else "$price / $period. Renouvellement automatique sauf résiliation depuis Google Play."
        AlertDialog.Builder(this).setTitle(if (isTrial) "7 jours gratuits" else "Traknio").setMessage(text)
            .setNegativeButton("Plus tard") { _, _ -> finish() }
            .setPositiveButton(if (isTrial) "Commencer mes 7 jours gratuits" else "S’abonner") { _, _ -> launchFlow(details, selected) }.show()
    }
    private fun launchFlow(details: ProductDetails, offer: ProductDetails.SubscriptionOfferDetails) {
        event("billing_purchase_started")
        val params = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).setOfferToken(offer.offerToken).build()
        if (billingClient.launchBillingFlow(this, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(params)).build()).responseCode != BillingClient.BillingResponseCode.OK) { event("billing_purchase_failed"); showAndFinish("Impossible d’ouvrir Google Play.") }
    }
    private fun processPurchase(purchase: Purchase) {
        if (!purchase.products.contains(productId)) return
        if (purchase.purchaseState == Purchase.PurchaseState.PENDING) { event("billing_purchase_pending"); Toast.makeText(this, "Paiement en attente de confirmation Google Play.", Toast.LENGTH_LONG).show(); return }
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        lifecycleScope.launch {
            val verified = withContext(Dispatchers.IO) { GooglePlayBillingApi.verifyPurchase(baseUrl, CookieManager.getInstance().getCookie(baseUrl), packageNameForPlay, productId, purchase.purchaseToken) }
            if (!verified.ok) { event("billing_entitlement_verification_failed"); return@launch showAndFinish("Achat reçu, validation serveur en attente. Réouvre Traknio dans un instant.") }
            event("billing_entitlement_verified")
            if (!purchase.isAcknowledged) acknowledge(purchase) else { event("billing_purchase_success"); showAndFinish(if (verified.active) "Premium activé" else "Abonnement synchronisé") }
        }
    }
    private fun acknowledge(purchase: Purchase) = billingClient.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()) { r -> if (r.responseCode == BillingClient.BillingResponseCode.OK) { event("billing_purchase_success"); showAndFinish("Premium activé") } else showAndFinish("Abonnement validé, confirmation Google en attente.") }
    private fun showAndFinish(message: String) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); finish() }
    override fun onDestroy() { if (::billingClient.isInitialized) billingClient.endConnection(); super.onDestroy() }
}
