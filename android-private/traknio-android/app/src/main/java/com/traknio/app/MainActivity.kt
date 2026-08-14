package com.traknio.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceResponse
import android.webkit.WebResourceRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.util.Log
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.traknio.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_INITIAL_PATH = "com.traknio.app.EXTRA_INITIAL_PATH"
    }

    private lateinit var binding: ActivityMainBinding
    private val traknioUrl = BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/')
    private val allowedHosts = setOfNotNull(Uri.parse(traknioUrl).host?.lowercase())
    private val samsungFallbackUrl = "https://www.samsung.com/global/galaxy/apps/samsung-health/"
    private val spotifyFallbackUrl = "https://open.spotify.com/"
    private val supportedImageMimeTypes = arrayOf("image/jpeg", "image/png", "image/webp")
    private var fileChooserCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    private var isInitialPageLoad = true
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileChooserCallback ?: return@registerForActivityResult
        fileChooserCallback = null
        val selectedUris = extractSelectedImageUris(result.resultCode, result.data)
        logFileChooser("result resultCode=${result.resultCode} delivered=${selectedUris?.size ?: 0}")
        callback.onReceiveValue(selectedUris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setBackgroundDrawableResource(R.color.traknio_system_bar)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        HealthSyncWorker.schedule(applicationContext)
        HealthSyncWorker.runSoon(applicationContext)

        applyDarkSystemBars()
        supportActionBar?.hide()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webViewTraknio.canGoBack()) {
                    binding.webViewTraknio.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        setupWebView()
        binding.webRetryButton.setOnClickListener {
            binding.webErrorPanel.visibility = View.GONE
            binding.webViewTraknio.reload()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::binding.isInitialized) {
            binding.webViewTraknio.onResume()
            binding.webViewTraknio.resumeTimers()
            updateWorkoutScreenPolicy(binding.webViewTraknio.url)
            binding.webViewTraknio.evaluateJavascript(
                "window.dispatchEvent(new Event('traknio:app-resume'));",
                null,
            )
            PhoneWearAccountSync.broadcastConnectedAccount(applicationContext)
        }
    }

    override fun onPause() {
        if (::binding.isInitialized) {
            binding.webViewTraknio.onPause()
            CookieManager.getInstance().flush()
        }
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)

        val authCallbackUrl = getAuthCallbackUrl(intent) ?: return
        // Do not log the URL: it contains OAuth state and authorization parameters.
        Log.i("TraknioAuth", "OAuth callback received; completing it in the WebView")
        binding.webViewTraknio.loadUrl(authCallbackUrl)
    }

    private fun applyDarkSystemBars() {
        window.statusBarColor = Color.rgb(3, 7, 18)
        window.navigationBarColor = Color.rgb(3, 7, 18)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.setSystemBarsAppearance(
                0,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = 0
        }
    }

    private fun setupWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(binding.webViewTraknio, true)
        binding.webViewTraknio.settings.javaScriptEnabled = true
        binding.webViewTraknio.settings.domStorageEnabled = true
        binding.webViewTraknio.settings.databaseEnabled = true
        binding.webViewTraknio.settings.loadsImagesAutomatically = true
        binding.webViewTraknio.settings.allowContentAccess = true
        binding.webViewTraknio.setBackgroundColor(Color.rgb(10, 19, 40))
        binding.webViewTraknio.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (binding.launchOverlay.visibility == View.VISIBLE) {
                    binding.launchProgress.progress = newProgress.coerceIn(0, 100)
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: android.webkit.ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                if (filePathCallback == null) return false

                return runCatching {
                    logFileChooser("request acceptTypes=${fileChooserParams?.acceptTypes?.joinToString() ?: "default"}")
                    fileChooserLauncher.launch(buildImagePickerIntent(fileChooserParams))
                    true
                }.getOrElse {
                    logFileChooser("launch_failed error=${it.javaClass.simpleName}")
                    fileChooserCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }
        }
        binding.webViewTraknio.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                updateWorkoutScreenPolicy(url)
                binding.webErrorPanel.visibility = View.GONE
                binding.webLoading.visibility = View.VISIBLE
                if (isInitialPageLoad) {
                    binding.launchOverlay.visibility = View.VISIBLE
                    binding.launchOverlay.alpha = 1f
                    binding.launchProgress.progress = 0
                }
            }

            override fun onPageCommitVisible(view: WebView?, url: String?) {
                super.onPageCommitVisible(view, url)
                updateWorkoutScreenPolicy(url)
                hideLaunchOverlay()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                updateWorkoutScreenPolicy(url)
                // Auth.js writes its persistent, HttpOnly session cookie during the callback.
                // Explicitly flush it so it survives process termination and normal device reboot.
                CookieManager.getInstance().flush()
                PhoneWearAccountSync.broadcastConnectedAccount(applicationContext)
                binding.webLoading.visibility = View.GONE
                hideLaunchOverlay()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    showWebError()
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                val statusCode = errorResponse?.statusCode ?: return
                if (request?.isForMainFrame == true && statusCode >= 500) {
                    showWebError()
                }
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url.isNullOrBlank()) return false
                return handleNavigationUrl(url)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url?.toString() ?: return false
                return handleNavigationUrl(target)
            }
        }
        binding.webViewTraknio.loadUrl(buildInitialUrl())
    }

    private fun updateWorkoutScreenPolicy(url: String?) {
        val uri = runCatching { Uri.parse(url.orEmpty()) }.getOrNull()
        val keepScreenOn = uri?.path?.startsWith("/workout") == true
        binding.webViewTraknio.keepScreenOn = keepScreenOn
        if (keepScreenOn) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private fun buildImagePickerIntent(fileChooserParams: WebChromeClient.FileChooserParams?): Intent {
        val requestedTypes = fileChooserParams?.acceptTypes
            ?.map { it.trim().lowercase() }
            ?.filter { it in supportedImageMimeTypes }
            ?.ifEmpty { supportedImageMimeTypes.toList() }
            ?: supportedImageMimeTypes.toList()

        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
            putExtra(Intent.EXTRA_MIME_TYPES, requestedTypes.toTypedArray())
            putExtra(
                Intent.EXTRA_ALLOW_MULTIPLE,
                fileChooserParams?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE,
            )
        }
    }

    private fun extractSelectedImageUris(resultCode: Int, data: Intent?): Array<Uri>? {
        if (resultCode != Activity.RESULT_OK || data == null) {
            logFileChooser("result_cancelled resultCode=$resultCode")
            return null
        }
        val candidates = buildList {
            data.data?.let(::add)
            data.clipData?.let { clip ->
                for (index in 0 until clip.itemCount) {
                    clip.getItemAt(index).uri?.let(::add)
                }
            }
        }
        return candidates
            .distinct()
            .filter { uri ->
                val mimeType = normalizeImageMimeType(contentResolver.getType(uri))
                // DocumentsUI may omit the MIME type for a valid content:// URI. Let WebView pass it
                // through; the browser and server signature checks remain the final validation.
                val accepted = mimeType == null || mimeType in supportedImageMimeTypes
                logFileChooser("uri_received mime=${mimeType ?: "unknown"} accepted=$accepted")
                accepted
            }
            .toTypedArray()
            .takeIf { it.isNotEmpty() }
    }

    private fun normalizeImageMimeType(mimeType: String?): String? = when (mimeType?.lowercase()) {
        "image/jpg", "image/pjpeg" -> "image/jpeg"
        "image/x-png" -> "image/png"
        else -> mimeType?.lowercase()
    }

    private fun logFileChooser(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d("TraknioPhoto", "FILE_CHOOSER $message")
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        CookieManager.getInstance().flush()
        super.onDestroy()
    }

    private fun showWebError() {
        binding.webLoading.visibility = View.GONE
        binding.launchOverlay.visibility = View.GONE
        binding.webErrorPanel.visibility = View.VISIBLE
    }

    private fun hideLaunchOverlay() {
        if (binding.launchOverlay.visibility != View.VISIBLE) return
        isInitialPageLoad = false
        binding.launchProgress.progress = 100
        binding.launchOverlay.animate()
            .alpha(0f)
            .setDuration(180L)
            .withEndAction {
                binding.launchOverlay.visibility = View.GONE
                binding.launchOverlay.alpha = 1f
                binding.launchProgress.progress = 0
            }
            .start()
    }

    private fun buildInitialUrl(): String {
        getAuthCallbackUrl(intent)?.let { return it }
        val path = intent.getStringExtra(EXTRA_INITIAL_PATH)?.trim().orEmpty()
        if (path.isBlank()) return "$traknioUrl/dashboard"
        val safePath = if (path.startsWith("/")) path else "/$path"
        return traknioUrl + safePath
    }

    private fun getAuthCallbackUrl(intent: Intent): String? {
        val uri = intent.data ?: return null
        return uri.takeIf(::isTraknioAuthCallback)?.toString()
    }

    private fun isTraknioAuthCallback(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        return scheme == "https" &&
            host in allowedHosts &&
            uri.path?.startsWith("/api/auth/callback/") == true
    }

    private fun handleNavigationUrl(rawUrl: String): Boolean {
        val uri = runCatching { Uri.parse(rawUrl) }.getOrNull() ?: return false
        val scheme = uri.scheme?.lowercase().orEmpty()
        val host = uri.host?.lowercase().orEmpty()

        if (scheme == "traknio" && host == "health-sync") {
            startActivity(Intent(this, SyncHealthActivity::class.java))
            return true
        }

        if (scheme == "traknio" && host == "billing" && uri.path == "/google-play") {
            val billingIntent = Intent(this, BillingActivity::class.java).apply {
                putExtra(BillingActivity.EXTRA_BASE_PLAN_ID, uri.getQueryParameter("plan").orEmpty())
            }
            startActivity(billingIntent)
            return true
        }

        if ((scheme == "http" || scheme == "https") && allowedHosts.any { host == it || host.endsWith(".$it") }) {
            return false
        }

        if (scheme == "http" || scheme == "https") {
            return openExternalSafely(Intent(Intent.ACTION_VIEW, uri))
        }

        if (scheme == "intent") {
            val intent = runCatching { Intent.parseUri(rawUrl, Intent.URI_INTENT_SCHEME) }.getOrNull()
            if (intent != null && openExternalSafely(intent)) return true
            if (rawUrl.contains("spotify", ignoreCase = true)) {
                if (!openExternalSafely(Intent(Intent.ACTION_VIEW, Uri.parse(spotifyFallbackUrl)))) {
                    Toast.makeText(this, "Spotify indisponible sur cet appareil.", Toast.LENGTH_SHORT).show()
                }
            } else {
                if (!openExternalSafely(Intent(Intent.ACTION_VIEW, Uri.parse(samsungFallbackUrl)))) {
                    Toast.makeText(this, "Application externe indisponible sur cet appareil.", Toast.LENGTH_SHORT).show()
                }
            }
            return true
        }

        val opened = openExternalSafely(Intent(Intent.ACTION_VIEW, uri))
        if (!opened) {
            Toast.makeText(this, "Application non disponible pour ce lien.", Toast.LENGTH_SHORT).show()
        }
        return true
    }

    private fun openExternalSafely(intent: Intent): Boolean {
        return try {
            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }
}
