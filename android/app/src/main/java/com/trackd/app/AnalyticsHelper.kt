package com.trackd.app

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

object AnalyticsHelper {
    private var analytics: FirebaseAnalytics? = null

    fun init(context: Context) {
        if (analytics == null) {
            try {
                analytics = FirebaseAnalytics.getInstance(context.applicationContext)
            } catch (e: Exception) {
                // Analytics init failure must never crash the app
            }
        }
    }

    /**
     * Privacy-first analytics logging.
     * NEVER log PII (Phone numbers, contact names, PINs, exact GPS coordinates, or specific passwords).
     */
    fun logEvent(name: String, params: Bundle? = null) {
        try {
            analytics?.logEvent(name, params)
        } catch (_: Exception) {
            // Fail silent
        }
    }

    fun logDeviceArmed() {
        logEvent("device_armed", Bundle().apply {
            putString("status", "fully_protected")
        })
    }

    fun logDecoyTriggered(category: String) {
        logEvent("decoy_blocked_app", Bundle().apply {
            putString("category", category) // e.g. "fintech", "settings"
        })
    }

    fun logStolenModeTriggered(source: String) {
        logEvent("stolen_mode_triggered", Bundle().apply {
            putString("source", source) // e.g. "web", "sms"
        })
    }
}
