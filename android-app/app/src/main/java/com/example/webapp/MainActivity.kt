package com.example.webapp

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color as GColor
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Base64
import android.util.Log
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.AbsListView
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.annotation.Keep
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.edit
import androidx.core.graphics.createBitmap
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media.app.NotificationCompat as MediaNotificationCompat
import androidx.media.session.MediaButtonReceiver
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var customViewContainer: FrameLayout
    private lateinit var topStatusScrim: View
    private lateinit var bottomNavScrim: View
    private lateinit var mediaSession: MediaSessionCompat

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    // Rapid double back-press quick exit state
    private var lastBackClickTime: Long = 0
    private var isExitArmed: Boolean = false
    private var backToast: Toast? = null
    private var armedTimerRunnable: Runnable? = null

    // Real-time media playback state
    private var currentMediaTitle: String = "WebApp Stream"
    private var currentMediaArtist: String = "WebApp"
    private var currentDurationSec: Double = 0.0
    private var currentPositionSec: Double = 0.0
    private var currentIsPlaying: Boolean = false

    private val notificationHandler = Handler(Looper.getMainLooper())
    private val cancelNotificationRunnable = Runnable {
        if (!currentIsPlaying) {
            cancelMediaNotification()
        }
    }

    // 1x1 transparent PNG byte array for AdBlock image blocking
    private val transparent1x1Png = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(), 0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte(),
        0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x0D.toByte(), 0x49.toByte(), 0x48.toByte(), 0x44.toByte(), 0x52.toByte(),
        0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(),
        0x08.toByte(), 0x06.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x1F.toByte(), 0x15.toByte(), 0xC4.toByte(),
        0x89.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x0A.toByte(), 0x49.toByte(), 0x44.toByte(), 0x41.toByte(),
        0x54.toByte(), 0x78.toByte(), 0x9C.toByte(), 0x63.toByte(), 0x00.toByte(), 0x01.toByte(), 0x00.toByte(), 0x00.toByte(),
        0x05.toByte(), 0x00.toByte(), 0x01.toByte(), 0x0D.toByte(), 0x0A.toByte(), 0x2D.toByte(), 0xB4.toByte(), 0x00.toByte(),
        0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x49.toByte(), 0x45.toByte(), 0x4E.toByte(), 0x44.toByte(), 0xAE.toByte(),
        0x42.toByte(), 0x60.toByte(), 0x82.toByte()
    )

    private companion object {
        const val MEDIA_CHANNEL_ID = "app_media_channel"
        const val MEDIA_NOTIFICATION_ID = 1001
    }

    // Standard Network Interceptor for Streaming Aggregator Header Stripping
    private val okHttpClient = OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    // Persistent 2 GB Native Image Disk Cache (TMDB, AniList, Fanart, Posters, Backdrops)
    val imageDiskCache by lazy {
        try { File(filesDir, "app_image_cache").deleteRecursively() } catch (_: Exception) {}
        try { File(filesDir, "app_image_cache_v2").deleteRecursively() } catch (_: Exception) {}
        Cache(File(cacheDir, "app_image_cache_v3"), 2048L * 1024 * 1024)
    }

    @Volatile
    private var cachedUserAgent: String = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    private val imageOkHttpClient by lazy {
        OkHttpClient.Builder()
            .cache(imageDiskCache)
            .connectionPool(okhttp3.ConnectionPool(16, 5, TimeUnit.MINUTES))
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addNetworkInterceptor { chain ->
                val cleanRequest = chain.request().newBuilder()
                    .removeHeader("Cache-Control")
                    .removeHeader("Pragma")
                    .build()
                val originalResponse = chain.proceed(cleanRequest)
                originalResponse.newBuilder()
                    .header("Cache-Control", "public, max-age=31536000, max-stale=31536000, immutable")
                    .removeHeader("Pragma")
                    .removeHeader("Expires")
                    .removeHeader("Vary")
                    .removeHeader("Set-Cookie")
                    .build()
            }
            .build()
    }

    private fun dirSizeBytes(file: File?, excludeNames: Set<String> = emptySet()): Long {
        if (file == null || !file.exists()) return 0L
        if (excludeNames.contains(file.name)) return 0L
        if (file.isFile) return file.length()
        var total = 0L
        val children = file.listFiles() ?: return 0L
        for (child in children) {
            total += dirSizeBytes(child, excludeNames)
        }
        return total
    }

    fun getImageCacheBytes(): Long {
        var total = dirSizeBytes(File(cacheDir, "app_image_cache_v3"))
        total += dirSizeBytes(File(filesDir, "app_image_cache"))
        total += dirSizeBytes(File(filesDir, "app_image_cache_v2"))
        total += dirSizeBytes(File(cacheDir, "app_image_cache"))
        total += dirSizeBytes(File(cacheDir, "app_image_cache_v2"))
        return total
    }

    fun getStorageStatsJson(): String {
        val imageExcludes = setOf("app_image_cache_v3", "app_image_cache", "app_image_cache_v2")
        val imageCacheBytes = getImageCacheBytes()
        val dataRoot = File(applicationInfo.dataDir)
        val webViewCacheExcludes = setOf("Cache", "Code Cache", "GPUCache", "GrShaderCache", "ShaderCache")
        val webViewAllExcludes = webViewCacheExcludes + setOf("IndexedDB", "Local Storage")
        val nativeCacheBytes =
            dirSizeBytes(cacheDir, imageExcludes) +
                    dirSizeBytes(codeCacheDir) +
                    dirSizeBytes(externalCacheDir) +
                    dirSizeBytes(File(dataRoot, "app_webview/Default/Cache")) +
                    dirSizeBytes(File(dataRoot, "app_webview/Default/Code Cache")) +
                    dirSizeBytes(File(dataRoot, "app_webview/Default/GPUCache"))
        val nativeUserDataBytes =
            dirSizeBytes(filesDir, imageExcludes) +
                    dirSizeBytes(File(dataRoot, "shared_prefs")) +
                    dirSizeBytes(File(dataRoot, "databases")) +
                    dirSizeBytes(File(dataRoot, "app_webview"), webViewAllExcludes)
        return """{"imageCacheBytes":$imageCacheBytes,"nativeCacheBytes":$nativeCacheBytes,"nativeUserDataBytes":$nativeUserDataBytes}"""
    }

    fun purgeImageDiskCacheSync(): Long {
        var clearedBytes = 0L
        try {
            clearedBytes = getImageCacheBytes()
            try { File(filesDir, "app_image_cache").deleteRecursively() } catch (_: Exception) {}
            try { File(filesDir, "app_image_cache_v2").deleteRecursively() } catch (_: Exception) {}
            try { File(cacheDir, "app_image_cache").deleteRecursively() } catch (_: Exception) {}
            try { File(cacheDir, "app_image_cache_v2").deleteRecursively() } catch (_: Exception) {}
            imageDiskCache.evictAll()
            imageDiskCache.flush()
            val v3Dir = File(cacheDir, "app_image_cache_v3")
            val remaining = dirSizeBytes(v3Dir)
            if (remaining > 1024L * 1024L) {
                v3Dir.listFiles()?.forEach { f ->
                    if (f.name != "journal") {
                        try { f.deleteRecursively() } catch (_: Exception) {}
                    }
                }
            }
            val sizeMb = clearedBytes / (1024 * 1024)
            Log.d("WebApp", "Purged 2 GB image disk cache successfully ($sizeMb MB cleared).")
        } catch (e: Exception) {
            Log.e("WebApp", "Error purging image disk cache: ${e.localizedMessage}", e)
        }
        return clearedBytes
    }

    fun purgeImageDiskCache() {
        Thread {
            purgeImageDiskCacheSync()
        }.start()
    }

    private val defaultTargetDomains = listOf(
        "example.com",
    )

    @Keep
    class WebAppInterface(private val activity: MainActivity, private val defaultDomains: List<String>) {
        @JavascriptInterface
        fun setDomainWhitelist(domains: String) {
            val prefs = activity.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
            prefs.edit { putString("whitelisted_domains", domains) }
            Log.d("WebApp", "Updated domain whitelist: $domains")
        }

        @JavascriptInterface
        fun getDomainWhitelist(): String {
            val prefs = activity.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
            val saved = prefs.getString("whitelisted_domains", null)
            val custom = if (!saved.isNullOrBlank()) {
                saved.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }
            } else {
                emptyList()
            }
            return (defaultDomains + custom).distinct().joinToString(",")
        }

        @JavascriptInterface
        fun setPlayingState(isPlaying: Boolean) {
            Log.d("WebApp", "setPlayingState: $isPlaying")
            activity.runOnUiThread {
                activity.updateMediaMetadataAndNotification(
                    activity.currentMediaTitle,
                    "WebApp",
                    activity.currentDurationSec,
                    activity.currentPositionSec,
                    isPlaying
                )
            }
        }

        @JavascriptInterface
        fun updateWatchTitle(title: String) {
            if (title.isNotBlank() && !title.startsWith("http", ignoreCase = true)) {
                activity.currentMediaTitle = title
            }
        }

        @JavascriptInterface
        fun updateMediaMetadata(title: String, artist: String, durationSec: Double, positionSec: Double, isPlaying: Boolean) {
            activity.runOnUiThread {
                if (title.isNotBlank() && !title.startsWith("http", ignoreCase = true) && !title.equals("WebApp Stream", ignoreCase = true)) {
                    activity.currentMediaTitle = title
                }
                activity.updateMediaMetadataAndNotification(activity.currentMediaTitle, "WebApp", durationSec, positionSec, isPlaying)
            }
        }

        @JavascriptInterface
        fun purgeImageDiskCache(): Long {
            return activity.purgeImageDiskCacheSync()
        }

        @JavascriptInterface
        fun getStorageStatsJson(): String {
            return activity.getStorageStatsJson()
        }
    }

    private fun getSavedWhitelist(): List<String> {
        val prefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
        val saved = prefs.getString("whitelisted_domains", null)
        val custom = if (!saved.isNullOrBlank()) {
            saved.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        } else {
            emptyList()
        }
        return (defaultTargetDomains + custom).distinct()
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize AdBlock Engine (Loads local filter.txt & syncs background updates)
        AdBlockEngine.getInstance().init(this)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = GColor.TRANSPARENT
        window.navigationBarColor = GColor.TRANSPARENT

        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }

        // Initialize System MediaSession for Dynamic Island and Lockscreen Control
        setupMediaSession()

        // Create Media Notification Channel & Request Runtime Permissions on Android 13+
        createNotificationChannel()
        requestNotificationPermission()

        webView = findViewById(R.id.webView)
        customViewContainer = findViewById(R.id.customViewContainer)
        topStatusScrim = findViewById(R.id.topStatusScrim)
        bottomNavScrim = findViewById(R.id.bottomNavScrim)

        // Disable WebView scrollbars for native app appearance
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main_root)) { _, insets ->
            val statusBarHeight = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            val navBarHeight = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom

            val topParams = topStatusScrim.layoutParams
            topParams.height = statusBarHeight
            topStatusScrim.layoutParams = topParams

            val bottomParams = bottomNavScrim.layoutParams
            bottomParams.height = navBarHeight
            bottomNavScrim.layoutParams = bottomParams

            insets
        }

        val settings: WebSettings = webView.settings
        cachedUserAgent = settings.userAgentString
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.blockNetworkLoads = false
        settings.blockNetworkImage = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.setSupportMultipleWindows(false)
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            val databasePath = applicationContext.getDir("databases", Context.MODE_PRIVATE).path
            settings.databasePath = databasePath
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            settings.allowUniversalAccessFromFileURLs = true
            settings.allowFileAccessFromFileURLs = true
        }

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true)
        }

        webView.addJavascriptInterface(WebAppInterface(this, defaultTargetDomains), "AndroidBridge")

        // Enable debugging only in Debug builds for Play Protect compliance
        if (com.example.webapp.BuildConfig.DEBUG && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun getDefaultVideoPoster(): Bitmap {
                return createBitmap(1, 1).apply {
                    eraseColor(GColor.BLACK)
                }
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                if (!title.isNullOrBlank() && !title.startsWith("app", ignoreCase = true) && !title.startsWith("http", ignoreCase = true)) {
                    currentMediaTitle = title
                }
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                webView.visibility = View.GONE
                topStatusScrim.visibility = View.GONE
                bottomNavScrim.visibility = View.GONE

                customViewContainer.visibility = View.VISIBLE
                customViewContainer.addView(view)
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

                // Show Media Notification for Fullscreen Video Playback
                updateMediaMetadataAndNotification(currentMediaTitle, "WebApp", currentDurationSec, currentPositionSec, true)
            }

            override fun onHideCustomView() {
                if (customView == null) return
                customView?.visibility = View.GONE
                customViewContainer.removeView(customView)
                customView = null
                customViewContainer.visibility = View.GONE
                customViewCallback?.onCustomViewHidden()

                webView.visibility = View.VISIBLE
                topStatusScrim.visibility = View.VISIBLE
                bottomNavScrim.visibility = View.VISIBLE
                controller.show(WindowInsetsCompat.Type.systemBars())

                // Dismiss Media Notification
                cancelMediaNotification()
            }
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("app.local")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectMediaObserverScript()
            }

            override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                // Automatically dismiss media notification if navigating away from watch/streaming page
                if (url != null && !url.contains("view=watch", ignoreCase = true) && customView == null) {
                    cancelMediaNotification()
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (request.isForMainFrame) {
                    if (!url.contains("view=watch", ignoreCase = true) && customView == null) {
                        cancelMediaNotification()
                    }
                }
                return request.isForMainFrame && !url.startsWith("https://app.local/")
            }

            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val url = request?.url?.toString() ?: return super.shouldInterceptRequest(view, request)

                // 0. Intercept VAST / IMA / Ad Tag requests & AdBlock Engine with Media Safeguards
                val isMediaStream = url.contains(".m3u8", ignoreCase = true) ||
                        url.contains(".ts", ignoreCase = true) ||
                        url.contains(".mp4", ignoreCase = true) ||
                        url.contains(".webm", ignoreCase = true) ||
                        url.contains(".key", ignoreCase = true) ||
                        url.contains(".m4s", ignoreCase = true)

                val reqHost = request.url?.host?.lowercase() ?: ""
                val isAdOrVastTag = !isMediaStream && (
                        reqHost.contains("doubleclick") ||
                                reqHost.contains("googleads") ||
                                reqHost.contains("pagead") ||
                                reqHost.contains("adserver") ||
                                reqHost.contains("adsystem") ||
                                reqHost.contains("popads") ||
                                url.contains("vast", ignoreCase = true) ||
                                url.contains("vmap", ignoreCase = true) ||
                                url.contains("ad_type=", ignoreCase = true) ||
                                url.contains("/ad/", ignoreCase = true)
                        )

                if (!isInPictureInPictureMode && !isMediaStream && (isAdOrVastTag || AdBlockEngine.getInstance().isBlocked(request.url))) {
                    Log.d("WebApp", "AdBlock Intercepted: $url")
                    val path = request.url.path?.lowercase() ?: ""
                    val acceptHeader = request.requestHeaders?.get("Accept")?.lowercase() ?: request.requestHeaders?.get("accept")?.lowercase() ?: ""
                    val secDest = request.requestHeaders?.get("Sec-Fetch-Dest")?.lowercase() ?: request.requestHeaders?.get("sec-fetch-dest")?.lowercase() ?: ""

                    if (acceptHeader.contains("xml") || url.contains(".xml", ignoreCase = true)) {
                        return WebResourceResponse("text/xml", "UTF-8", 200, "OK", mapOf("Access-Control-Allow-Origin" to "*"), ByteArrayInputStream("<VAST version=\"4.0\"></VAST>".toByteArray()))
                    }

                    return when {
                        path.endsWith(".js") || acceptHeader.contains("javascript") || secDest == "script" -> {
                            WebResourceResponse("application/javascript", "UTF-8", ByteArrayInputStream(ByteArray(0)))
                        }
                        path.endsWith(".css") || acceptHeader.contains("text/css") || secDest == "style" -> {
                            WebResourceResponse("text/css", "UTF-8", ByteArrayInputStream(ByteArray(0)))
                        }
                        path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".gif") || path.endsWith(".webp") || path.endsWith(".svg") || acceptHeader.contains("image/") || secDest == "image" -> {
                            WebResourceResponse("image/png", "UTF-8", ByteArrayInputStream(transparent1x1Png))
                        }
                        secDest == "iframe" || secDest == "frame" || secDest == "document" || acceptHeader.contains("text/html") -> {
                            WebResourceResponse("text/html", "UTF-8", ByteArrayInputStream("<!DOCTYPE html><html><head><style>html,body{background:transparent!important;margin:0;padding:0;width:0;height:0;overflow:hidden;pointer-events:none;}</style></head><body></body></html>".toByteArray()))
                        }
                        else -> {
                            WebResourceResponse("application/json", "UTF-8", 200, "OK", mapOf("Access-Control-Allow-Origin" to "*"), ByteArrayInputStream("{}".toByteArray()))
                        }
                    }
                }

                // 1. Intercept app.local and serve plain unencrypted assets from assets/
                if (url.startsWith("https://app.local/", ignoreCase = true)) {
                    val path = request.url.path
                    if (path == null || path == "/") {
                        val indexUri = android.net.Uri.parse("https://app.local/index.html")
                        return assetLoader.shouldInterceptRequest(indexUri)
                    }
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                // 2. 2 GB Native Image Disk Cache Interceptor with Progressive Stream Forwarding
                val path = request.url.path?.lowercase() ?: ""
                val acceptHeader = request.requestHeaders?.get("Accept") ?: request.requestHeaders?.get("accept") ?: ""
                val secFetchDest = request.requestHeaders?.get("Sec-Fetch-Dest") ?: request.requestHeaders?.get("sec-fetch-dest") ?: ""
                val isDocOrIframe = request.isForMainFrame ||
                        secFetchDest.equals("iframe", ignoreCase = true) ||
                        secFetchDest.equals("frame", ignoreCase = true) ||
                        secFetchDest.equals("document", ignoreCase = true) ||
                        acceptHeader.contains("text/html", ignoreCase = true)
                val isImageRequest = !isDocOrIframe && (
                        url.contains("image.tmdb.org", ignoreCase = true) ||
                                url.contains("anilist.co/file/anilistcdn", ignoreCase = true) ||
                                url.contains("fanart.tv", ignoreCase = true) ||
                                url.contains("media-amazon.com", ignoreCase = true) ||
                                url.contains("tvmaze.com", ignoreCase = true) ||
                                path.endsWith(".jpg") || path.endsWith(".jpeg") ||
                                path.endsWith(".png") || path.endsWith(".webp") ||
                                path.endsWith(".svg") || path.endsWith(".gif") ||
                                path.endsWith(".ico") || path.endsWith(".avif") ||
                                secFetchDest.equals("image", ignoreCase = true) ||
                                acceptHeader.startsWith("image/", ignoreCase = true))
                if (request.method.equals("GET", ignoreCase = true) && isImageRequest && !url.startsWith("https://app.local/", ignoreCase = true)) {
                    try {
                        val rawContentType = when {
                            path.endsWith(".png") -> "image/png"
                            path.endsWith(".webp") -> "image/webp"
                            path.endsWith(".svg") -> "image/svg+xml"
                            path.endsWith(".gif") -> "image/gif"
                            path.endsWith(".avif") -> "image/avif"
                            else -> "image/jpeg"
                        }
                        val cacheOnlyRequest = Request.Builder()
                            .url(url)
                            .header("User-Agent", cachedUserAgent)
                            .cacheControl(okhttp3.CacheControl.FORCE_CACHE)
                            .build()
                        val cachedResponse = imageOkHttpClient.newCall(cacheOnlyRequest).execute()
                        val cachedBody = cachedResponse.body
                        val headerType = cachedResponse.header("Content-Type")?.split(";")?.get(0)?.trim()
                        if (cachedResponse.isSuccessful && cachedBody != null && (headerType == null || headerType.startsWith("image/", ignoreCase = true))) {
                            val mimeType = if (!headerType.isNullOrEmpty() && headerType.startsWith("image/", ignoreCase = true)) headerType else rawContentType
                            val encoding = if (mimeType == "image/svg+xml") "UTF-8" else null
                            val resHeaders = mapOf(
                                "Cache-Control" to "public, max-age=31536000, immutable",
                                "Access-Control-Allow-Origin" to "*"
                            )
                            return WebResourceResponse(mimeType, encoding, 200, "OK", resHeaders, cachedBody.byteStream())
                        } else {
                            cachedBody?.close()
                            val netRequest = Request.Builder()
                                .url(url)
                                .header("User-Agent", cachedUserAgent)
                                .build()
                            imageOkHttpClient.newCall(netRequest).enqueue(object : okhttp3.Callback {
                                override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {}
                                override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                                    try {
                                        val ct = response.header("Content-Type") ?: ""
                                        if (ct.startsWith("image/", ignoreCase = true)) {
                                            response.body?.source()?.readAll(okio.blackholeSink())
                                        }
                                    } catch (_: Exception) {
                                    } finally {
                                        response.body?.close()
                                    }
                                }
                            })
                            return super.shouldInterceptRequest(view, request)
                        }
                    } catch (e: Exception) {
                        Log.e("WebApp", "Image cache error for $url: ${e.localizedMessage}")
                    }
                }
                val isRangeRequest = request.requestHeaders?.keys?.any { it.equals("Range", ignoreCase = true) } == true
                val isMediaOrAsset = url.contains(".m3u8") || url.contains(".ts") || url.contains(".mp4") ||
                        url.contains(".webm") || url.contains(".jpg") || url.contains(".jpeg") ||
                        url.contains(".png") || url.contains(".gif") || url.contains(".webp") ||
                        url.contains(".css") || url.contains(".woff") || url.contains(".ttf") ||
                        url.contains(".js") || url.contains(".json") || url.contains(".svg") ||
                        url.contains("api.themoviedb.org") || url.contains("/api/")
                val currentWhitelist = getSavedWhitelist()
                val isWhitelisted = currentWhitelist.any { domain -> url.contains(domain, ignoreCase = true) }
                if (isWhitelisted && isDocOrIframe && request.method == "GET" && !isMediaOrAsset && !isRangeRequest) {
                    Log.d("WebApp", "OkHttp Interceptor Match: $url")
                    val intercepted = fetchWithOkHttpAndStripHeaders(url, request)
                    if (intercepted != null) return intercepted
                }

                return super.shouldInterceptRequest(view, request)
            }
        }

        setupUniversalMediaHook()
        webView.loadUrl("https://app.local/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // 1. Exit video fullscreen mode if active
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                    return
                }

                val currentTime = System.currentTimeMillis()
                val timeSinceLastPress = currentTime - lastBackClickTime
                lastBackClickTime = currentTime

                val isRapidClick = timeSinceLastPress in 1..300

                // 2. If Quick Exit is ALREADY ARMED and user rapidly clicks again (within 300ms): INSTANT EXIT!
                if (isExitArmed && isRapidClick) {
                    backToast?.cancel()
                    finish()
                    return
                }

                // 3. First Rapid Double Press (within 300ms): ARM QUICK EXIT + SHOW TOAST PROMPT (1.5s Window)
                if (isRapidClick) {
                    isExitArmed = true
                    backToast?.cancel()
                    backToast = Toast.makeText(this@MainActivity, "Double press back again to exit", Toast.LENGTH_SHORT)
                    backToast?.show()

                    armedTimerRunnable?.let { notificationHandler.removeCallbacks(it) }
                    armedTimerRunnable = Runnable { isExitArmed = false }
                    notificationHandler.postDelayed(armedTimerRunnable!!, 1500)
                    return
                }

                // 4. Single Back Press (normal navigation, NO Toast, NO exit arming):
                if (webView.canGoBack()) {
                    webView.goBack()
                }
            }
        })
    }

    private fun setupUniversalMediaHook() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        val universalScript = """
            (function() {
if (window.__appUniversalHook) return;
                window.__appUniversalHook = true;
                var noTapCss = '*,*::before,*::after,html,body,a,div,button,video,iframe,select,option,ul,ol,li{-webkit-tap-highlight-color:rgba(0,0,0,0)!important;-webkit-tap-highlight-color:transparent!important;-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;outline:none!important;scrollbar-width:none!important;-ms-overflow-style:none!important;}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;background:transparent!important;}::-webkit-scrollbar-thumb{display:none!important;background:transparent!important;}::-webkit-scrollbar-track{display:none!important;background:transparent!important;}::-webkit-scrollbar-corner{display:none!important;background:transparent!important;}*::selection{background:transparent!important;}';
                function injectNoTap(root) {
                    if (!root || root.__appNoTap) return;
                    var target = root === document ? (document.head || document.documentElement) : root;
                    if (!target) return;
                    root.__appNoTap = true;
                    if (document.documentElement) document.documentElement.style.webkitTapHighlightColor = 'transparent';
                    var st = document.createElement('style');
                    st.textContent = noTapCss;
                    target.appendChild(st);
                }
                injectNoTap(document);
                document.addEventListener('DOMContentLoaded', function() { injectNoTap(document); }, { once: true });

                // Pre-define dummy google.ima & handle VAST/JWPlayer 232011 ad errors gracefully
                try {
                    if (!window.google) window.google = {};
                    if (!window.google.ima) {
                        window.google.ima = {
                            AdDisplayContainer: function() { return { initialize: function(){} }; },
                            AdsLoader: function() { return { addEventListener: function(){}, requestAds: function(){} }; },
                            AdsRequest: function() {},
                            ViewMode: {},
                            params: {}
                        };
                    }
                } catch(err) {}

                // Hide broken image icons when poster/image loading fails or when offline, and handle ad 232011 errors
                window.addEventListener('error', function(e) {
                    if (e && e.message && (e.message.indexOf('232011') !== -1 || e.message.indexOf('VAST') !== -1)) {
                        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                        if (e.preventDefault) e.preventDefault();
                    }
                    if (e.target && e.target.tagName === 'IMG') {
                        if (e.target.id === 'lucky-poster' || e.target.id === 'media-lightbox-img' || e.target.id === 'si-poster' || e.target.id === 'hero-title' || (e.target.classList && (e.target.classList.contains('lucky-poster-img') || e.target.classList.contains('media-lightbox-img') || e.target.classList.contains('title-logo') || e.target.classList.contains('hero-title-logo')))) return;
                        e.target.style.opacity = '0';
                        e.target.style.visibility = 'hidden';
                    }
                }, true);

                var isMainApp = (window.location.hostname === 'app.local');
                var lastReport = 0;
                var lastPaused = null;
                var activeVideo = null;

                function syncMainTitle() {
                    if (!isMainApp) return '';
                    var wt = document.getElementById('w-title');
                    var t = (wt && wt.innerText ? wt.innerText.trim() : '') || document.title || '';
                    if (t && t !== 'WebApp' && window.AndroidBridge && window.AndroidBridge.updateWatchTitle) {
                        window.AndroidBridge.updateWatchTitle(t);
                    }
                    return t;
                }

                if (isMainApp) {
                    setInterval(syncMainTitle, 500);
                }

                function report(v) {
                    if (!v) return;
                    var dur = v.duration;
                    if (!dur || isNaN(dur) || dur < 5) return;
                    activeVideo = v;
                    var now = Date.now();
                    var cur = v.currentTime || 0;
                    var playing = !v.paused && !v.ended && v.readyState >= 2;
                    if (now - lastReport > 350 || v.paused !== lastPaused) {
                        lastReport = now;
                        lastPaused = v.paused;
                        var t = isMainApp ? syncMainTitle() : '';
                        if (window.AndroidBridge && window.AndroidBridge.updateMediaMetadata) {
                            window.AndroidBridge.updateMediaMetadata(t, 'WebApp', dur, cur, playing);
                        }
                    }
                }

                function bindVideo(v) {
                    if (!v || v.__appBound) return;
                    v.__appBound = true;
                    ['loadedmetadata', 'play', 'playing', 'pause', 'timeupdate', 'durationchange', 'seeking', 'seeked', 'ended'].forEach(function(ev) {
                        v.addEventListener(ev, function() { report(v); }, { passive: true });
                    });
                    report(v);
                }

                var origPlay = HTMLMediaElement.prototype.play;
                HTMLMediaElement.prototype.play = function() {
                    if (this.tagName === 'VIDEO') {
                        activeVideo = this;
                        bindVideo(this);
                        setTimeout(() => report(this), 100);
                    }
                    return origPlay.apply(this, arguments);
                };

                    function scanVideos(root) {
                    if (!root || !root.querySelectorAll) return;
                    injectNoTap(root);
                    root.querySelectorAll('video').forEach(bindVideo);
                    root.querySelectorAll('*').forEach(function(el) {
                        if (el.shadowRoot) scanVideos(el.shadowRoot);
                    });
                }

                setInterval(function() {
                    scanVideos(document);
                    if (activeVideo && !activeVideo.paused) report(activeVideo);
                }, 500);

window.addEventListener('message', function(e) {
if (!e.data) return;
if (e.data.type === 'APP_PIP_STATE') {
if (isMainApp) {
var pipSt = document.getElementById('__app_pip_css');
if (!pipSt) {
pipSt = document.createElement('style');
pipSt.id = '__app_pip_css';
(document.head || document.documentElement).appendChild(pipSt);
}
pipSt.textContent = e.data.active ? '#w-controls-bar,.watch-controls-bar,.fs-interaction-catcher,#player-tooltip{display:none!important;opacity:0!important;}' : '';
}
return;
}
if (e.data.type !== 'APP_MEDIA_CONTROL') return;
                    var v = activeVideo || document.querySelector('video');
                    if (v) {
                        if (e.data.action === 'play') v.play().catch(function(){});
                        if (e.data.action === 'pause') v.pause();
                        if (e.data.action === 'seek' && typeof e.data.value === 'number') v.currentTime = e.data.value;
                        setTimeout(function() { report(v); }, 50);
                    }
                    document.querySelectorAll('iframe').forEach(function(f) {
                        try { f.contentWindow.postMessage(e.data, '*'); } catch(err) {}
                    });
                });
            })();
        """.trimIndent()
        WebViewCompat.addDocumentStartJavaScript(webView, universalScript, setOf("*"))
    }

    private fun injectMediaObserverScript() {
        val syncTitleJs = """
            (function() {
                var wt = document.getElementById('w-title');
                var t = (wt && wt.innerText ? wt.innerText.trim() : '') || document.title || '';
                if (t && t !== 'WebApp' && window.AndroidBridge && window.AndroidBridge.updateWatchTitle) {
                    window.AndroidBridge.updateWatchTitle(t);
                }
            })();
        """.trimIndent()
        webView.evaluateJavascript(syncTitleJs, null)
    }

    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "AppMediaSession").apply {
            @Suppress("DEPRECATION")
            setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS)
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    updateMediaMetadataAndNotification(currentMediaTitle, currentMediaArtist, currentDurationSec, currentPositionSec, true)
                    sendMediaControlToWebView("play", 0.0)
                }

                override fun onPause() {
                    updateMediaMetadataAndNotification(currentMediaTitle, currentMediaArtist, currentDurationSec, currentPositionSec, false)
                    sendMediaControlToWebView("pause", 0.0)
                }

                override fun onSeekTo(posMs: Long) {
                    val posSeconds = posMs / 1000.0
                    currentPositionSec = posSeconds
                    updateMediaMetadataAndNotification(currentMediaTitle, currentMediaArtist, currentDurationSec, posSeconds, currentIsPlaying)
                    sendMediaControlToWebView("seek", posSeconds)
                }
            })
        }
    }

    private fun sendMediaControlToWebView(action: String, value: Double) {
        val jsCommand = """
            (function() {
                var msg = { type: 'APP_MEDIA_CONTROL', action: '$action', value: $value };
                window.postMessage(msg, '*');
                document.querySelectorAll('iframe').forEach(function(f) {
                    try { f.contentWindow.postMessage(msg, '*'); } catch(e) {}
                });
            })();
        """.trimIndent()
        webView.evaluateJavascript(jsCommand, null)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                MEDIA_CHANNEL_ID,
                "Media Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "WebApp Active Media Playback Notification"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    fun updateMediaMetadataAndNotification(title: String, artist: String, durationSec: Double, positionSec: Double, isPlaying: Boolean) {
        val currentUrl = webView.url ?: ""
        val isOnWatchPage = currentUrl.contains("view=watch", ignoreCase = true) || customView != null

        // Only show media notification if the user is actively on the streaming/watch page
        if (!isOnWatchPage) {
            cancelMediaNotification()
            return
        }

        notificationHandler.removeCallbacks(cancelNotificationRunnable)

        if (!isPlaying) {
            // Auto-cancel notification if paused/inactive for > 4 seconds
            notificationHandler.postDelayed(cancelNotificationRunnable, 4000)
        }

        val mainTitle = webView.title
        val cleanTitle = if (currentMediaTitle.isNotBlank() && currentMediaTitle != "WebApp Stream" && !currentMediaTitle.equals("WebApp", ignoreCase = true)) {
            currentMediaTitle
        } else if (!mainTitle.isNullOrBlank() && !mainTitle.startsWith("app.local", ignoreCase = true) && !mainTitle.startsWith("http", ignoreCase = true) && !mainTitle.equals("WebApp", ignoreCase = true)) {
            mainTitle
        } else if (title.isNotBlank() && !title.startsWith("http")) {
            title
        } else {
            "WebApp Stream"
        }

        currentMediaTitle = cleanTitle
        currentMediaArtist = "WebApp" // Always branding as WebApp, hiding sketchy internal embed/m3u8 CDN domains!
        currentDurationSec = if (durationSec > 0) durationSec else 0.0
        currentPositionSec = if (positionSec >= 0) positionSec else 0.0
        currentIsPlaying = isPlaying

        // Update MediaSession Metadata (Title, Duration) - Artist/Album omitted to hide subtitle line
        val metadataBuilder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentMediaTitle)

        if (currentDurationSec > 0) {
            metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (currentDurationSec * 1000).toLong())
        }
        mediaSession.setMetadata(metadataBuilder.build())

        // Update PlaybackState (State, Position in ms, Play/Pause/Seek Actions)
        val actions = PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SEEK_TO

        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, (currentPositionSec * 1000).toLong(), 1.0f)
            .build()

        mediaSession.setPlaybackState(playbackState)
        mediaSession.isActive = true

        showMediaNotification(isPlaying, currentMediaTitle, currentMediaArtist)
    }

    fun showMediaNotification(isPlaying: Boolean, title: String = "WebApp Video Stream", artist: String = "WebApp") {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return
            }
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val playPauseAction = if (isPlaying) {
            NotificationCompat.Action(
                android.R.drawable.ic_media_pause, "Pause",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PAUSE)
            )
        } else {
            NotificationCompat.Action(
                android.R.drawable.ic_media_play, "Play",
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY)
            )
        }

        val largeIconBitmap = BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)

        val notification = NotificationCompat.Builder(this, MEDIA_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(largeIconBitmap)
            .setContentTitle(title)
            .setContentIntent(pendingIntent)
            .setStyle(
                MediaNotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0)
            )
            .addAction(playPauseAction)
            .setOngoing(isPlaying)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(MEDIA_NOTIFICATION_ID, notification)
    }

    fun cancelMediaNotification() {
        notificationHandler.removeCallbacks(cancelNotificationRunnable)
        if (::mediaSession.isInitialized) {
            mediaSession.isActive = false
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(MEDIA_NOTIFICATION_ID)
    }

    private fun fetchWithOkHttpAndStripHeaders(url: String, webRequest: WebResourceRequest): WebResourceResponse? {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                CookieManager.getInstance().flush()
            }

            val requestBuilder = Request.Builder().url(url)

            webRequest.requestHeaders?.forEach { (key, value) ->
                if (!key.equals("Accept-Encoding", true)) {
                    requestBuilder.header(key, value)
                }
            }

            val cookies = CookieManager.getInstance().getCookie(url)
            if (!cookies.isNullOrEmpty()) {
                requestBuilder.header("Cookie", cookies)
            }

            val okRequest = requestBuilder.build()
            val response = okHttpClient.newCall(okRequest).execute()

            val responseHeaders = response.headers.newBuilder()
                .removeAll("x-frame-options")
                .removeAll("content-security-policy")
                .removeAll("content-security-policy-report-only")
                .removeAll("cross-origin-opener-policy")
                .removeAll("cross-origin-resource-policy")
                .removeAll("cross-origin-embedder-policy")
                .add("Access-Control-Allow-Origin", "*")
                .build()
                .toMultimap()
                .mapValues { it.value.joinToString(",") }

            val responseUrl = response.request.url.toString()
            response.headers("Set-Cookie").forEach { cookie ->
                CookieManager.getInstance().setCookie(responseUrl, cookie)
            }

            val contentTypeHeader = response.header("content-type", "text/html") ?: "text/html"
            val mimeType = contentTypeHeader.substringBefore(";").trim().lowercase()
            val encoding = contentTypeHeader.substringAfter("charset=", "UTF-8").substringBefore(";").trim().ifEmpty { "UTF-8" }

            val inputStream = response.body?.byteStream() ?: return null

            // Only inject script and process HTML if content-type is text/html
            if (mimeType.contains("text/html")) {
                var html = inputStream.bufferedReader(charset(encoding)).use { it.readText() }

                val antiBuster = """
                    <script>
                    try {
                        if (window.top !== window.self) {
                            Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
                            Object.defineProperty(window, 'parent', { get: function() { return window; }, configurable: true });
                        }
                    } catch(e) {}
                    </script>
                """.trimIndent()

                // Universal Iframe Media Observer, postMessage Bridge, and Control Script
                val iframeMediaObserverScript = """
                    <script>
                    (function() {
                        if (window.__appIframeObserver) return;
                        window.__appIframeObserver = true;

                        var lastSyncTime = 0;

                        function reportMedia() {
                            var v = document.querySelector('video');
                            if (!v) return;
                            var now = Date.now();
                            var title = 'WebApp Stream';
                            var artist = 'WebApp';
                            var duration = v.duration || 0;
                            var currentTime = v.currentTime || 0;
                            var isPlaying = !v.paused && !v.ended && v.readyState > 2;

                            if (now - lastSyncTime > 400 || v.paused !== (lastSyncTime.paused || false)) {
                                lastSyncTime = now;
                                lastSyncTime.paused = v.paused;

                                try {
                                    window.top.postMessage({
                                        type: 'APP_MEDIA_UPDATE',
                                        title: title,
                                        artist: 'WebApp',
                                        duration: duration,
                                        currentTime: currentTime,
                                        isPlaying: isPlaying
                                    }, '*');
                                } catch(err) {}
                            }
                        }

                        window.addEventListener('message', function(e) {
                            if (!e.data) return;
                            if (e.data.type === 'APP_MEDIA_CONTROL') {
                                var v = document.querySelector('video');
                                if (!v) return;
                                if (e.data.action === 'play') v.play();
                                if (e.data.action === 'pause') v.pause();
                                if (e.data.action === 'seek' && typeof e.data.value === 'number') v.currentTime = e.data.value;
                            }
                        });

                        function bindVideo(v) {
                            if (!v || v.__appBound) return;
                            v.__appBound = true;
                            ['play', 'pause', 'timeupdate', 'durationchange', 'ended', 'playing', 'seeking'].forEach(function(evt) {
                                v.addEventListener(evt, reportMedia);
                            });
                            reportMedia();
                        }

                        setInterval(function() {
                            var v = document.querySelector('video');
                            if (v) bindVideo(v);
                        }, 500);
                    })();
                    </script>
                """.trimIndent()

                html = if (html.contains("<head>", true)) {
                    html.replaceFirst("<head>", "<head><base href=\"$responseUrl\">\n$antiBuster\n$iframeMediaObserverScript", true)
                } else {
                    "<base href=\"$responseUrl\">\n$antiBuster\n$iframeMediaObserverScript\n$html"
                }

                return WebResourceResponse(mimeType, encoding, 200, "OK", responseHeaders, ByteArrayInputStream(html.toByteArray()))
            }

            return WebResourceResponse(mimeType, encoding, response.code, response.message, responseHeaders, inputStream)
        } catch (e: Exception) {
            Log.e("WebApp", "OkHttp Interceptor Error: ${e.localizedMessage}", e)
            return null
        }
    }

    override fun onPause() {
        super.onPause()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().flush()
        }
        try {
            imageDiskCache.flush()
        } catch (_: Exception) {}
    }

    private val scrollbarHideHandler = Handler(Looper.getMainLooper())
    private val scrollbarHideRunnable = Runnable { hideScrollbarsInGlobalWindows() }

    private fun stripScrollbarsRecursively(view: View) {
        view.isVerticalScrollBarEnabled = false
        view.isHorizontalScrollBarEnabled = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            view.scrollBarSize = 0
        }
        if (view is AbsListView) {
            view.isFastScrollEnabled = false
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                stripScrollbarsRecursively(view.getChildAt(i))
            }
        }
    }

    @SuppressLint("PrivateApi")
    private fun hideScrollbarsInGlobalWindows() {
        try {
            val rootViews: List<View> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.view.inspector.WindowInspector.getGlobalWindowViews()
            } else {
                val wmgClass = Class.forName("android.view.WindowManagerGlobal")
                val wmgInstance = wmgClass.getMethod("getInstance").invoke(null)
                val viewsField = wmgClass.getDeclaredField("mViews")
                viewsField.isAccessible = true
                @Suppress("UNCHECKED_CAST")
                (viewsField.get(wmgInstance) as? List<View>) ?: emptyList()
            }
            for (root in rootViews) {
                stripScrollbarsRecursively(root)
            }
        } catch (_: Throwable) {}
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        scrollbarHideHandler.removeCallbacks(scrollbarHideRunnable)
        if (!hasFocus) {
            hideScrollbarsInGlobalWindows()
            scrollbarHideHandler.postDelayed(scrollbarHideRunnable, 30)
            scrollbarHideHandler.postDelayed(scrollbarHideRunnable, 100)
            scrollbarHideHandler.postDelayed(scrollbarHideRunnable, 250)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scrollbarHideHandler.removeCallbacks(scrollbarHideRunnable)
        notificationHandler.removeCallbacks(cancelNotificationRunnable)
        if (::mediaSession.isInitialized) {
            mediaSession.release()
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (customView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val pipBuilder = PictureInPictureParams.Builder()
            pipBuilder.setAspectRatio(Rational(16, 9))
            enterPictureInPictureMode(pipBuilder.build())
        }
    }
    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        webView.evaluateJavascript("window.postMessage({type:'APP_PIP_STATE',active:$isInPictureInPictureMode},'*');", null)
    }
}
