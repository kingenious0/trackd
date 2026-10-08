package com.trackd.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

object TelemetryDispatcher {

    private const val TAG = "AegisTelemetry"

    fun sendNow(context: Context, reason: String) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val client = LocationServices.getFusedLocationProviderClient(context)
        val task = try {
            if (granted) client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null) else null
        } catch (security: SecurityException) {
            null
        }

        if (task == null) {
            post(context, null, null, null, reason)
            return
        }

        task.addOnCompleteListener { locationTask ->
            val location = locationTask.result
            post(
                context,
                location?.latitude,
                location?.longitude,
                location?.accuracy?.toInt(),
                reason
            )
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
