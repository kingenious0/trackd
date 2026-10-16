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

    private const val PREF_OFFLINE_QUEUE = "offline_telemetry_queue"
    private const val MAX_OFFLINE_ITEMS = 25

    private fun enqueueOfflineWrite(
        context: Context,
        lat: Double?,
        lng: Double?,
        accuracy: Int?,
        battery: Int,
        reason: String,
        timestamp: String
    ) {
        try {
            val prefs = context.getSharedPreferences("trackd_offline_sync", Context.MODE_PRIVATE)
            val currentRaw = prefs.getString(PREF_OFFLINE_QUEUE, "[]") ?: "[]"
            val array = org.json.JSONArray(currentRaw)
            val item = org.json.JSONObject().apply {
                if (lat != null) put("lat", lat)
                if (lng != null) put("lng", lng)
                if (accuracy != null) put("accuracy", accuracy)
                put("battery", battery)
                put("reason", reason)
                put("timestamp", timestamp)
            }
            array.put(item)
            val trimmed = if (array.length() > MAX_OFFLINE_ITEMS) {
                val newArr = org.json.JSONArray()
                val start = array.length() - MAX_OFFLINE_ITEMS
                for (i in start until array.length()) {
                    newArr.put(array.get(i))
                }
                newArr
            } else array
            prefs.edit().putString(PREF_OFFLINE_QUEUE, trimmed.toString()).apply()
            Log.i(TAG, "Cached telemetry offline (queue length: ${trimmed.length()})")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to enqueue offline telemetry", e)
        }
    }

    private fun flushOfflineQueue(context: Context, db: FirebaseFirestore, deviceId: String, userId: String) {
        try {
            val prefs = context.getSharedPreferences("trackd_offline_sync", Context.MODE_PRIVATE)
            val raw = prefs.getString(PREF_OFFLINE_QUEUE, null) ?: return
            val array = org.json.JSONArray(raw)
            if (array.length() == 0) return

            Log.i(TAG, "Flushing ${array.length()} queued offline telemetry points")
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val logEntry = hashMapOf<String, Any>(
                    "deviceId" to deviceId,
                    "userId" to userId,
                    "battery" to obj.optInt("battery", 0),
                    "triggerReason" to obj.optString("reason", "OFFLINE_FLUSH"),
                    "timestamp" to obj.optString("timestamp", isoNow()),
                    "offlineCached" to true
                )
                if (obj.has("lat") && obj.has("lng")) {
                    logEntry["lat"] = obj.getDouble("lat")
                    logEntry["lng"] = obj.getDouble("lng")
                    logEntry["accuracy"] = obj.optInt("accuracy", 0)
                }
                db.collection("telemetry_logs").add(logEntry)
            }
            prefs.edit().remove(PREF_OFFLINE_QUEUE).apply()
            Log.i(TAG, "Offline telemetry queue flushed successfully")
        } catch (e: Exception) {
            Log.w(TAG, "Error flushing offline telemetry queue", e)
        }
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
        val battery = readBattery(context)
        val timestamp = isoNow()
        val accuracyValue = accuracy ?: 0

        if (deviceId.isNullOrBlank() || userId.isNullOrBlank()) {
            Log.w(TAG, "device or user not configured; telemetry skipped")
            return false
        }
        if (FirebaseAuth.getInstance().currentUser == null) {
            Log.w(TAG, "not signed in; queueing telemetry offline ($reason)")
            enqueueOfflineWrite(context, lat, lng, accuracy, battery, reason, timestamp)
            return false
        }

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
            // On successful live write, flush any previously queued offline data points
            flushOfflineQueue(context, db, deviceId, userId)
            true
        } catch (error: Throwable) {
            Log.w(TAG, "telemetry write failed; queueing locally", error)
            enqueueOfflineWrite(context, lat, lng, accuracy, battery, reason, timestamp)
            false
        }
    }

    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

    fun ensureFcmToken(context: Context) {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank()) return
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (!token.isNullOrBlank()) {
                        Log.i(TAG, "FCM token fetched: $token")
                        AegisState.putString(context, AegisPushService.KEY_FCM_TOKEN, token)
                        pushFcmToken(context, token)
                    }
                }
                .addOnFailureListener { e ->
                    Log.w(TAG, "Failed to get FCM token", e)
                }
        } catch (e: Exception) {
            Log.w(TAG, "ensureFcmToken error", e)
        }
    }

    fun startCommandListener(context: Context) {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank()) {
            Log.w(TAG, "no device id configured; listener not started")
            return
        }

        ensureFcmToken(context)
        syncDeviceState(context)

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
                    Log.w(TAG, "device listener error: ${error.message}; scheduling reconnect", error)
                    registration?.remove()
                    registration = null
                    mainHandler.postDelayed({
                        startCommandListener(context)
                    }, 5000L)
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

    fun syncDeviceState(context: Context) {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank()) return
        try {
            val db = FirebaseFirestore.getInstance()
            db.collection("devices").document(deviceId).get(com.google.firebase.firestore.Source.SERVER)
                .addOnSuccessListener { snapshot ->
                    if (snapshot != null && snapshot.exists()) {
                        handleDeviceSnapshot(context, db, deviceId, snapshot)
                    }
                }
                .addOnFailureListener {
                    db.collection("devices").document(deviceId).get()
                        .addOnSuccessListener { snapshot ->
                            if (snapshot != null && snapshot.exists()) {
                                handleDeviceSnapshot(context, db, deviceId, snapshot)
                            }
                        }
                }
        } catch (error: Throwable) {
            Log.w(TAG, "syncDeviceState error", error)
        }
    }

    fun pushFcmToken(context: Context, token: String?) {
        val effectiveToken = token ?: AegisState.getString(context, AegisPushService.KEY_FCM_TOKEN)
        if (effectiveToken.isNullOrBlank()) return
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        if (deviceId.isNullOrBlank()) return
        try {
            FirebaseFirestore.getInstance()
                .collection("devices")
                .document(deviceId)
                .update("fcmToken", effectiveToken)
                .addOnSuccessListener {
                    Log.i(TAG, "fcm token pushed to Firestore for $deviceId")
                }
                .addOnFailureListener { e ->
                    Log.w(TAG, "fcm token update in Firestore failed", e)
                }
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
        val rawStolen = snapshot.get("isStolen")
        if (rawStolen != null) {
            val stolen = when (rawStolen) {
                is Boolean -> rawStolen
                is String -> rawStolen.equals("true", ignoreCase = true)
                is Number -> rawStolen.toInt() == 1
                else -> false
            }
            val isFromCache = snapshot.metadata.isFromCache
            val currentStolen = AegisState.isStolen(context)
            Log.i(TAG, "device snapshot: isStolen=$stolen (current=$currentStolen, isFromCache=$isFromCache)")
            if (currentStolen != stolen) {
                Log.i(TAG, "Updating AegisState.isStolen from $currentStolen to $stolen")
                AegisState.setStolen(context, stolen)
            }
        }

        if (snapshot.getBoolean("requestLocate") == true) {
            db.collection("devices").document(deviceId).update("requestLocate", false)
            TelemetryDispatcher.sendNow(context, "LOCATE_REQUEST")
        }

        if (snapshot.getBoolean("requestSiren") == true) {
            Log.i(TAG, "siren request received via Firestore")
            db.collection("devices").document(deviceId).update("requestSiren", false)
            HardwareAlarm.play(context, 20000L)
        }

        if (snapshot.getBoolean("stopSiren") == true) {
            Log.i(TAG, "stop siren request received via Firestore")
            db.collection("devices").document(deviceId).update("stopSiren", false)
            HardwareAlarm.stop()
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
