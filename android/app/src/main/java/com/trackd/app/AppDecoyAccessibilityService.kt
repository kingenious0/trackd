package com.trackd.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.content.pm.ApplicationInfo
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
        TrackdSentinelService.start(this)
        FirestoreSync.startCommandListener(this)
        TelemetryDispatcher.startPeriodic(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val foregroundPackage = event.packageName?.toString() ?: return
        if (foregroundPackage == packageName) return
        if (!AegisState.isStolen(this)) return

        // 1. Anti-Tamper: Block thief from opening Android Settings or Package Installer when phone is stolen
        if (foregroundPackage == "com.android.settings" || 
            foregroundPackage == "com.google.android.packageinstaller" || 
            foregroundPackage == "com.android.packageinstaller"
        ) {
            Log.w(TAG, "Anti-tamper: settings or installer access blocked while stolen ($foregroundPackage)")
            returnHome()
            showCrashOverlay("Settings")
            return
        }

        // 2. Check explicitly mapped Ghana fintech packages
        var appName = FINTECH_PACKAGES[foregroundPackage]

        // 3. Zero-Day Catch: Inspect package name and app label for banking/fintech indicators
        if (appName == null) {
            try {
                val appInfo = packageManager.getApplicationInfo(foregroundPackage, 0)
                val label = packageManager.getApplicationLabel(appInfo).toString()
                val lowerPkg = foregroundPackage.lowercase()
                val lowerLabel = label.lowercase()
                val financeKeywords = listOf("bank", "momo", "wallet", "ghanapay", "money", "fintech", "cash")
                if (financeKeywords.any { lowerPkg.contains(it) || lowerLabel.contains(it) }) {
                    appName = if (label.isNotBlank()) label else "Banking App"
                }
            } catch (_: Exception) {}
        }

        if (appName != null) {
            Log.i(TAG, "fintech launch intercepted: $foregroundPackage ($appName)")
            returnHome()
            showCrashOverlay(appName)
        }
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
            // Mobile Money & Wallets (Ghana)
            "mtnft.momo.consumer" to "MTN Mobile Money",
            "mtnft.momo.groupbiz" to "MTN MoMo Business",
            "com.mtngh.mymtn" to "MyMTN Ghana",
            "com.myvodafone.app" to "Telecel Cash",
            "com.airteltigo.app" to "AT Money",
            "com.gmoney.consumerapp" to "G-Money",
            "ma.bits.ghipss_wallet_customer" to "GhanaPay",

            // Commercial Banks (Ghana)
            "com.modefin.gcbui" to "GCB Bank",
            "com.ofss.gcbbank" to "GCB Internet Banking",
            "com.app.ecobank" to "Ecobank Mobile",
            "com.fidelity.mobile" to "Fidelity Bank",
            "com.absa.gh.mobile.android.ui" to "Absa Ghana",
            "com.sbg.mobile.phone" to "Stanbic Bank",
            "calbank.com.app" to "CalBank",
            "com.breezeghana.ui" to "SC Mobile Ghana",
            "com.mode.umb.ui" to "UMB SpeedApp",
            "gtbank.myghpay" to "GTBank",
            "com.uba.vericash" to "UBA Mobile",
            "zenithbank.com.zenithbankmobileappghana" to "Zenith Bank",
            "com.xnett.fasyl.adb.mobilebanking" to "ADB Mobile",
            "com.accessbank.accessbankapp" to "Access Bank",

            // Fintechs, Wallets & Payment Gateways
            "com.hubtel.hcb" to "Hubtel",
            "com.expresspay" to "expressPay",
            "com.dreamoval.slydepay.android.cruise" to "slydePay",
            "com.cyst.mazzumapp" to "Mazzuma",
            "com.zeepay.mobile" to "Zeepay",
            "com.chippercash" to "Chipper Cash"
        )
    }
}
