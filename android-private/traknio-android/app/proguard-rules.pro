# The JavaScript name of methods exposed to the WebView is part of the web/native contract.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
