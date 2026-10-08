package com.trackd.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.TextView

class AppDecoyAccessibilityService : AccessibilityService() {

    private var overlayWindow: WindowManager? = null
    private var overlayView: View? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo?.apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = flags or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            notificationTimeout = 100
        }
        overlayWindow = getSystemService(WINDOW_SERVICE) as WindowManager
        Log.i(TAG, "decoy accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val foregroundPackage = event.packageName?.toString() ?: return
        if (foregroundPackage == packageName) return
        if (!AegisState.isStolen(this)) return
        if (!FINTECH_PACKAGES.containsKey(foregroundPackage)) return

        Log.i(TAG, "fintech launch intercepted: $foregroundPackage")
        val appName = FINTECH_PACKAGES.getValue(foregroundPackage)
        returnHome()
        showCrashOverlay(appName)
    }

    override fun onInterrupt() {
        hideCrashOverlay()
    }

    override fun onDestroy() {
        hideCrashOverlay()
        super.onDestroy()
    }

    private fun returnHome() {
        val home = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(home)
        } catch (error: Exception) {
            Log.w(TAG, "home launch failed", error)
        }
    }

    private fun showCrashOverlay(appName: String) {
        if (overlayView != null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Log.w(TAG, "overlay permission missing; crash decoy skipped")
            return
        }

        val inflater = LayoutInflater.from(this)
        val view = inflater.inflate(R.layout.dialog_fake_crash, null, false)
        view.findViewById<TextView>(R.id.crash_message).text =
            getString(R.string.crash_message_template, appName)
        view.findViewById<Button>(R.id.crash_close).setOnClickListener {
            hideCrashOverlay()
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
            dimAmount = 0.85f
            flags = flags or WindowManager.LayoutParams.FLAG_DIM_BEHIND
        }

        try {
            overlayWindow?.addView(view, params)
            overlayView = view
        } catch (error: Exception) {
            Log.e(TAG, "overlay add failed", error)
        }
    }

    private fun hideCrashOverlay() {
        val view = overlayView ?: return
        try {
            overlayWindow?.removeView(view)
        } catch (error: Exception) {
            Log.w(TAG, "overlay remove failed", error)
        }
        overlayView = null
    }

    companion object {
        private const val TAG = "AegisDecoy"

        val FINTECH_PACKAGES: Map<String, String> = mapOf(
            "com.mtn.mymtn" to "MTN Mobile Money",
            "com.vodafone.myvodafone" to "Vodafone Cash",
            "com.at.ghana" to "AT Money",
            "com.gcb.mobilebanking" to "GCB Mobile Banking",
            "com.ecobank.mobile" to "Ecobank Mobile",
            "com.zenithbank.ghana" to "Zenith Bank",
            "com.fidelity.ghana" to "Fidelity Bank",
            "com.stanbic.banking" to "Stanbic Bank",
            "com.zeepay.mobile" to "Zeepay",
            "com.hubtel.merchant" to "Hubtel Merchant"
        )
    }
}
