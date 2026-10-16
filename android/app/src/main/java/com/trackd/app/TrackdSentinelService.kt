package com.trackd.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class TrackdSentinelService : Service() {

    private var shutdownReceiver: ShutdownReceiver? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "TrackdSentinelService created - starting persistent background guard")
        try {
            startForegroundNotification()
        } catch (e: Exception) {
            Log.e(TAG, "Failed startForegroundNotification in onCreate", e)
        }
        FirestoreSync.startCommandListener(this)
        FirestoreSync.ensureFcmToken(this)
        TelemetryDispatcher.startPeriodic(this)

        if (shutdownReceiver == null) {
            try {
                shutdownReceiver = ShutdownReceiver()
                val filter = android.content.IntentFilter().apply {
                    addAction(Intent.ACTION_SHUTDOWN)
                    addAction("android.intent.action.QUICKBOOT_POWEROFF")
                    addAction("com.htc.intent.action.QUICKBOOT_POWEROFF")
                }
                registerReceiver(shutdownReceiver, filter)
                Log.i(TAG, "ShutdownReceiver dynamically registered for ACTION_SHUTDOWN")
            } catch (e: Exception) {
                Log.w(TAG, "Failed dynamic registration of ShutdownReceiver", e)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "TrackdSentinelService onStartCommand")
        try {
            startForegroundNotification()
        } catch (e: Exception) {
            Log.e(TAG, "Failed startForegroundNotification in onStartCommand", e)
        }
        FirestoreSync.startCommandListener(this)
        FirestoreSync.ensureFcmToken(this)
        TelemetryDispatcher.startPeriodic(this)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.w(TAG, "TrackdSentinelService destroyed - scheduling restart")
        shutdownReceiver?.let {
            try {
                unregisterReceiver(it)
                Log.i(TAG, "ShutdownReceiver unregistered")
            } catch (_: Exception) {}
            shutdownReceiver = null
        }
        scheduleRestart(3_000L)
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "Task removed from recents - sentinel service scheduling immediate restart")
        scheduleRestart(1_000L)
    }

    private fun scheduleRestart(delayMs: Long) {
        try {
            val restartIntent = Intent(applicationContext, TrackdSentinelService::class.java).also {
                it.setPackage(packageName)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PendingIntent.getForegroundService(applicationContext, 1, restartIntent, flags)
            } else {
                PendingIntent.getService(applicationContext, 1, restartIntent, flags)
            }
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager
            val triggerAt = android.os.SystemClock.elapsedRealtime() + delayMs
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || (alarmManager?.canScheduleExactAlarms() == true)
                if (canExact) {
                    alarmManager?.setExactAndAllowWhileIdle(
                        android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAt,
                        pendingIntent
                    )
                } else {
                    alarmManager?.setAndAllowWhileIdle(
                        android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAt,
                        pendingIntent
                    )
                }
            } else {
                alarmManager?.set(
                    android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAt,
                    pendingIntent
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart alarm", e)
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+ (API 34)
                val hasFine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                val hasCoarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                val hasBgLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

                // On Android 14 (targetSdk 34), FOREGROUND_SERVICE_TYPE_LOCATION requires location permission
                // AND either foreground state or background location exemption. If started during initial launch
                // before permissions are granted, or restarting in background, passing LOCATION causes a fatal SecurityException.
                // We default to DATA_SYNC (authorized by FOREGROUND_SERVICE_DATA_SYNC), combining LOCATION only if permitted.
                var serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                if ((hasFine || hasCoarse) && hasBgLocation) {
                    serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                }

                try {
                    startForeground(NOTIFICATION_ID, notification, serviceType)
                } catch (se: SecurityException) {
                    Log.w(TAG, "Location/combined FGS rejected, falling back to DATA_SYNC only", se)
                    try {
                        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                    } catch (inner: Throwable) {
                        Log.e(TAG, "Failed to start FGS with DATA_SYNC fallback", inner)
                    }
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // Android 10-13 (API 29-33)
                val hasFine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                val hasCoarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                val serviceType = if (hasFine || hasCoarse) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
                if (serviceType != 0) {
                    startForeground(NOTIFICATION_ID, notification, serviceType)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
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
