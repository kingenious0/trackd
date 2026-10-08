package com.trackd.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.security.MessageDigest

class SmsCommandReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val body = messages.joinToString(separator = "") { it.messageBody ?: "" }.trim()
        val sender = messages.firstOrNull()?.originatingAddress

        val command = parseCommand(body) ?: return
        Log.i(TAG, "command ${command.first} received from $sender")

        if (!pinMatches(context, command.second)) {
            Log.w(TAG, "pin verification failed")
            abortBroadcast()
            return
        }

        when (command.first) {
            "LOCATE" -> handleLocate(context, sender)
            "SIREN" -> {
                HardwareAlarm.play(context, 30000L)
                reply(context, sender, "Trackd: High-decibel emergency siren activated.")
            }
            "STOP_SIREN", "SILENCE" -> {
                HardwareAlarm.stop()
                reply(context, sender, "Trackd: Emergency siren silenced.")
            }
            "STOLEN" -> {
                AegisState.setStolen(context, true)
                FirestoreSync.pushStolen(context, true)
                reply(context, sender, "Trackd: device marked STOLEN. Financial decoys armed.")
            }
            "SAFE" -> {
                AegisState.setStolen(context, false)
                FirestoreSync.pushStolen(context, false)
                reply(context, sender, "Trackd: device marked SAFE. Decoys disarmed.")
            }
            "WIPE" -> {
                reply(context, sender, "Trackd: initiating factory reset.")
                AntiTheftAdminReceiver.executeWipe(context)
            }
        }

        abortBroadcast()
    }

    private fun handleLocate(context: Context, sender: String?) {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val task = if (granted) {
            try {
                client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            } catch (security: SecurityException) {
                null
            }
        } else {
            null
        }

        if (task == null) {
            reply(context, sender, "Trackd: location permission unavailable.")
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
                        "SMS_COMMAND"
                    )
                }.start()
            }
            val message = if (location != null) {
                "Trackd GPS: ${location.latitude},${location.longitude} " +
                    "(±${location.accuracy.toInt()}m) " +
                    "https://maps.google.com/?q=${location.latitude},${location.longitude}"
            } else {
                "Trackd: GPS fix unavailable. Battery may be depleted."
            }
            reply(context, sender, message)
        }
    }

    private fun reply(context: Context, sender: String?, message: String) {
        if (sender.isNullOrBlank()) return
        try {
            val sms = SmsManager.getDefault()
            val parts = sms.divideMessage(message)
            sms.sendMultipartTextMessage(sender, null, parts, null, null)
        } catch (error: Exception) {
            Log.e(TAG, "reply failed", error)
        }
    }

    private fun parseCommand(body: String): Pair<String, String>? {
        val match = Regex("^#(LOCATE|STOLEN|SAFE|WIPE)#(.{4,12})$", RegexOption.IGNORE_CASE)
            .matchEntire(body) ?: return null
        return match.groupValues[1].uppercase() to match.groupValues[2]
    }

    private fun pinMatches(context: Context, pin: String): Boolean {
        val stored = AegisState.getString(context, AegisState.KEY_MASTER_PIN_HASH)
            ?: return false
        return sha256(pin) == stored
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString(separator = "") { "%02x".format(it) }
    }

    companion object {
        private const val TAG = "AegisSmsCommand"
    }
}
