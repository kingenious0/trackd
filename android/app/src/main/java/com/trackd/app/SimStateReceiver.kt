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
                TelemetryDispatcher.sendNow(context, "BOOT")
            }
            "android.intent.action.SIM_STATE_CHANGED" -> Unit
            else -> return
        }

        val simState = intent.extras?.get("simstate")?.toString()
        if (simState != null && simState != "READY" && simState != "LOADED" && simState != "5") return

        val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        val currentSerial = try {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                telephony.simSerialNumber
            } else {
                null
            }
        } catch (security: SecurityException) {
            null
        }

        if (currentSerial.isNullOrBlank()) return

        val cached = AegisState.getString(context, AegisState.KEY_REGISTERED_SIM)
        if (cached == null) {
            AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, currentSerial)
            Log.i(TAG, "baseline SIM serial cached")
            return
        }

        if (cached == currentSerial) return
        Log.w(TAG, "SIM swap detected")

        val line = try {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_NUMBERS) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                telephony.line1Number
            } else {
                null
            }
        } catch (security: SecurityException) {
            null
        } ?: "unknown"

        AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, currentSerial)
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

    private fun sendSms(context: Context, phone: String, message: String) {
        try {
            SmsManager.getDefault().sendTextMessage(phone, null, message, null, null)
            Log.i(TAG, "SIM swap alert dispatched")
        } catch (error: Exception) {
            Log.e(TAG, "SIM alert failed", error)
        }
    }

    companion object {
        private const val TAG = "AegisSimState"
    }
}
