package com.trackd.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.util.concurrent.atomic.AtomicBoolean

class SimStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()

        try {
            val action = intent.action
            when (action) {
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_MY_PACKAGE_REPLACED,
                "android.intent.action.LOCKED_BOOT_COMPLETED" -> {
                    Log.i(TAG, "Lifecycle event received: $action - starting TrackdSentinelService")
                    TrackdSentinelService.start(context)
                    val trigger = if (action == Intent.ACTION_MY_PACKAGE_REPLACED) "UPDATE" else "BOOT"
                    TelemetryDispatcher.sendNow(context, trigger)
                    pendingResult.finish()
                    return
                }
                "android.intent.action.SIM_STATE_CHANGED",
                "android.telephony.action.SIM_STATE_CHANGED" -> Unit
                else -> {
                    pendingResult.finish()
                    return
                }
            }

            val simState = intent.extras?.get("simstate")?.toString()
                ?: intent.getStringExtra("ss")

            // Handle SIM removal / absent state
            if (simState == "ABSENT" || simState == "1") {
                Log.w(TAG, "SIM card removed or tray opened (ABSENT)")
                TelemetryDispatcher.sendNow(context, "SIM_REMOVED")
                pendingResult.finish()
                return
            }

            if (simState != null && simState != "READY" && simState != "LOADED" && simState != "5") {
                pendingResult.finish()
                return
            }

            val currentFingerprint = SimHelper.getSimFingerprint(context)
            if (currentFingerprint.isNullOrBlank()) {
                pendingResult.finish()
                return
            }

            val cached = AegisState.getString(context, AegisState.KEY_REGISTERED_SIM)
            if (cached == null) {
                AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, currentFingerprint)
                Log.i(TAG, "baseline SIM fingerprint cached")
                pendingResult.finish()
                return
            }

            if (cached == currentFingerprint) {
                pendingResult.finish()
                return
            }

            Log.w(TAG, "SIM swap detected! Initiating emergency protocol")
            val line = SimHelper.getLine1Number(context) ?: "Unknown"
            AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, currentFingerprint)
            dispatchAlert(context, line, pendingResult)
        } catch (e: Exception) {
            Log.e(TAG, "Error in onReceive", e)
            try {
                pendingResult.finish()
            } catch (_: Exception) {}
        }
    }

    private fun dispatchAlert(context: Context, newNumber: String, pendingResult: PendingResult) {
        val phone = AegisState.getString(context, AegisState.KEY_EMERGENCY_PHONE)
        if (phone.isNullOrBlank()) {
            Log.w(TAG, "No emergency contact configured for SIM swap alert")
            pendingResult.finish()
            return
        }

        // P0/P1 Fix: Send immediate base SMS alert FIRST so owner is notified even if GPS fails
        val baseAlert = "ALERT: SIM swap detected on your phone. Active line: $newNumber"
        sendSms(context, phone, baseAlert)

        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            Log.w(TAG, "Location permission not granted for SIM follow-up")
            pendingResult.finish()
            return
        }

        val client = LocationServices.getFusedLocationProviderClient(context)
        val cancellation = CancellationTokenSource()
        val finished = AtomicBoolean(false)
        val handler = Handler(Looper.getMainLooper())

        // Safety timeout: 9 seconds for high accuracy GPS fix
        val timeoutRunnable = Runnable {
            if (finished.compareAndSet(false, true)) {
                cancellation.cancel()
                Log.w(TAG, "Location fetch timed out for SIM swap follow-up")
                try {
                    pendingResult.finish()
                } catch (_: Exception) {}
            }
        }
        handler.postDelayed(timeoutRunnable, 9_000L)

        try {
            val locationTask = client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
            locationTask.addOnCompleteListener { task ->
                handler.removeCallbacks(timeoutRunnable)
                if (finished.compareAndSet(false, true)) {
                    val location = if (task.isSuccessful) task.result else null
                    if (location != null) {
                        Log.i(TAG, "GPS acquired for SIM swap follow-up: ${location.latitude},${location.longitude}")
                        val followUpSms = "Trackd GPS: https://maps.google.com/?q=${location.latitude},${location.longitude} (Acc: ${location.accuracy.toInt()}m)"
                        sendSms(context, phone, followUpSms)

                        Thread {
                            try {
                                FirestoreSync.writeTelemetry(
                                    context,
                                    location.latitude,
                                    location.longitude,
                                    location.accuracy.toInt(),
                                    "SIM_SWAP_ALERT"
                                )
                            } catch (_: Exception) {}
                        }.start()
                    } else {
                        Log.w(TAG, "No GPS fix obtained for SIM swap follow-up")
                    }
                    try {
                        pendingResult.finish()
                    } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception during location fetch for SIM swap", e)
            handler.removeCallbacks(timeoutRunnable)
            if (finished.compareAndSet(false, true)) {
                try {
                    pendingResult.finish()
                } catch (_: Exception) {}
            }
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
            Log.i(TAG, "SIM swap SMS dispatched to $phone: $message")
        } catch (error: Exception) {
            Log.e(TAG, "Failed to send SMS to $phone", error)
        }
    }

    companion object {
        private const val TAG = "AegisSimState"
    }
}
