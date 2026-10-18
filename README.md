# 🛡️ Trackd

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/badge/Release-v1.2.6-00F29D.svg?style=for-the-badge)](https://gettrackd.me/downloads/trackd-latest.apk)
[![Android](https://img.shields.io/badge/Android-8.0%2B-green.svg?style=for-the-badge&logo=android)](https://gettrackd.me)
[![Web Console](https://img.shields.io/badge/Web_Console-gettrackd.me-blue.svg?style=for-the-badge&logo=vercel)](https://gettrackd.me)
[![Kotlin](https://img.shields.io/badge/Kotlin-Native_Sentinel-purple.svg?style=for-the-badge&logo=kotlin)](https://kotlinlang.org)

<p align="center">
  <strong>Thieves kill the internet first. Trackd doesn't need it.</strong><br>
  Offline-first phone recovery, SMS GPS radar, fake crash decoys, and mobile money lockdown.
</p>

<p align="center">
  <a href="https://gettrackd.me"><strong>Official Web Console »</strong></a> ·
  <a href="https://gettrackd.me/downloads/trackd-latest.apk"><strong>Download APK (v1.2.6) »</strong></a> ·
  <a href="https://github.com/kingenious0/trackd/issues">Report Bug »</a>
</p>

</div>

---

## 📌 Overview

**Trackd** is an offline-resilient mobile protection and device recovery platform built for real-world scenarios. Standard "Find My" utilities stop working the moment connectivity is severed:
1. **The Instant Disconnect:** Phones are switched to Airplane Mode or have Mobile Data toggled off immediately.
2. **SIM Card Removal:** When a SIM card is ejected, internet access is lost and owners lose cloud-based tracking.
3. **Power-Down Attempts:** Thieves attempt to power down the device to evade detection before GPS coordinates can be broadcast.
4. **Financial Account Risks:** While unlocked or in the wrong hands, banking and Mobile Money apps (MTN MoMo, Telecel Cash, AT Money, bank apps) are vulnerable to unauthorized draining.
5. **Unauthorized Device Reset:** Attempts are made to wipe the phone through system settings.

Trackd addresses these challenges using a **Dual-Engine Recovery Architecture**:

* **⚡ Layer 1 — Cloud Live Telemetry (Web Dashboard):**
  * Powered by the free **Firebase Spark** tier (Authentication, Cloud Firestore, Cloud Messaging).
  * Connects your phone with the **Trackd Web Dashboard** ([`https://gettrackd.me`](https://gettrackd.me)).
  * Displays real-time GPS coordinates with automatic reverse geocoding to street-level addresses using OpenStreetMap (OSM) Nominatim.
  * Sends remote commands when connected: Live GPS Locate, High-Decibel Siren, Lost Mode Arming, and Emergency Wipe.

* **📡 Layer 2 — Offline GSM/SMS Recovery Protocol (Zero Internet Needed):**
  * Operates **100% offline** without active Wi-Fi, cellular data, or Google Play Services.
  * GPS satellites function independently of mobile internet: Trackd queries the device's hardware `FusedLocationProviderClient` and delivers precise coordinates via SMS directly to your designated emergency contact.
  * Privately processes incoming recovery SMS commands (`#LOCATE#<PIN>`, `#SIREN#<PIN>`, `#SILENCE#<PIN>`, `#STOLEN#<PIN>`, `#SAFE#<PIN>`, `#WIPE#<PIN>`) using system `abortBroadcast()`, keeping commands silent and out of the public messaging inbox.
  * Includes an **Accessibility App Protection Service** that shields banking and mobile money services by returning to the home screen if an unauthorized launch occurs while the device is reported lost.

---

## 🏗️ System Architecture

```mermaid
graph TD
    subgraph "Trackd Web Dashboard"
        WC[Web Dashboard / Map Console] -->|onSnapshot / Device Updates| FS[(Cloud Firestore)]
        WC -->|Silent Wake Ping| VFN[Vercel Serverless /api/admin/wake-device]
    end

    subgraph "Cloud & Backend Infrastructure"
        FS -->|Realtime Stream| DBL[devices / telemetry_logs]
        VFN -->|High-Priority Data Ping| FCM[Firebase Cloud Messaging]
    end

    subgraph "Android Background Service & Guardians (Trackd Sentinel)"
        FCM -.->|Silent Wake Push| APS[AegisPushService.kt]
        FS <-->|Bidirectional Sync| FSS[FirestoreSync.kt]
        
        subgraph "Native Hardware Guardians"
            DAR[AntiTheftAdminReceiver.kt<br/>Device Admin Lock & Wipe]
            SDR[ShutdownReceiver.kt<br/>Dynamic Runtime Shutdown Handler]
            SSR[SimStateReceiver.kt<br/>SIM Swap Detection & Alert]
            SMR[SmsCommandReceiver.kt<br/>Offline SMS Command Engine]
            ADE[AppDecoyAccessibilityService.kt<br/>Power-Menu Dismissal & App Guard]
            HA[HardwareAlarm.kt<br/>100% Max-Volume Audio Override]
            TD[TelemetryDispatcher.kt<br/>Fused Location & Periodic Heartbeat]
        end
        
        FSS --> DAR
        FSS --> HA
        APS --> HA
        APS --> FSS
        SMR --> HA
        SMR --> DAR
        SMR --> TD
    end

    subgraph "Offline Emergency Network"
        EP[Trusted Emergency Phone] <-->|Secure SMS Protocol| SMR
        SSR -->|SIM Change Alert SMS| EP
        SDR -->|Emergency Shutdown SMS| EP
    end
```

---

## 🎯 Real-World Recovery Scenarios & Capabilities

### Scenario 1: Power-Down Interception & Last-Known GPS
* **The Situation:** Someone attempts to power off your lost phone to prevent tracking.
* **Trackd Response:**
  1. **Power-Menu Dismissal:** When the device is marked as lost, `AppDecoyAccessibilityService` detects system power dialogs and automatically closes them using `GLOBAL_ACTION_BACK` and `GLOBAL_ACTION_HOME`.
  2. **Dynamic Shutdown Handling:** Because Android blocks manifest-declared static receivers from receiving `ACTION_SHUTDOWN`, Trackd dynamically registers `ShutdownReceiver` at runtime inside `TrackdSentinelService`. If a shutdown does proceed, Trackd immediately captures a fresh GPS location fix and uploads an emergency telemetry log.
  3. **Offline SMS Fallback:** If mobile internet is unavailable during power-down, Trackd sends an instant emergency SMS with coordinates and battery level to your emergency contact:
     ```text
     ALERT [TRACKD SHUTDOWN]: Battery 78%. GPS: 5.6037,-0.1870. https://maps.google.com/?q=5.6037,-0.1870
     ```

---

### Scenario 2: Offline Recovery When Cellular Data & Wi-Fi Are Off
* **The Situation:** Cellular data is toggled off or Airplane Mode is enabled.
* **Trackd Response:**
  * Trackd does not require internet connectivity to locate your handset. Using any phone, text your device with your 4-digit Master Recovery PIN:
    * `#LOCATE#<PIN>`: The phone activates the GPS satellite receiver, computes coordinates, and texts back an instant Google Maps link:
      ```text
      Trackd GPS: 5.6037, -0.1870 (±6m) https://maps.google.com/?q=5.6037,-0.1870
      ```
    * `#SIREN#<PIN>`: Overrides silent/do-not-disturb mode and sounds a loud acoustic siren.
    * `#SILENCE#<PIN>`: Silences the siren once the phone is found.
    * `#STOLEN#<PIN>`: Activates lost mode, arming banking protection and power-off dismissal.
    * `#SAFE#<PIN>`: Disarms lost mode and returns the phone to regular operation.
    * `#WIPE#<PIN>`: Remotely triggers a factory reset if the device is deemed unrecoverable.
  * **Silent Background Execution:** Inbound recovery SMS messages are consumed by `SmsCommandReceiver` via `abortBroadcast()`, preventing notification alerts and leaving no trace in the SMS inbox.

---

### Scenario 3: SIM Card Removal & SIM Swap Alert
* **The Situation:** The original SIM card is removed and an unauthorized SIM card is inserted.
* **Trackd Response:**
  * Trackd stores the cryptographic hash of your authorized SIM card's serial number (ICCID) in hardware-backed `EncryptedSharedPreferences`.
  * On every device boot and SIM state change, `SimStateReceiver` validates the active card.
  * **Automatic Alert SMS:** If an unrecognized SIM is detected, Trackd immediately sends an SMS using the newly inserted card to your emergency recovery number with its new phone number and location:
    ```text
    ALERT: SIM swap detected. New number: +23354XXXXXXX GPS: https://maps.google.com/?q=5.6037,-0.1870
    ```

---

### Scenario 4: Financial App & Mobile Money Protection
* **The Situation:** Someone attempts to open mobile banking or Mobile Money apps (MTN MoMo, Telecel Cash, AT Money, GCB, Ecobank, Zenith, Fidelity, Stanbic, Zeepay, Hubtel) on a lost device.
* **Trackd Response:**
  * When the handset is in `isStolen: true` (Lost Mode), `AppDecoyAccessibilityService` detects window changes for protected financial apps and USSD shortcodes (*170#, *110#, etc.).
  * The service immediately executes `performGlobalAction(GLOBAL_ACTION_HOME)` to return the device to the home screen.
  * If overlay permission is enabled, a system crash dialogue appears:
    ```text
    Application Crashed: Memory fault 0x884F
    Please reboot your device and try again later.
    ```
  * Accounts and funds remain secure.

---

### Scenario 5: Live Map Tracking & Address Geocoding
* **The Situation:** Tracking your device in real time from a computer or tablet.
* **Trackd Response:**
  * Open `https://trackd-livid.vercel.app` in any browser.
  * Real-time Firestore sync streams status, battery level, charging state, and GPS coordinates with no manual refresh needed.
  * Precision vector maps show accuracy radius circles and sequential location trails.
  * Coordinates are translated automatically into human-readable suburban addresses (e.g., *"Adum, Kumasi"* or *"Airport Residential Area, Accra"*) via OpenStreetMap Nominatim APIs.

---

### Scenario 6: High-Volume Siren for Indoor Recovery
* **The Situation:** The map shows the phone is nearby (e.g., in an apartment, market stall, or vehicle) but it cannot be seen.
* **Trackd Response:**
  * Triggered via the Web Dashboard ("Trigger Siren") or SMS (`#SIREN#<PIN>`).
  * `HardwareAlarm.kt` overrides silent mode, adjusts `STREAM_ALARM` to 100%, and loops the alarm tone with `FLAG_AUDIBILITY_ENFORCED`.
  * The siren cannot be silenced using standard volume buttons; it can only be silenced by entering the Master PIN or clicking "Stop Alarm" in the dashboard.

---

### Scenario 7: Emergency Remote Wipe
* **The Situation:** The device is permanently lost and contains sensitive personal data.
* **Trackd Response:**
  * The owner executes the wipe command via the Web Dashboard (with explicit confirmation) or sends `#WIPE#<PIN>` via SMS.
  * `AntiTheftAdminReceiver` invokes `DevicePolicyManager.wipeData(0)`, initiating a complete factory reset.

---

## 📱 Mobile Client (4-State Security Model)

The native Android client (`com.trackd.app`) features a clean, responsive interface inspired by Google Pixel Security Center:

### 1. The 4 Security States

```
                 +-----------------------------+
                 |       1. SETUP STATE        |
                 |  (Step-by-Step Onboarding)  |
                 +--------------+--------------+
                                |
                                v
                 +-----------------------------+
                 |       Account Linked        |
                 +--------------+--------------+
                                |
             +------------------+------------------+
             |                                     |
   (All Permissions Active)             (Permissions Pending)
             |                                     |
             v                                     v
+-----------------------------+       +-----------------------------+
|       2. ARMED STATE        |       |      3. ATTENTION NEEDED    |
|  - Emerald Protection Dial  | <---> |  - Amber Progress Indicator |
|  - "Device is Protected"    |       |  - Missing items listed top |
|  - PIN-Gated Settings       |       |  - "Complete setup" action  |
|  - Siren Test Button        |       |                             |
+--------------+--------------+       +--------------+--------------+
               |                                     |
               +------------------+------------------+
                                  |
                        (Device Marked Lost)
                                  |
                                  v
                    +-----------------------------+
                    |       4. LOST STATE         |
                    |  - Warm Amber Lost Card     |
                    |  - Owner Contact Display    |
                    |  - "Call Owner" Quick Pill  |
                    |  - Owner PIN Unlock Link    |
                    +-----------------------------+
```

### Layout Overview

```
+-------------------------------------------------------+
|  Trackd                              Guarded [●]      |
|                                                       |
|                    . - - - - .                        |
|                  /     .-.     \                      |
|                 |     | 🔒 |    |                     |
|                  \     '-'     /                      |
|                    ' - - - - '                        |
|                  Fully protected                      |
|                                                       |
|  [================ 5/5 Protection ==================] |
|                                                       |
|          [ 🔋 Battery 94% ]     [ ● SMS ready ]       |
|                                                       |
|  +-------------------------------------------------+  |
|  | [🔑] PIN and emergency contact        ••••  [>] |  |
|  +-------------------------------------------------+  |
|                                                       |
|  [                🔊 TEST EMERGENCY SIREN           ]  |
+-------------------------------------------------------+
```

| UI Element | Functionality |
| :--- | :--- |
| **Top Header Bar** | Clean header displaying "Trackd" and state badge (`Guarded` in emerald or `Partly guarded` in amber). |
| **Protection Pulse Hero** | Geometric shield hero (`Lock` in emerald when fully protected, `LockOpen` in amber with remaining steps when attention is needed). |
| **Protection Progress Bar** | Visual breakdown of active security layers. Tapping opens the Protection Details sheet. |
| **Hardware Telemetry** | Real-time battery level via `BatteryManager`, SMS telephony readiness, and live cloud sync status. |
| **Protection Details Modal** | Slide-up modal displaying hardware protections (`Always-on location`, `Find phone offline`, `Keep app running`, `Prevent power off`, `Lost screen message`) with direct shortcuts to system settings. |
| **PIN & Recovery Contact** | Displays masked recovery credentials (`••••`). Tapping prompts for Master PIN or Biometric Fingerprint to open Settings. |
| **Biometric Verification** | Integrates AndroidX `BiometricPrompt` for quick fingerprint or face unlock. |
| **Settings Inset** | Manage Master PIN, update emergency contact phone number, test siren, and unlink account. Automatically locks after 60 seconds of inactivity. |
| **Lost Screen** | A clear, warm amber card indicating "This phone is lost" with the owner's emergency contact, one-tap "Call owner" and "Send a text" action pills, and an "Owner unlock" link. |
| **Background Sentinel Service** | `TrackdSentinelService` runs continuously in the foreground with location type. If the app is swiped from recents, `AlarmManager` and `onTaskRemoved()` ensure it resumes immediately. |

---

## 📟 Recovery SMS Command Reference

All commands require your 4-digit Master Recovery PIN:

| Command Syntax | Purpose | Device Action | Automated SMS Reply |
| :--- | :--- | :--- | :--- |
| `#LOCATE#<PIN>` | Satellite GPS Fix | Computes current GPS fix via `FusedLocationProviderClient` | `Trackd GPS: <LAT>,<LNG> (±<ACC>m) https://maps.google.com/?q=<LAT>,<LNG>` |
| `#SIREN#<PIN>` | Emergency Siren | Sets `STREAM_ALARM` to 100% and sounds siren | `Trackd: High-decibel emergency siren activated.` |
| `#SILENCE#<PIN>` | Silence Siren | Immediately silences alarm | `Trackd: Emergency siren silenced.` |
| `#STOLEN#<PIN>` | Lost Mode | Marks device as lost and arms app protection | `Trackd: device marked STOLEN. Financial protection armed.` |
| `#SAFE#<PIN>` | Safe Mode | Disarms lost mode and restores normal operation | `Trackd: device marked SAFE. App protection disarmed.` |
| `#WIPE#<PIN>` | Remote Wipe | Executes factory reset via `DevicePolicyManager` | `Trackd: initiating factory reset.` |

---

## 💡 Android 13+ Setup Note (Restricted Settings)

On **Android 13 and later**, Android automatically restricts Accessibility services for applications installed outside the Google Play Store (sideloaded APKs). 

When enabling **Trackd Financial Protection** in Accessibility settings, you may see a greyed-out switch that says *"Restricted setting: For your security, this setting is currently unavailable."*

**To enable it:**
1. Open your phone's **Settings ➔ Apps ➔ Trackd** (App info).
2. Tap the **three vertical dots (⋮)** in the top-right corner.
3. Tap **"Allow restricted settings"** and confirm with your device PIN or fingerprint.
4. Return to **Accessibility ➔ Trackd Financial Guard** and turn the switch **ON**.

---

## 💻 Tech Stack

| Component | Technologies |
| :--- | :--- |
| **Mobile Core (Android)** | Kotlin 1.9, Capacitor 6, Android SDK 26–35+, `FusedLocationProviderClient`, AndroidX Biometrics |
| **Web Dashboard** | React 18, TypeScript, Vite, Tailwind CSS, Leaflet, React-Leaflet, Lucide Icons |
| **Cloud Services** | Firebase Authentication, Cloud Firestore (Free Spark Tier), Firebase Cloud Messaging (FCM) |
| **Serverless Functions** | Vercel Serverless (Node.js for SMS OTP and FCM wake triggers) |
| **Mapping & Geocoding** | OpenStreetMap (OSM) Tiles, OSM Nominatim Reverse Geocoding API |

---

## 🔐 Hardware Permissions Overview

| Permission | Purpose |
| :--- | :--- |
| `ACCESS_FINE_LOCATION` | Accurate GPS coordinates during locate requests. |
| `ACCESS_BACKGROUND_LOCATION` | Keeps location tracking active when the device is locked. |
| `RECEIVE_SMS` & `READ_SMS` | Intercepts offline recovery commands (`#LOCATE#`, `#SIREN#`, etc.). |
| `SEND_SMS` | Dispatches GPS coordinates and SIM change alerts back to your emergency contact. |
| `BIND_DEVICE_ADMIN` | Enables remote screen locking and emergency remote wipe. |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Ensures background service reliability across different phone manufacturers. |
| `SYSTEM_ALERT_WINDOW` | Displays the lost phone contact card and app protection dialogue. |
| `BIND_ACCESSIBILITY_SERVICE` | Automatically dismisses power-down dialogs and safeguards financial apps when lost. |

---

## 🚀 Setup & Installation Guide

### 1. Firebase Spark Setup (Free Tier)
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project (e.g., `trackd-app`).
2. Enable **Authentication** → **Email/Password**.
3. Create **Cloud Firestore** in production mode.
4. Add a **Web App** → Copy your config keys into `.env`.
5. Add an **Android App** with package name `com.trackd.app` → Download `google-services.json` and place it in `android/app/google-services.json`.

### 2. Environment Variables (`.env`)
Create a `.env` file in the project root:

```env
# Firebase Client Configuration (Web Dashboard)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:...

# Optional Backend Keys (Vercel Serverless)
SAILUP_API_KEY=sailup_...
FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Deploy Web Dashboard to Vercel
```bash
npm install
npm run build
vercel deploy --prod
```

### 4. Build & Install Android APK
Connect your Android phone via USB with USB Debugging enabled:

```bash
# 1. Build web application
npm run build

# 2. Sync web assets with Capacitor
npx cap sync android

# 3. Compile release APK
cd android
./gradlew assembleRelease
cd ..

# 4. Install APK directly onto phone via ADB
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

## 🔒 Privacy & Security

* **Secure PIN Verification:** Recovery PINs are salted and hashed using SHA-256 before storage in Android's hardware-backed `EncryptedSharedPreferences`. Raw PINs are never stored in plaintext.
* **Firestore Security Rules:** Telemetry entries are write-once records scoped strictly to your authenticated account UID.
* **Silent Broadcast Abort:** Emergency SMS commands are processed at the telephony stack level via `abortBroadcast()`, preventing notification popups and keeping recovery commands private.

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
