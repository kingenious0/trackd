package com.trackd.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import java.security.MessageDigest

object SimHelper {
    private const val TAG = "SimHelper"

    /**
     * Resolves a stable identifier fingerprint for the active SIM card(s).
     * Works on Android 5 through Android 15+.
     * Combines SubscriptionManager subscription info (subscriptionId, iccId, cardId, carrierId)
     * and TelephonyManager network/sim operator details into a reliable SHA-256 fingerprint.
     */
    fun getSimFingerprint(context: Context): String? {
        val tokens = mutableListOf<String>()

        val hasPhoneState = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

        // 1. Check SubscriptionManager if permission is granted
        if (hasPhoneState) {
            try {
                val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                val activeSubs = subManager?.activeSubscriptionInfoList
                if (!activeSubs.isNullOrEmpty()) {
                    for (sub in activeSubs) {
                        // iccId may be present on Android 9 and lower, or carrier apps
                        val iccId = try { sub.iccId } catch (_: Exception) { null }
                        val cardId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            try { sub.cardId.toString() } catch (_: Exception) { null }
                        } else null
                        val carrierId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            try { sub.carrierId.toString() } catch (_: Exception) { null }
                        } else null
                        val subId = sub.subscriptionId.toString()
                        val country = sub.countryIso ?: ""
                        val carrierName = sub.carrierName?.toString() ?: ""

                        tokens.add("SUB:$subId|$iccId|$cardId|$carrierId|$country|$carrierName")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed reading SubscriptionManager: ${e.message}")
            }
        }

        // 2. Check TelephonyManager details
        val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        if (telephony != null) {
            // Legacy simSerialNumber on Android 9 or lower
            if (hasPhoneState && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                try {
                    val legacySerial = telephony.simSerialNumber
                    if (!legacySerial.isNullOrBlank()) {
                        tokens.add("SERIAL:$legacySerial")
                    }
                } catch (_: SecurityException) {}
            }

            // Sim operator / country / sim operator name (available on all Android versions)
            val simOperator = telephony.simOperator ?: ""
            val simCountry = telephony.simCountryIso ?: ""
            val simOperatorName = telephony.simOperatorName ?: ""
            if (simOperator.isNotBlank() || simOperatorName.isNotBlank()) {
                tokens.add("TEL:$simOperator|$simCountry|$simOperatorName")
            }
        }

        if (tokens.isEmpty()) {
            return null
        }

        val rawFingerprint = tokens.sorted().joinToString(";")
        return hashString(rawFingerprint)
    }

    /**
     * Attempts to read the incoming line1Number if available with READ_PHONE_NUMBERS
     */
    fun getLine1Number(context: Context): String {
        val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return "unknown"
        val hasPhoneNumbers = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_PHONE_NUMBERS
        ) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPhoneNumbers && !hasPhoneState) return "unknown"

        return try {
            val num = telephony.line1Number
            if (num.isNullOrBlank()) "unknown" else num
        } catch (_: SecurityException) {
            "unknown"
        }
    }

    private fun hashString(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
