# Trackd R8 / ProGuard Obfuscation & Security Rules

# Strip line numbers and debug source file references from compiled DEX
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Capacitor Core & Plugin Reflection
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    public <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX Biometric & Security Crypto
-keep class androidx.biometric.** { *; }
-keep class androidx.security.crypto.** { *; }

# Google Play Services Location
-keep class com.google.android.gms.location.** { *; }
-keep class com.google.android.gms.tasks.** { *; }

# Firebase Messaging & Firestore
-dontwarn com.google.firebase.**
-keep class com.google.firebase.** { *; }

# Trackd Services, Receivers & Accessibility Decoy
-keep class com.trackd.app.SmsCommandReceiver { *; }
-keep class com.trackd.app.AegisPushService { *; }
-keep class com.trackd.app.AppDecoyAccessibilityService { *; }
-keep class com.trackd.app.AntiTheftAdminReceiver { *; }
-keep class com.trackd.app.ShutdownReceiver { *; }
-keep class com.trackd.app.TrackdSentinelService { *; }
-keep class com.trackd.app.TrackdBridgePlugin { *; }
-keep class com.trackd.app.MainActivity { *; }
