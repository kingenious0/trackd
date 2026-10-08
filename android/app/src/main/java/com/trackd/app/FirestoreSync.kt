package com.trackd.app

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

object FirestoreSync {

    private const val TAG = "TrackdFirestore"
    private var registration: ListenerRegistration? = null

    private fun isoNow(): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date())
    }

    fun writeTelemetry(
        context: Context,
        lat: Double?,
        lng: Double?,
        accuracy: Int?,
        reason: String
    ): Boolean {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        val userId = AegisState.getString(context, AegisState.KEY_USER_ID)
        if (deviceId.isNullOrBlank() || userId.isNullOrBlank()) {
            Log.w(TAG, "device or user not configured; telemetry skipped")
            return false
        }
        if (FirebaseAuth.getInstance().currentUser == null) {
            Log.w(TAG, "not signed in; telemetry skipped")
            return false
        }

        val battery = readBattery(context)
        val timestamp = isoNow()
        val accuracyValue = accuracy ?: 0

        return try {
            val db = FirebaseFirestore.getInstance()

            if (lat != null && lng != null) {
                val logEntry = hashMapOf(
                    "deviceId" to deviceId,
                    "userId" to userId,
                    "lat" to lat,
                    "lng" to lng,
                    "accuracy" to accuracyValue,
                    "battery" to battery,
                    "triggerReason" to reason,
                    "timestamp" to timestamp
                )
                Tasks.await(db.collection("telemetry_logs").add(logEntry), 6, TimeUnit.SECONDS)
            }

            val deviceUpdate = hashMapOf<String, Any>(
                "lastSeenAt" to timestamp,
                "battery" to battery
            )
            if (lat != null && lng != null) {
                deviceUpdate["lastTelemetry"] = hashMapOf(
                    "lat" to lat,
                    "lng" to lng,
                    "accuracy" to accuracyValue,
                    "battery" to battery,
                    "trigger" to reason
                )
            }
            Tasks.await(
                db.collection("devices").document(deviceId).update(deviceUpdate),
                6,
                TimeUnit.SECONDS
            )
            Log.i(
                TAG,
                if (lat != null && lng != null) "telemetry written ($reason)"
                else "heartbeat written without fix ($reason)"
            )
            true
        } catch (error: Throwable) {
            Log.w(TAG, "telemetry write failed", error)
            false
        }
    }

    fun startCommandListener(context: Context) {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank()) {
            Log.w(TAG, "no device id configured; listener not started")
            return
        }
        if (FirebaseAuth.getInstance().currentUser == null) {
            Log.w(TAG, "not signed in; listener not started")
            return
        }

        val db = try {
            FirebaseFirestore.getInstance()
        } catch (error: Throwable) {
            Log.w(TAG, "firebase unavailable; listener not started", error)
            return
        }

        registration?.remove()
        registration = db.collection("devices").document(deviceId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Log.w(TAG, "device listener error", error)
                    return@addSnapshotListener
                }
                if (snapshot == null || !snapshot.exists()) return@addSnapshotListener
                handleDeviceSnapshot(context, db, deviceId, snapshot)
            }
        Log.i(TAG, "device command listener started for $deviceId")
    }

    fun stopCommandListener() {
        registration?.remove()
        registration = null
    }

    fun pushFcmToken(context: Context, token: String?) {
        if (token.isNullOrBlank()) return
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank() || FirebaseAuth.getInstance().currentUser == null) return
        try {
            FirebaseFirestore.getInstance()
                .collection("devices")
                .document(deviceId)
                .update("fcmToken", token)
        } catch (error: Throwable) {
            Log.w(TAG, "fcm token push failed", error)
        }
    }

    fun pushStolen(context: Context, stolen: Boolean) {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank() || FirebaseAuth.getInstance().currentUser == null) return
        try {
            FirebaseFirestore.getInstance()
                .collection("devices")
                .document(deviceId)
                .update("isStolen", stolen)
        } catch (error: Throwable) {
            Log.w(TAG, "stolen flag push failed", error)
        }
    }

    private fun handleDeviceSnapshot(
        context: Context,
        db: FirebaseFirestore,
        deviceId: String,
        snapshot: DocumentSnapshot
    ) {
        val stolen = snapshot.getBoolean("isStolen") ?: false
        if (AegisState.isStolen(context) != stolen) {
            AegisState.setStolen(context, stolen)
        }

        if (snapshot.getBoolean("requestLocate") == true) {
            db.collection("devices").document(deviceId).update("requestLocate", false)
            TelemetryDispatcher.sendNow(context, "LOCATE_REQUEST")
        }

        if (snapshot.getBoolean("requestWipe") == true) {
            Log.w(TAG, "wipe command received")
            db.collection("devices").document(deviceId).update("requestWipe", false)
            AntiTheftAdminReceiver.executeWipe(context)
        }
    }

    private fun readBattery(context: Context): Int {
        return try {
            val filter = android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
            val status = context.registerReceiver(null, filter)
            val level = status?.getIntExtra("level", -1) ?: -1
            val scale = status?.getIntExtra("scale", -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        } catch (error: Exception) {
            -1
        }
    }
}
