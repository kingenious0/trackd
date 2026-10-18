package com.trackd.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

object TelemetryDispatcher {

    private const val TAG = "AegisTelemetry"
    private const val FIX_TIMEOUT_MS = 20_000L
    private const val PERIODIC_INTERVAL_MS = 5 * 60 * 1000L

    private val handler = Handler(Looper.getMainLooper())
    private var appContext: Context? = null
    private var periodicActive = false

    private val periodicTick = object : Runnable {
        override fun run() {
            if (!periodicActive) return
            appContext?.let { sendNow(it, "PERIODIC") }
            handler.postDelayed(this, PERIODIC_INTERVAL_MS)
        }
    }

    fun startPeriodic(context: Context) {
        appContext = context.applicationContext
        if (periodicActive) return
        periodicActive = true
        handler.postDelayed(periodicTick, PERIODIC_INTERVAL_MS)
        Log.i(TAG, "periodic telemetry heartbeat started")
    }

    fun stopPeriodic() {
        periodicActive = false
        handler.removeCallbacks(periodicTick)
    }

    fun sendNow(context: Context, reason: String) {
        // Hold a temporary wake lock so Android doesn't sleep the CPU while acquiring GPS satellites
        var wakeLock: PowerManager.WakeLock? = null
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "trackd:locate_fix")
            wakeLock?.acquire(25_000L) // 25s auto-expire failsafe
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire wake lock", e)
        }

        val fineGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val coarseGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!fineGranted && !coarseGranted) {
            Log.w(TAG, "location permission not granted; syncing battery only ($reason)")
            post(context, null, null, null, reason, wakeLock)
            return
        }

        val client = LocationServices.getFusedLocationProviderClient(context)
        val priority = if (fineGranted) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val cancellation = CancellationTokenSource()

        val task = try {
            client.getCurrentLocation(priority, cancellation.token)
        } catch (security: SecurityException) {
            null
        }

        if (task == null) {
            fetchLastKnown(context, client, reason, wakeLock)
            return
        }

        handler.postDelayed(
            { if (!task.isComplete) cancellation.cancel() },
            FIX_TIMEOUT_MS
        )

        task.addOnCompleteListener { locationTask ->
            val location = try {
                locationTask.result
            } catch (error: Exception) {
                null
            }
            if (location != null) {
                Log.i(TAG, "Fresh GPS lock obtained: ${location.latitude}, ${location.longitude} (±${location.accuracy}m)")
                post(context, location.latitude, location.longitude, location.accuracy?.toInt(), reason, wakeLock)
                return@addOnCompleteListener
            }
            Log.w(TAG, "getCurrentLocation returned null, querying lastLocation fallback...")
            fetchLastKnown(context, client, reason, wakeLock)
        }
    }

    private fun fetchLastKnown(
        context: Context,
        client: com.google.android.gms.location.FusedLocationProviderClient,
        reason: String,
        wakeLock: PowerManager.WakeLock?
    ) {
        try {
            client.lastLocation.addOnCompleteListener { lastTask ->
                val location = try {
                    lastTask.result
                } catch (error: Exception) {
                    null
                }
                if (location != null) {
                    Log.i(TAG, "Using last known GPS fix: ${location.latitude}, ${location.longitude}")
                    post(context, location.latitude, location.longitude, location.accuracy?.toInt(), reason, wakeLock)
                } else {
                    Log.w(TAG, "No GPS location available on device")
                    post(context, null, null, null, reason, wakeLock)
                }
            }
        } catch (security: SecurityException) {
            post(context, null, null, null, reason, wakeLock)
        }
    }

    private fun post(
        context: Context,
        lat: Double?,
        lng: Double?,
        accuracy: Int?,
        reason: String,
        wakeLock: PowerManager.WakeLock?
    ) {
        Thread {
            try {
                val ok = FirestoreSync.writeTelemetry(context, lat, lng, accuracy, reason)
                if (!ok) Log.w(TAG, "telemetry not written ($reason)")
            } finally {
                try {
                    if (wakeLock?.isHeld == true) {
                        wakeLock.release()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error releasing wake lock", e)
                }
            }
        }.start()
    }
}
