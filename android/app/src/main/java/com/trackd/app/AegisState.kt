package com.trackd.app

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object AegisState {
    private const val TAG = "AegisState"
    private const val PREFS_FILE = "aegis_secure_state"

    const val KEY_EMERGENCY_PHONE = "emergency_contact_phone"
    const val KEY_MASTER_PIN_HASH = "master_pin_hash"
    const val KEY_REGISTERED_SIM = "registered_sim_serial"
    const val KEY_DEVICE_ADMIN = "device_admin_active"
    const val KEY_STOLEN = "is_stolen"
    const val KEY_PROJECT_ID = "firebase_project_id"
    const val KEY_DEVICE_ID = "device_id"
    const val KEY_USER_ID = "firebase_user_id"
    const val KEY_USER_EMAIL = "firebase_user_email"

    @Volatile
    private var cached: SharedPreferences? = null

    fun prefs(context: Context): SharedPreferences {
        cached?.let { return it }
        synchronized(this) {
            cached?.let { return it }
            val prefs = try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    PREFS_FILE,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (error: Exception) {
                Log.w(TAG, "encrypted prefs unavailable, falling back to plain storage", error)
                context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
            }
            cached = prefs
            return prefs
        }
    }

    fun putString(context: Context, key: String, value: String) {
        prefs(context).edit().putString(key, value).apply()
    }

    fun getString(context: Context, key: String): String? =
        prefs(context).getString(key, null)

    fun putBoolean(context: Context, key: String, value: Boolean) {
        prefs(context).edit().putBoolean(key, value).apply()
    }

    fun getBoolean(context: Context, key: String, default: Boolean = false): Boolean =
        prefs(context).getBoolean(key, default)

    fun setDeviceAdminActive(context: Context, active: Boolean) =
        putBoolean(context, KEY_DEVICE_ADMIN, active)

    fun isDeviceAdminActive(context: Context): Boolean =
        getBoolean(context, KEY_DEVICE_ADMIN, false)

    fun setStolen(context: Context, stolen: Boolean) {
        Log.i(TAG, "stolen flag -> $stolen")
        putBoolean(context, KEY_STOLEN, stolen)
    }

    fun isStolen(context: Context): Boolean =
        getBoolean(context, KEY_STOLEN, false)
}
