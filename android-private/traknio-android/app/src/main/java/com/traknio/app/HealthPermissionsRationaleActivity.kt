package com.traknio.app

import android.os.Bundle
import android.content.Intent
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.text.util.Linkify
import android.text.method.LinkMovementMethod
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class HealthPermissionsRationaleActivity : AppCompatActivity() {
    private var policyView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.title = "Confidentialité · Health Connect"
        // Same public document as Play Console. No JavaScript/native bridge,
        // file access or health permission is needed to read this policy.
        policyView = WebView(this).apply {
            settings.javaScriptEnabled = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.toString() == POLICY_URL) return false
                    if (request.url.scheme in listOf("https", "mailto")) {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    }
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (!request.isForMainFrame) return
                    setContentView(TextView(this@HealthPermissionsRationaleActivity).apply {
                        autoLinkMask = Linkify.WEB_URLS
                        text = "La politique complète n'a pas pu être chargée. Vérifiez votre connexion puis ouvrez :\n\n$POLICY_URL"
                        textSize = 18f
                        setPadding(32, 32, 32, 32)
                        movementMethod = LinkMovementMethod.getInstance()
                    })
                }
            }
        }
        setContentView(policyView)
        policyView?.loadUrl(POLICY_URL)
    }

    override fun onDestroy() {
        policyView?.destroy()
        policyView = null
        super.onDestroy()
    }

    companion object {
        const val POLICY_URL = "https://www.traknio.com/legal/privacy"
    }
}
