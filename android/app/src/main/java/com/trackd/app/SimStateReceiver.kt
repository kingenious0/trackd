package com.trackd.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class SimStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.LOCKED_BOOT_COMPLETED" -> {
                TrackdSentinelService.start(context)
                TelemetryDispatcher.sendNow(context, "BOOT")
            }
            "android.intent.action.SIM_STATE_CHANGED" -> Unit
            else -> return
        }

        val simState = intent.extras?.get("simstate")?.toString()
            ?: intent.getStringExtra("ss")

        // Handle SIM removal / absent state
        if (simState == "ABSENT" || simState == "1") {
            Log.w(TAG, "SIM card removed or tray opened (ABSENT)")
            // Telemetry dispatcher sends over Wi-Fi if available
            TelemetryDispatcher.sendNow(context, "SIM_REMOVED")
            return
        }

        if (simState != null && simState != "READY" && simState != "LOADED" && simState != "5") return

        val currentFingerprint = SimHelper.getSimFingerprint(context)
        if (currentFingerprint.isNullOrBlank()) return

        val cached = AegisState.getString(context, AegisState.KEY_REGISTERED_SIM)
        if (cached == null) {
            AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, currentFingerprint)
            Log.i(TAG, "baseline SIM fingerprint cached")
            return
        }

        if (cached == currentFingerprint) return
        Log.w(TAG, "SIM swap detected")

        val line = SimHelper.getLine1Number(context)
        AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, currentFingerprint)
        dispatchAlert(context, line)
    }

    private fun dispatchAlert(context: Context, newNumber: String) {
        val phone = AegisState.getString(context, AegisState.KEY_EMERGENCY_PHONE)
        if (phone.isNullOrBlank()) {
            Log.w(TAG, "no emergency contact configured")
            return
        }

        val client = LocationServices.getFusedLocationProviderClient(context)
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val task = try {
            if (granted) client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null) else null
        } catch (security: SecurityException) {
            null
        }

        val base = "ALERT: SIM swap detected. New number: $newNumber"
        if (task == null) {
            sendSms(context, phone, base)
            return
        }

        task.addOnCompleteListener { locationTask ->
            val location = locationTask.result
            if (location != null) {
                Thread {
                    FirestoreSync.writeTelemetry(
                        context,
                        location.latitude,
                        location.longitude,
                        location.accuracy.toInt(),
                        "SIM_CHANGE"
                    )
                }.start()
            }
            val suffix = if (location != null) {
                " GPS: https://maps.google.com/?q=${location.latitude},${location.longitude}"
            } else {
                ""
            }
            sendSms(context, phone, base + suffix)
        }
    }

    @Suppress("DEPRECATION")
    private fun sendSms(context: Context, phone: String, message: String) {
        try {
            val smsManager = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
            } else {
                SmsManager.getDefault()
            }
            smsManager.sendTextMessage(phone, null, message, null, null)
            Log.i(TAG, "SIM swap alert dispatched")
        } catch (error: Exception) {
            Log.e(TAG, "SIM alert failed", error)
        }
    }

    companion object {
        private const val TAG = "AegisSimState"
    }
}
