package com.trackd.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

object TelemetryDispatcher {

    private const val TAG = "AegisTelemetry"
    private const val FIX_TIMEOUT_MS = 12_000L
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
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val client = LocationServices.getFusedLocationProviderClient(context)

        if (!granted) {
            Log.w(TAG, "location permission not granted; syncing battery only ($reason)")
            post(context, null, null, null, reason)
            return
        }

        val cancellation = CancellationTokenSource()
        val task = try {
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
        } catch (security: SecurityException) {
            null
        }

        if (task == null) {
            post(context, null, null, null, reason)
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
                post(context, location.latitude, location.longitude, location.accuracy?.toInt(), reason)
                return@addOnCompleteListener
            }
            fetchLastKnown(context, client, reason)
        }
    }

    private fun fetchLastKnown(
        context: Context,
        client: com.google.android.gms.location.FusedLocationProviderClient,
        reason: String
    ) {
        try {
            client.lastLocation.addOnCompleteListener { lastTask ->
                val location = try {
                    lastTask.result
                } catch (error: Exception) {
                    null
                }
                if (location != null) {
                    post(context, location.latitude, location.longitude, location.accuracy?.toInt(), reason)
                } else {
                    post(context, null, null, null, reason)
                }
            }
        } catch (security: SecurityException) {
            post(context, null, null, null, reason)
        }
    }

    private fun post(
        context: Context,
        lat: Double?,
        lng: Double?,
        accuracy: Int?,
        reason: String
    ) {
        Thread {
            val ok = FirestoreSync.writeTelemetry(context, lat, lng, accuracy, reason)
            if (!ok) Log.w(TAG, "telemetry not written ($reason)")
        }.start()
    }
}
