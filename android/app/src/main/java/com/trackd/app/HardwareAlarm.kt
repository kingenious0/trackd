package com.trackd.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

object HardwareAlarm {
    private const val TAG = "HardwareAlarm"
    private var activeRingtone: Ringtone? = null
    private val handler = Handler(Looper.getMainLooper())

    @Synchronized
    fun play(context: Context, durationMs: Long = 15000L) {
        try {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            activeRingtone?.stop()
            activeRingtone = RingtoneManager.getRingtone(context.applicationContext, alarmUri)?.apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                        .build()
                }
                play()
            }

            handler.removeCallbacksAndMessages(null)
            if (durationMs > 0) {
                handler.postDelayed({
                    stop()
                }, durationMs)
            }
            Log.i(TAG, "Hardware siren playing (max volume) for $durationMs ms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger hardware siren", e)
        }
    }

    @Synchronized
    fun stop() {
        try {
            handler.removeCallbacksAndMessages(null)
            activeRingtone?.stop()
            activeRingtone = null
            Log.i(TAG, "Hardware siren stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop hardware siren", e)
        }
    }

    fun isPlaying(): Boolean = activeRingtone?.isPlaying == true
}
