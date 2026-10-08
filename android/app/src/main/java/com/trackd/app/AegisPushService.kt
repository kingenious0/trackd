package com.trackd.app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AegisPushService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        AegisState.putString(this, KEY_FCM_TOKEN, token)
        FirestoreSync.pushFcmToken(this, token)
        Log.i(TAG, "fcm token refreshed")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val action = message.data["action"] ?: return
        Log.i(TAG, "push action: $action")
        when (action) {
            "STOLEN" -> AegisState.setStolen(this, true)
            "SAFE" -> AegisState.setStolen(this, false)
            "LOCATE" -> TelemetryDispatcher.sendNow(this, "FCM_WAKE")
            "SIREN" -> HardwareAlarm.play(this, 30000L)
            "STOP_SIREN" -> HardwareAlarm.stop()
            "WIPE" -> AntiTheftAdminReceiver.executeWipe(this)
        }
    }

    companion object {
        private const val TAG = "AegisPush"
        const val KEY_FCM_TOKEN = "fcm_token"
    }
}
