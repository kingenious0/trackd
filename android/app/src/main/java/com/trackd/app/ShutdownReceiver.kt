package com.trackd.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

class ShutdownReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_SHUTDOWN && action != QUICKBOOT_POWEROFF) return

        Log.i(TAG, "shutdown intent intercepted: $action")
        val pending = goAsync()
        val timeout = CancellationTokenSource()
        val client = LocationServices.getFusedLocationProviderClient(context)

        val task = try {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, timeout.token)
            } else {
                client.lastLocation
            }
        } catch (security: SecurityException) {
            Log.w(TAG, "location unavailable", security)
            null
        }

        task?.addOnCompleteListener { locationTask ->
            val location = locationTask.result
            timeout.cancel()
            val lat = location?.latitude
            val lng = location?.longitude
            val accuracy = location?.accuracy?.toInt()
            Thread {
                try {
                    dispatch(context, lat, lng, accuracy)
                } finally {
                    pending.finish()
                }
            }.start()
        } ?: run {
            timeout.cancel()
            Thread {
                try {
                    dispatch(context, null, null, null)
                } finally {
                    pending.finish()
                }
            }.start()
        }
    }

    private fun dispatch(
        context: Context,
        lat: Double?,
        lng: Double?,
        accuracy: Int?
    ) {
        var written = false
        if (isOnline(context)) {
            val worker = Thread {
                written = postViaRest(context, lat, lng, accuracy)
            }
            worker.start()
            worker.join(8000)
        }
        if (written) {
            Log.i(TAG, "shutdown telemetry written via Firestore REST")
        } else {
            sendFallbackSms(context, lat, lng)
        }
    }

    /**
     * Dual-channel primary path: direct Firestore REST document create on
     * telemetry_logs, plus a PATCH of the device's lastTelemetry/lastSeenAt.
     * Returns false on any failure so the caller falls back to SMS.
     */
    private fun postViaRest(
        context: Context,
        lat: Double?,
        lng: Double?,
        accuracy: Int?
    ): Boolean {
        val projectId = AegisState.getString(context, AegisState.KEY_PROJECT_ID)
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        val userId = AegisState.getString(context, AegisState.KEY_USER_ID)
        if (projectId.isNullOrBlank() || deviceId.isNullOrBlank() || userId.isNullOrBlank()) {
            Log.w(TAG, "firebase config missing; falling back to SMS")
            return false
        }
        if (lat == null || lng == null) {
            Log.w(TAG, "no GPS fix; falling back to SMS")
            return false
        }

        val idToken = try {
            val user = FirebaseAuth.getInstance().currentUser ?: return false
            Tasks.await(user.getIdToken(false), 6, TimeUnit.SECONDS).token
        } catch (error: Throwable) {
            Log.w(TAG, "id token unavailable", error)
            return false
        }
        if (idToken.isNullOrBlank()) return false

        val battery = readBatteryLevel(context)
        val timestamp = isoNow()
        val accuracyValue = accuracy ?: 0
        val base =
            "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents"

        return try {
            val logFields = JSONObject()
                .put("deviceId", stringValue(deviceId))
                .put("userId", stringValue(userId))
                .put("lat", doubleValue(lat))
                .put("lng", doubleValue(lng))
                .put("accuracy", intValue(accuracyValue))
                .put("battery", intValue(battery))
                .put("triggerReason", stringValue("SHUTDOWN"))
                .put("timestamp", timestampValue(timestamp))
            if (!restPost("$base/telemetry_logs", idToken, JSONObject().put("fields", logFields))) {
                return false
            }

            val telemetryMap = JSONObject()
                .put("fields", JSONObject()
                    .put("lat", doubleValue(lat))
                    .put("lng", doubleValue(lng))
                    .put("accuracy", intValue(accuracyValue))
                    .put("battery", intValue(battery))
                    .put("trigger", stringValue("SHUTDOWN")))
            val deviceFields = JSONObject()
                .put("lastSeenAt", timestampValue(timestamp))
                .put("lastTelemetry", JSONObject().put("mapValue", telemetryMap))
            restPatch(
                "$base/devices/$deviceId?updateMask.fieldPaths=lastSeenAt&updateMask.fieldPaths=lastTelemetry",
                idToken,
                JSONObject().put("fields", deviceFields)
            )
        } catch (error: Throwable) {
            Log.w(TAG, "REST telemetry failed", error)
            false
        }
    }

    private fun restPost(url: String, idToken: String, body: JSONObject): Boolean {
        return restCall(url, idToken, body, "POST")
    }

    private fun restPatch(url: String, idToken: String, body: JSONObject): Boolean {
        return restCall(url, idToken, body, "PATCH")
    }

    private fun restCall(url: String, idToken: String, body: JSONObject, method: String): Boolean {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.doOutput = true
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.setRequestProperty("Authorization", "Bearer $idToken")
            connection.setRequestProperty("Content-Type", "application/json")
            OutputStreamWriter(connection.outputStream).use { it.write(body.toString()) }
            val code = connection.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "REST $method failed ($code)")
                return false
            }
            return true
        } finally {
            connection.disconnect()
        }
    }

    private fun stringValue(value: String): JSONObject =
        JSONObject().put("stringValue", value)

    private fun doubleValue(value: Double): JSONObject =
        JSONObject().put("doubleValue", value)

    private fun intValue(value: Int): JSONObject =
        JSONObject().put("integerValue", value)

    private fun timestampValue(value: String): JSONObject =
        JSONObject().put("timestampValue", value)

    private fun isoNow(): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date())
    }

    private fun sendFallbackSms(context: Context, lat: Double?, lng: Double?) {
        val phone = AegisState.getString(context, AegisState.KEY_EMERGENCY_PHONE)
        if (phone.isNullOrBlank()) {
            Log.w(TAG, "no emergency contact configured")
            return
        }
        val coordinates = if (lat != null && lng != null) {
            "https://maps.google.com/?q=$lat,$lng"
        } else {
            "coordinates unavailable"
        }
        val message = "ALERT [TRACKD]: Phone powering down. Last GPS: $coordinates"
        try {
            val sms = SmsManager.getDefault()
            sms.sendTextMessage(phone, null, message, null, null)
            Log.i(TAG, "shutdown SMS dispatched")
        } catch (error: Exception) {
            Log.e(TAG, "shutdown SMS failed", error)
        }
    }

    private fun isOnline(context: Context): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun readBatteryLevel(context: Context): Int {
        return try {
            val filter = android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val status = context.registerReceiver(null, filter)
            val level = status?.getIntExtra("level", -1) ?: -1
            val scale = status?.getIntExtra("scale", -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        } catch (error: Exception) {
            -1
        }
    }

    companion object {
        private const val TAG = "AegisShutdown"
        private const val QUICKBOOT_POWEROFF = "android.intent.action.QUICKBOOT_POWEROFF"
    }
}
