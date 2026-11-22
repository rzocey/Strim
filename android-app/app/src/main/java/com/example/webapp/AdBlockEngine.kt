package com.example.webapp

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.concurrent.TimeUnit

class AdBlockEngine private constructor() {

    @Volatile
    private var blockedDomains: Set<String> = emptySet()

    @Volatile
    private var whitelistedDomains: Set<String> = emptySet()

    @Volatile
    private var isInitialized = false

    fun init(context: Context, remoteUrl: String = DEFAULT_FILTER_URL) {
        if (isInitialized) return
        isInitialized = true
        val appContext = context.applicationContext

        CoroutineScope(Dispatchers.IO).launch {
            // 1. Load initial rules from cache or assets
            val cacheFile = File(appContext.filesDir, CACHE_FILENAME)
            var loaded = false
            if (cacheFile.exists() && cacheFile.length() > 50_000) {
                try {
                    FileInputStream(cacheFile).use { input ->
                        val (b, w) = parseRules(input)
                        if (b.isNotEmpty()) {
                            blockedDomains = b
                            whitelistedDomains = w
                            loaded = true
                            Log.d(TAG, "Loaded ${b.size} adblock rules from local cache")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error loading cached rules: ${e.localizedMessage}")
                }
            }

            if (!loaded) {
                try {
                    appContext.assets.open(ASSET_FILENAME).use { input ->
                        val (b, w) = parseRules(input)
                        blockedDomains = b
                        whitelistedDomains = w
                        Log.d(TAG, "Loaded ${b.size} adblock rules from assets")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error loading asset rules: ${e.localizedMessage}")
                }
            }

            // 2. Check if background update is needed (e.g. every 3 days)
            val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastUpdate = prefs.getLong(KEY_LAST_UPDATE, 0L)
            val now = System.currentTimeMillis()
            val updateInterval = 3 * 24 * 60 * 60 * 1000L // 3 days

            if (now - lastUpdate > updateInterval || !cacheFile.exists()) {
                downloadAndUpdateRules(appContext, remoteUrl, cacheFile, prefs)
            }
        }
    }

    fun isBlocked(uri: Uri?): Boolean {
        val host = uri?.host?.lowercase() ?: return false

        // Ignore internal app domains
        if (host == "app.local" || host.endsWith(".app.local")) return false

        val currentBlocked = blockedDomains
        val currentWhitelisted = whitelistedDomains

        if (currentBlocked.isEmpty()) return false

        // Check whitelist exception first
        if (isDomainMatch(host, currentWhitelisted)) return false

        // Check blacklist rules
        return isDomainMatch(host, currentBlocked)
    }

    private fun isDomainMatch(host: String, domainSet: Set<String>): Boolean {
        if (domainSet.contains(host)) return true

        var parts = host
        var dotIndex = parts.indexOf('.')
        while (dotIndex != -1 && dotIndex < parts.length - 1) {
            parts = parts.substring(dotIndex + 1)
            if (domainSet.contains(parts)) return true
            dotIndex = parts.indexOf('.')
        }
        return false
    }

    private fun parseRules(inputStream: InputStream): Pair<Set<String>, Set<String>> {
        val blocked = HashSet<String>(150000)
        val whitelisted = HashSet<String>(1000)

        inputStream.bufferedReader().useLines { lines ->
            for (line in lines) {
                val trimmed = line.trim()
                if (trimmed.isEmpty() || trimmed.startsWith("!") || trimmed.startsWith("#") || trimmed.startsWith("[")) {
                    continue
                }

                // Whitelist exception rule: @@||example.com^
                if (trimmed.startsWith("@@||")) {
                    val domain = trimmed.substring(4).substringBefore("^").substringBefore("$").trim().lowercase()
                    if (domain.isNotEmpty()) {
                        whitelisted.add(domain)
                    }
                }
                // Domain rule: ||example.com^ or ||example.com
                else if (trimmed.startsWith("||")) {
                    val domain = trimmed.substring(2).substringBefore("^").substringBefore("$").trim().lowercase()
                    if (domain.isNotEmpty()) {
                        blocked.add(domain)
                    }
                }
                // Hosts entry: 127.0.0.1 domain.com or 0.0.0.0 domain.com
                else if (trimmed.startsWith("127.0.0.1 ") || trimmed.startsWith("0.0.0.0 ")) {
                    val domain = trimmed.substringAfter(" ").trim().lowercase()
                    if (domain.isNotEmpty()) {
                        blocked.add(domain)
                    }
                }
            }
        }
        return Pair(blocked, whitelisted)
    }

    private fun downloadAndUpdateRules(
        context: Context,
        remoteUrl: String,
        cacheFile: File,
        prefs: SharedPreferences
    ) {
        try {
            Log.d(TAG, "Checking for remote filter update from $remoteUrl")
            val client = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .build()

            val request = Request.Builder().url(remoteUrl).build()
            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val responseBody = response.body
                if (responseBody != null) {
                    val tempFile = File(context.cacheDir, "temp_filter.txt")
                    tempFile.outputStream().use { output ->
                        responseBody.byteStream().copyTo(output)
                    }

                    if (tempFile.length() > 50_000) {
                        tempFile.inputStream().use { input ->
                            val (b, w) = parseRules(input)
                            if (b.isNotEmpty()) {
                                tempFile.copyTo(cacheFile, overwrite = true)
                                blockedDomains = b
                                whitelistedDomains = w
                                prefs.edit().putLong(KEY_LAST_UPDATE, System.currentTimeMillis()).apply()
                                Log.d(TAG, "Successfully updated adblock rules from remote (${b.size} rules)")
                            }
                        }
                    }
                    tempFile.delete()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "AdBlock remote update skipped/failed: ${e.localizedMessage}")
        }
    }

    companion object {
        private const val TAG = "AdBlockEngine"
        private const val ASSET_FILENAME = "filter.txt"
        private const val CACHE_FILENAME = "filter.txt"
        private const val PREFS_NAME = "app_adblock_prefs"
        private const val KEY_LAST_UPDATE = "last_update_time"
        const val DEFAULT_FILTER_URL = "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt"

        @Volatile
        private var instance: AdBlockEngine? = null

        fun getInstance(): AdBlockEngine {
            return instance ?: synchronized(this) {
                instance ?: AdBlockEngine().also { instance = it }
            }
        }
    }
}
