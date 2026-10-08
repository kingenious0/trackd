package com.trackd.app

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.telephony.TelephonyManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.firebase.auth.FirebaseAuth
import java.security.MessageDigest

@CapacitorPlugin(
    name = "TrackdBridge",
    permissions = [
        Permission(strings = [Manifest.permission.READ_PHONE_STATE], alias = "phoneState"),
        Permission(
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ],
            alias = "location"
        ),
        Permission(
            strings = [
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_SMS,
                Manifest.permission.SEND_SMS
            ],
            alias = "sms"
        ),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
        Permission(strings = [Manifest.permission.READ_PHONE_NUMBERS], alias = "phoneNumbers")
    ]
)
class TrackdBridgePlugin : Plugin() {

    private var activeRingtone: Ringtone? = null
    private val sirenHandler: Handler = Handler(Looper.getMainLooper())

    @PluginMethod
    fun scanInstalledFintechApps(call: PluginCall) {
        val packages = AppDecoyAccessibilityService.FINTECH_PACKAGES
        val manager = context.packageManager
        val result = JSArray()

        packages.forEach { (packageName, label) ->
            try {
                manager.getPackageInfo(packageName, 0)
                val entry = JSObject()
                entry.put("packageName", packageName)
                entry.put("appName", label)
                result.put(entry)
            } catch (notFound: PackageManager.NameNotFoundException) {
                return@forEach
            }
        }

        val response = JSObject()
        response.put("installed", result)
        response.put("total", result.length())
        call.resolve(response)
    }

    @PluginMethod
    fun requestDeviceAdmin(call: PluginCall) {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Trackd needs device administrator to block uninstall and enable remote wipe."
            )
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(call, intent)
    }

    @PluginMethod
    fun isDeviceAdminActive(call: PluginCall) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val response = JSObject()
        response.put("active", dpm.isAdminActive(adminComponent()))
        call.resolve(response)
    }

    @PluginMethod
    fun saveEmergencyContact(call: PluginCall) {
        val phone = call.getString("phone")
        val pin = call.getString("pin")
        if (phone.isNullOrBlank() || pin.isNullOrBlank() || pin.length < 4) {
            call.reject("phone and a PIN of at least 4 characters are required")
            return
        }

        AegisState.putString(context, AegisState.KEY_EMERGENCY_PHONE, phone.trim())
        AegisState.putString(context, AegisState.KEY_MASTER_PIN_HASH, sha256(pin))

        val serial = readSimSerial()
        if (!serial.isNullOrBlank()) {
            AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, serial)
        }

        val response = JSObject()
        response.put("saved", true)
        call.resolve(response)
    }

    @PluginMethod
    fun saveDeviceCredentials(call: PluginCall) {
        val phone = call.getString("emergencyPhone")
        val pinHash = call.getString("pinHash")
        val simSerial = call.getString("simSerial")
        if (phone.isNullOrBlank() || pinHash.isNullOrBlank()) {
            call.reject("emergencyPhone and pinHash are required")
            return
        }

        AegisState.putString(context, AegisState.KEY_EMERGENCY_PHONE, phone.trim())
        AegisState.putString(context, AegisState.KEY_MASTER_PIN_HASH, pinHash.trim().lowercase())

        val serial = if (!simSerial.isNullOrBlank()) simSerial else readSimSerial()
        if (!serial.isNullOrBlank()) {
            AegisState.putString(context, AegisState.KEY_REGISTERED_SIM, serial)
        }

        val response = JSObject()
        response.put("saved", true)
        call.resolve(response)
    }

    @PluginMethod
    fun configureAccount(call: PluginCall) {
        val email = call.getString("email")
        val password = call.getString("password")
        val deviceId = call.getString("deviceId")
        val projectId = call.getString("projectId")
        if (email.isNullOrBlank() || password.isNullOrBlank() || deviceId.isNullOrBlank()) {
            call.reject("email, password and deviceId are required")
            return
        }

        AegisState.putString(context, AegisState.KEY_DEVICE_ID, deviceId)
        if (!projectId.isNullOrBlank()) {
            AegisState.putString(context, AegisState.KEY_PROJECT_ID, projectId)
        }

        try {
            FirebaseAuth.getInstance().signInWithEmailAndPassword(email, password)
                .addOnCompleteListener { task ->
                    if (!task.isSuccessful) {
                        call.reject(
                            "sign-in failed",
                            task.exception
                        )
                        return@addOnCompleteListener
                    }
                    val uid = FirebaseAuth.getInstance().currentUser?.uid ?: ""
                    AegisState.putString(context, AegisState.KEY_USER_ID, uid)
                    AegisState.putString(context, AegisState.KEY_USER_EMAIL, email)
                    FirestoreSync.startCommandListener(context)
                    FirestoreSync.pushFcmToken(
                        context,
                        AegisState.getString(context, AegisPushService.KEY_FCM_TOKEN)
                    )
                    TelemetryDispatcher.sendNow(context, "APP_LINKED")
                    val response = JSObject()
                    response.put("uid", uid)
                    call.resolve(response)
                }
        } catch (error: Exception) {
            call.reject("Sign-in is unavailable right now. Please try again.", error)
        }
    }

    @PluginMethod
    fun checkAccessibilityPermission(call: PluginCall) {
        val enabled = isDecoyServiceEnabled()
        val response = JSObject()
        response.put("enabled", enabled)
        call.resolve(response)
    }

    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(call, intent)
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${context.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(call, intent)
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:${context.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(call, intent)
    }

    @PluginMethod
    fun getDeviceStatus(call: PluginCall) {
        val response = JSObject()
        response.put("isStolen", AegisState.isStolen(context))
        response.put("deviceAdminActive", AegisState.isDeviceAdminActive(context))
        response.put("accessibilityEnabled", isDecoyServiceEnabled())
        response.put(
            "emergencyContact",
            AegisState.getString(context, AegisState.KEY_EMERGENCY_PHONE)
        )
        response.put("simRegistered", AegisState.getString(context, AegisState.KEY_REGISTERED_SIM) != null)
        call.resolve(response)
    }

    @PluginMethod
    fun getLinkState(call: PluginCall) {
        val deviceId = AegisState.getString(context, AegisState.KEY_DEVICE_ID)
        val user = FirebaseAuth.getInstance().currentUser
        val response = JSObject()
        response.put("configured", !deviceId.isNullOrBlank() && user != null)
        response.put("deviceId", deviceId ?: "")
        response.put("uid", user?.uid ?: "")
        response.put(
            "email",
            AegisState.getString(context, AegisState.KEY_USER_EMAIL) ?: (user?.email ?: "")
        )
        call.resolve(response)
    }

    @PluginMethod
    fun markStolen(call: PluginCall) {
        val stolen = call.getBoolean("stolen", true) ?: true
        AegisState.setStolen(context, stolen)
        val response = JSObject()
        response.put("isStolen", stolen)
        call.resolve(response)
    }

    @PluginMethod
    fun isBatteryOptimizationIgnored(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val ignored = pm.isIgnoringBatteryOptimizations(context.packageName)
        val response = JSObject()
        response.put("ignored", ignored)
        call.resolve(response)
    }

    @PluginMethod
    fun requestIgnoreBatteryOptimization(call: PluginCall) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(call, intent)
    }

    @PluginMethod
    fun testHardwareSiren(call: PluginCall) {
        val durationMs = call.getLong("durationMs") ?: 4000L
        try {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            activeRingtone?.stop()
            activeRingtone = RingtoneManager.getRingtone(context, alarmUri)?.apply {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                    audioAttributes = android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                }
                play()
            }

            sirenHandler.removeCallbacksAndMessages(null)
            sirenHandler.postDelayed({
                try {
                    activeRingtone?.stop()
                    activeRingtone = null
                } catch (_: Exception) {}
            }, durationMs)

            val response = JSObject()
            response.put("playing", true)
            call.resolve(response)
        } catch (e: Exception) {
            call.reject("Failed to trigger hardware siren", e)
        }
    }

    @PluginMethod
    fun stopHardwareSiren(call: PluginCall) {
        try {
            sirenHandler.removeCallbacksAndMessages(null)
            activeRingtone?.stop()
            activeRingtone = null
            val response = JSObject()
            response.put("stopped", true)
            call.resolve(response)
        } catch (e: Exception) {
            call.reject("Failed to stop hardware siren", e)
        }
    }

    private fun readSimSerial(): String? {
        return try {
            if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                val telephony =
                    context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                telephony.simSerialNumber
            } else {
                null
            }
        } catch (security: SecurityException) {
            null
        }
    }

    private fun isDecoyServiceEnabled(): Boolean {
        val expected = "${context.packageName}/${AppDecoyAccessibilityService::class.java.name}"
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    private fun adminComponent(): ComponentName =
        ComponentName(context, AntiTheftAdminReceiver::class.java)

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString(separator = "") { "%02x".format(it) }
    }

    private fun startActivity(call: PluginCall, intent: Intent) {
        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("unable to launch intent", error)
        }
    }
}
