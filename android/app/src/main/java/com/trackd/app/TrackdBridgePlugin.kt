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
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
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
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import android.provider.ContactsContract
import androidx.activity.result.ActivityResult
import com.getcapacitor.annotation.ActivityCallback

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

        var modified = false
        if (!pin.isNullOrBlank()) {
            if (pin.trim().length >= 4) {
                AegisState.putString(context, AegisState.KEY_MASTER_PIN_HASH, sha256(pin.trim()))
                modified = true
            } else {
                call.reject("PIN must be at least 4 digits")
                return
            }
        }

        if (!phone.isNullOrBlank()) {
            AegisState.putString(context, AegisState.KEY_EMERGENCY_PHONE, phone.trim())
            modified = true
        }

        if (!modified) {
            call.reject("phone or a PIN of at least 4 digits is required")
            return
        }

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
        
        // Authoritative Device Administrator check directly against system DPM
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val isAdminActive = dpm.isAdminActive(adminComponent())
        AegisState.setDeviceAdminActive(context, isAdminActive)
        response.put("deviceAdminActive", isAdminActive)
        
        response.put("accessibilityEnabled", isDecoyServiceEnabled())
        response.put(
            "emergencyContact",
            AegisState.getString(context, AegisState.KEY_EMERGENCY_PHONE)
        )
        response.put("simRegistered", AegisState.getString(context, AegisState.KEY_REGISTERED_SIM) != null)

        // Real hardware battery percentage from Android OS
        try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
            response.put("batteryLevel", batteryPct)
        } catch (_: Exception) {
            response.put("batteryLevel", -1)
        }

        // Real overlay permission
        val overlayEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
        response.put("overlayEnabled", overlayEnabled)

        // Real hardware model and friendly device name
        var friendlyName = ""
        try {
            friendlyName = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) ?: ""
        } catch (_: Exception) {}

        if (friendlyName.isBlank()) {
            try {
                friendlyName = Settings.Secure.getString(context.contentResolver, "bluetooth_name") ?: ""
            } catch (_: Exception) {}
        }

        if (friendlyName.isBlank()) {
            val brand = Build.BRAND.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            val model = Build.MODEL
            friendlyName = if (model.startsWith(brand, ignoreCase = true)) model else "$brand $model"
        }

        response.put("deviceName", friendlyName.trim())
        response.put("deviceModel", Build.MODEL)
        response.put("deviceManufacturer", Build.MANUFACTURER)
        response.put("deviceBrand", Build.BRAND)

        // Real Location permission
        val hasLocation = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                          context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        response.put("locationGranted", hasLocation)

        // Real SMS permissions
        val hasSms = context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED ||
                     context.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
        response.put("smsGranted", hasSms)

        // Real Battery Optimization Ignored
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val batteryIgnored = pm.isIgnoringBatteryOptimizations(context.packageName)
        response.put("batteryOptimizationIgnored", batteryIgnored)

        // Real offline PIN setup status
        val hasPin = !AegisState.getString(context, AegisState.KEY_MASTER_PIN_HASH).isNullOrBlank()
        response.put("hasPinConfigured", hasPin)

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
    fun unlinkAccount(call: PluginCall) {
        try {
            FirestoreSync.stopCommandListener()
            FirebaseAuth.getInstance().signOut()
            AegisState.remove(context, AegisState.KEY_USER_ID)
            AegisState.remove(context, AegisState.KEY_USER_EMAIL)
            AegisState.remove(context, AegisState.KEY_DEVICE_ID)
            val response = JSObject()
            response.put("unlinked", true)
            call.resolve(response)
        } catch (e: Exception) {
            call.reject("Failed to unlink account", e)
        }
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
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            call.resolve()
        } catch (_: Exception) {
            try {
                val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(fallback)
                call.resolve()
            } catch (err: Exception) {
                openAppSettings(call)
            }
        }
    }

    @PluginMethod
    fun testHardwareSiren(call: PluginCall) {
        val durationMs = call.getLong("durationMs") ?: 4000L
        HardwareAlarm.play(context, durationMs)
        val response = JSObject()
        response.put("playing", true)
        call.resolve(response)
    }

    @PluginMethod
    fun stopHardwareSiren(call: PluginCall) {
        HardwareAlarm.stop()
        val response = JSObject()
        response.put("stopped", true)
        call.resolve(response)
    }

    @PluginMethod
    fun promptBiometric(call: PluginCall) {
        val fragmentActivity = activity as? FragmentActivity
        if (fragmentActivity == null) {
            val response = JSObject()
            response.put("authenticated", false)
            response.put("error", "Host activity is unavailable")
            call.resolve(response)
            return
        }

        fragmentActivity.runOnUiThread {
            try {
                val biometricManager = BiometricManager.from(context)
                val canAuth = biometricManager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
                )

                if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
                    val response = JSObject()
                    response.put("authenticated", false)
                    response.put("available", false)
                    response.put("reason", "No biometric sensor enrolled or available")
                    call.resolve(response)
                    return@runOnUiThread
                }

                val executor = ContextCompat.getMainExecutor(fragmentActivity)
                val prompt = BiometricPrompt(
                    fragmentActivity,
                    executor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            super.onAuthenticationSucceeded(result)
                            val response = JSObject()
                            response.put("authenticated", true)
                            call.resolve(response)
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            super.onAuthenticationError(errorCode, errString)
                            val response = JSObject()
                            response.put("authenticated", false)
                            response.put("error", errString.toString())
                            call.resolve(response)
                        }

                        override fun onAuthenticationFailed() {
                            super.onAuthenticationFailed()
                        }
                    }
                )

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Trackd")
                    .setSubtitle("Confirm your fingerprint to access security settings")
                    .setNegativeButtonText("Use PIN")
                    .build()

                prompt.authenticate(promptInfo)
            } catch (e: Exception) {
                val response = JSObject()
                response.put("authenticated", false)
                response.put("error", e.message ?: "Biometric prompt failed")
                call.resolve(response)
            }
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
        try {
            val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? android.view.accessibility.AccessibilityManager
            val runningList = am?.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            if (runningList != null) {
                for (service in runningList) {
                    if (service.resolveInfo?.serviceInfo?.packageName == context.packageName) {
                        return true
                    }
                }
            }
        } catch (_: Exception) {}

        val expectedFull = "${context.packageName}/${AppDecoyAccessibilityService::class.java.name}"
        val expectedShort = "${context.packageName}/.${AppDecoyAccessibilityService::class.java.simpleName}"
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any { 
            it.equals(expectedFull, ignoreCase = true) || 
            it.equals(expectedShort, ignoreCase = true) ||
            it.contains(context.packageName, ignoreCase = true)
        }
    }

    private fun adminComponent(): ComponentName =
        ComponentName(context, AntiTheftAdminReceiver::class.java)

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString(separator = "") { "%02x".format(it) }
    }

    @PluginMethod
    fun pickContact(call: PluginCall) {
        val intent = Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)
        startActivityForResult(call, intent, "pickContactResult")
    }

    @ActivityCallback
    private fun pickContactResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode == android.app.Activity.RESULT_OK && result.data != null) {
            val contactUri = result.data?.data
            if (contactUri != null) {
                try {
                    val cursor = context.contentResolver.query(
                        contactUri,
                        arrayOf(
                            ContactsContract.CommonDataKinds.Phone.NUMBER,
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
                        ),
                        null,
                        null,
                        null
                    )
                    cursor?.use {
                        if (it.moveToFirst()) {
                            val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                            val nameIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                            val rawPhone = if (numberIndex >= 0) it.getString(numberIndex) ?: "" else ""
                            val name = if (nameIndex >= 0) it.getString(nameIndex) ?: "" else ""
                            val cleanPhone = rawPhone.replace("[^0-9+]".toRegex(), "")
                            val response = JSObject()
                            response.put("phone", cleanPhone)
                            response.put("name", name)
                            call.resolve(response)
                            return
                        }
                    }
                } catch (e: Exception) {
                    call.reject("Could not read selected contact: ${e.message}")
                    return
                }
            }
        }
        call.reject("Contact selection cancelled")
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
