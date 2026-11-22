# Web App Template R8 & ProGuard Obfuscation Rules

# Preserve Line Numbers and Attributes for stack traces and reflection
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Preserve JavascriptInterfaces for WebView AndroidBridge Reflection
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.example.webapp.MainActivity$WebAppInterface { *; }

# Keep MainActivity
-keep class com.example.webapp.MainActivity { *; }

# OkHttp Keep Rules
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# AndroidX WebKit & Media Keep Rules
-dontwarn androidx.webkit.**
-dontwarn androidx.media.**
-keep class androidx.webkit.** { *; }
-keep class androidx.media.** { *; }
-keep class android.support.v4.media.** { *; }

# AES Cryptography Keep Rules
-keep class javax.crypto.** { *; }
