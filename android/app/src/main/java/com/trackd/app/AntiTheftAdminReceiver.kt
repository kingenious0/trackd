package com.trackd.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class AntiTheftAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        AegisState.setDeviceAdminActive(context, true)
        Log.i(TAG, "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        AegisState.setDeviceAdminActive(context, false)
        Log.w(TAG, "Device admin disabled")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence? {
        return "Trackd protection is required for theft recovery. Disabling removes device protection."
    }

    companion object {
        private const val TAG = "AegisAdmin"

        fun executeWipe(context: Context) {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val component = android.content.ComponentName(context, AntiTheftAdminReceiver::class.java)
            if (!dpm.isAdminActive(component)) {
                Log.w(TAG, "Wipe aborted: admin not active")
                return
            }
            try {
                dpm.wipeData(0)
            } catch (securityException: SecurityException) {
                Log.e(TAG, "wipeData rejected", securityException)
            }
        }
    }
}
