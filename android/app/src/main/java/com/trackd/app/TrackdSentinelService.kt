package com.trackd.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

class TrackdSentinelService : Service() {

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "TrackdSentinelService created - starting persistent background guard")
        try {
            startForegroundNotification()
        } catch (e: Exception) {
            Log.e(TAG, "Failed startForegroundNotification in onCreate", e)
        }
        FirestoreSync.startCommandListener(this)
        TelemetryDispatcher.startPeriodic(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "TrackdSentinelService onStartCommand")
        try {
            startForegroundNotification()
        } catch (e: Exception) {
            Log.e(TAG, "Failed startForegroundNotification in onStartCommand", e)
        }
        FirestoreSync.startCommandListener(this)
        TelemetryDispatcher.startPeriodic(this)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.w(TAG, "TrackdSentinelService destroyed - restarting via sticky intent")
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "Task removed from recents - sentinel service remains active")
        FirestoreSync.startCommandListener(this)
        try {
            val restartIntent = Intent(applicationContext, TrackdSentinelService::class.java).also {
                it.setPackage(packageName)
            }
            val pendingIntent = PendingIntent.getService(
                this, 1, restartIntent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager
            alarmManager?.set(
                android.app.AlarmManager.ELAPSED_REALTIME,
                android.os.SystemClock.elapsedRealtime() + 1000,
                pendingIntent
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart alarm onTaskRemoved", e)
        }
    }

    private fun startForegroundNotification() {
        val channelId = "trackd_sentinel_channel"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Trackd Security Shield",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Trackd active in the background for remote locator commands"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Trackd Shield Active")
            .setContentText("Continuous anti-theft and remote command sync running")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+
                startForeground(
                    NOTIFICATION_ID, 
                    notification, 
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException starting foreground service", e)
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error starting foreground service", e)
        }
    }

    companion object {
        private const val TAG = "TrackdSentinel"
        private const val NOTIFICATION_ID = 9001

        fun start(context: Context) {
            try {
                val intent = Intent(context, TrackdSentinelService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start TrackdSentinelService", e)
            }
        }
    }
}
