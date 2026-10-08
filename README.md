# 🛡️ Trackd (AegisTrack)

> **Tactical Anti-Theft Defense, Hardware Recovery & Financial Vault Shield for Android & Web**  
> *Engineered for high-threat environments, zero-data offline recovery, and instant asset containment.*

---

## 📌 Executive Summary

**Trackd** is an enterprise-grade mobile anti-theft and financial defense system. Unlike standard consumer "Find My" utilities that cease functioning the moment a thief turns on Airplane Mode, ejects the SIM card, or powers off the device, Trackd deploys a **dual-engine defense architecture**:

1. **⚡ Layer 1 — Real-Time Cloud Telemetry & Remote Control (OTA):**
   - Built on the free **Firebase Spark** tier (Auth, Cloud Firestore, Cloud Messaging).
   - Pairs the mobile handset with an Apple Maps-inspired **Tactical Web Console** (`https://trackd-livid.vercel.app`).
   - Streams live breadcrumb coordinates with reverse geocoding via OpenStreetMap (OSM) Nominatim.
   - Pushes remote OTA commands with sub-second execution (Real-Time Siren, Stolen Lockdown, Remote Wipe).

2. **📡 Layer 2 — Zero-Data Offline GSM/SMS & Hardware Trapdoor (Offline):**
   - Operates **100% offline** without active Wi-Fi, cellular data, or Google Play Services.
   - GPS satellites require zero data: Trackd hooks the hardware `LocationManager` and broadcasts coordinates via encrypted SMS directly to the owner's emergency contact.
   - Intercepts incoming SMS commands silently (`#LOCATE#<PIN>`, `#SIREN#<PIN>`, `#STOLEN#<PIN>`, `#WIPE#<PIN>`) using `abortBroadcast()`, preventing thieves from seeing incoming or outgoing messages.
   - Employs an **Accessibility Decoy Engine** that shields banking and mobile money apps from unauthorized access.

---

## 🏗️ System Architecture

```mermaid
graph TD
    subgraph "Tactical Web Console (Operator)"
        WC[Web Dashboard / Map] -->|onSnapshot / Update Flags| FS[(Cloud Firestore)]
        WC -->|Silent Wake Ping| VFN[Vercel Serverless /api/admin/wake-device]
    end

    subgraph "Cloud & Backend Infrastructure"
        FS -->|Realtime Stream| DBL[devices / telemetry_logs]
        VFN -->|High-Priority Data Ping| FCM[Firebase Cloud Messaging]
    end

    subgraph "Handset Android Security Core (Trackd Sentinel)"
        FCM -.->|Silent Wake Push| APS[AegisPushService]
        FS <-->|Bidirectional Sync| FSS[FirestoreSync.kt]
        
        subgraph "Native Hardware Guardians"
            DAR[AntiTheftAdminReceiver<br/>Device Admin Lock & Wipe]
            SDR[ShutdownReceiver<br/>Last-Gasp GPS & Offline SMS]
            SSR[SimStateReceiver<br/>SIM Swap Detection & Silent Alert]
            SMR[SmsCommandReceiver<br/>Zero-Data SMS Engine]
            ADE[AppDecoyAccessibilityService<br/>Anti-Power-Off & Fintech Shield]
            AUD[AudioManager / Ringtone<br/>100% Hardware Alarm Override]
        end
        
        FSS --> DAR
        FSS --> AUD
        APS --> FSS
    end

    subgraph "Zero-Data Recovery Network"
        EP[Trusted Emergency Phone] <-->|Encrypted SMS Protocol| SMR
        SSR -->|Silent Thief Alert SMS| EP
        SDR -->|Last-Gasp SMS| EP
    end
```

---

## 🎯 Threat Scenarios & Tactical Playbooks

### Scenario 1: Street Snatch & Power-Off Attempt
* **Thief's Vector:** The phone is snatched in transit. The thief immediately presses and holds the power button to shut the device down, intending to prevent tracking before putting it into a Faraday bag or stripping parts.
* **Trackd Defense:**
  1. **Accessibility Decoy:** If the thief triggers the system power menu, `AppDecoyAccessibilityService` intercepts the touch event and neutralizes the power menu.
  2. **Last-Gasp GPS Fix:** If the phone proceeds to power down via hardware combination (`ACTION_SHUTDOWN` or `QUICKBOOT_POWEROFF`), `ShutdownReceiver` intercepts the broadcast, requests a rapid hardware GPS lock from the GPS chip, and dispatches a prioritized HTTP payload to `telemetry_logs` within 2 seconds.
  3. **Offline SMS Fail-Safe:** If cellular data is already disconnected, Trackd immediately falls back to GSM and fires an emergency SMS with current GPS coordinates and battery percentage to the owner's trusted recovery number.

---

### Scenario 2: Data Severed / Airplane Mode Active (Zero-Data SMS Recovery)
* **Thief's Vector:** The thief slides down the quick settings panel and enables Airplane Mode or disables Mobile Data and Wi-Fi.
* **Trackd Defense:**
  * Trackd does not rely on internet connectivity. The owner borrows any nearby phone and sends a text message to their phone using their pre-configured 4-digit Master Recovery PIN:
    * `#LOCATE#<PIN>`: The Android handset powers on the GPS chip, calculates the current satellite fix, and texts back an instant Google Maps link:
      ```text
      ALERT [TRACKD]: Battery 84%. GPS: 5.6037, -0.1870. Accuracy: 8m. Map: https://maps.google.com/?q=5.6037,-0.1870
      ```
    * `#SIREN#<PIN>`: Maxes out `STREAM_ALARM` to 100% volume and plays the high-pitch alarm continuously, overriding Do Not Disturb, silent mode, and headphone jacks.
    * `#STOLEN#<PIN>`: Activates total device lockdown mode and arms the financial vault decoy.
    * `#WIPE#<PIN>`: Calls `DevicePolicyManager.wipeData(0)` to trigger an irreversible factory reset.
  * **Stealth Delivery:** `SmsCommandReceiver` invokes `abortBroadcast()`. The incoming text message never appears in Android Messages, the notification bar never illuminates, and no sent SMS is left in the outbox.

---

### Scenario 3: Physical SIM Card Removal / SIM Swap Attack
* **Thief's Vector:** The thief removes the owner's SIM card and inserts their own SIM card to use the device or bypass SMS two-factor authentication.
* **Trackd Defense:**
  * During setup, Trackd stores the cryptographic hash of the legitimate SIM card's ICCID / Serial in `EncryptedSharedPreferences`.
  * On every device boot and SIM state change, `SimStateReceiver` validates the active SIM against the registered serial.
  * **Immediate Back-Channel SMS:** If an unauthorized SIM card is detected, Trackd secretly dispatches a background alert SMS using the thief's newly inserted SIM card directly to the owner's emergency contact:
    ```text
    ALERT [TRACKD]: Unauthorized SIM detected! New Number: +23354XXXXXXX. ICCID: 89233... Location: https://maps.google.com/?q=...
    ```
  * The owner now has the thief's active phone number and real-time location.

---

### Scenario 4: Banking & Financial App Protection (Fintech Vault Shield)
* **Thief's Vector:** The thief attempts to bypass app authentication or open mobile banking, cryptocurrency wallets, or Mobile Money apps (MTN MoMo, Telecel Cash, AT Money, GCB, Ecobank, Zenith, Binance).
* **Trackd Defense:**
  * When the device is marked as `isStolen: true`, `AppDecoyAccessibilityService` monitors `AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED`.
  * The moment an unauthorized user attempts to open any monitored financial application, Trackd immediately sends the `GLOBAL_ACTION_HOME` command, ejecting them to the home screen.
  * An un-cancelable native error overlay (`"Application Crashed: Memory fault 0x884F"`) appears, rendering the financial account inaccessible while preserving user funds.

---

### Scenario 5: Real-Time Tactical Radar & Breadcrumb Tracking (Web Console)
* **Operator Action:** The owner opens `https://trackd-livid.vercel.app` from any computer, tablet, or browser.
* **Trackd Defense:**
  * The Web Console connects via Firestore `onSnapshot`, streaming live device status, battery percentage, charging state, and GPS coordinates without polling.
  * Precision Leaflet vector maps with OpenStreetMap tiles display live coordinates, accuracy radius circles, and sequential breadcrumb trails.
  * **Live Reverse Geocoding:** Latitude/Longitude coordinates are automatically translated into human-readable suburban addresses (e.g., *"Adum, Kumasi"* or *"Airport Residential Area, Accra"*) via free OpenStreetMap Nominatim APIs.

---

### Scenario 6: High-Decibel Acoustic Recovery in Crowds or Indoors
* **Operator Action:** The map indicates the device is inside a specific multi-story building, crowded bus terminal, or market stall.
* **Trackd Defense:**
  * Triggered via the Web Console ("Trigger Siren") or SMS (`#SIREN#<PIN>`).
  * `TrackdBridgePlugin.kt` access `AudioManager` to override volume limits, sets `STREAM_ALARM` to the absolute hardware maximum, sets audio attributes to `USAGE_ALARM` with `FLAG_AUDIBILITY_ENFORCED`, and loops the alarm tone.
  * The sound cannot be muted using hardware volume buttons. Deactivation requires entering the Master PIN or tapping "Stop Loud Alarm".

---

### Scenario 7: Total Loss Containment (Hardware Factory Wipe)
* **Operator Action:** The phone is confirmed unrecoverable or contains top-secret credentials and corporate data.
* **Trackd Defense:**
  * The owner executes the emergency wipe command via Web Console (requiring explicit uppercase confirmation `"WIPE DEVICE"`) or sends `#WIPE#<PIN>`.
  * `AntiTheftAdminReceiver` executes `DevicePolicyManager.wipeData(DevicePolicyManager.WIPE_EXTERNAL_STORAGE)`.
  * The device immediately terminates all active processes, purges all flash memory, evicts all encryption keys, and initiates a low-level factory wipe.

---

## 📱 Mobile Sentinel UI (Zero-Scroll Ergonomics)

The native Android APK (`com.trackd.app`) features a minimalist, cybernetic status hub designed for maximum clarity:

| Component | Functionality |
| :--- | :--- |
| **Header Status Bar** | Shows device model (e.g., `Redmi Note 14 Pro`) derived from `android.os.Build` and live armed state (`ARMED` in emerald, `ACTION` in amber). |
| **Glowing Status Dial** | Circular dial displaying protection coverage (e.g., `6/6 ARMED`). Perfectly proportioned with zero text clipping. |
| **Real Telemetry Chips** | **100% Real Hardware Data**: Real battery % via Android `BatteryManager`, real SMS capability state, and live Web Sync indicator. |
| **Grouped Permission Checklist** | Interactive single-tap activation for Location, SMS, Device Admin, Battery Optimization, Overlay Alert, and Accessibility Decoy. Automatically updates on return from Android Settings. |
| **Offline PIN & Recovery Card** | Quick setup sheet to configure the 4-digit Master Recovery PIN and trusted emergency phone number. |
| **Test Loud Alarm Button** | Full-width neon pill button that triggers full-volume acoustic siren testing with 4-second safety auto-reset. |

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Mobile Core (Android)** | Kotlin 1.9, Capacitor 6, Android SDK 26–35+, Android DevicePolicyManager, FusedLocationProviderClient |
| **Web Console** | React 18, TypeScript, Vite, Tailwind CSS, Leaflet, React-Leaflet, Lucide Icons |
| **Cloud Services** | Firebase Authentication, Cloud Firestore (Free Spark Tier), Firebase Cloud Messaging (FCM) |
| **Backend Serverless** | Vercel Serverless Functions (Node.js runtime for Sailup.io OTP and Silent FCM Wake) |
| **Mapping & Geocoding** | OpenStreetMap (OSM) Humanitarian Raster Tiles, OSM Nominatim Reverse Geocoding API |

---

## 🔐 Hardware Permissions Breakdown

| Android Permission | Why Trackd Needs It |
| :--- | :--- |
| `ACCESS_FINE_LOCATION` | Required for meter-level GPS triangulation during emergency locate requests. |
| `ACCESS_BACKGROUND_LOCATION` | Allows tracking when the screen is locked or another app is foregrounded. |
| `RECEIVE_SMS` & `READ_SMS` | Intercepts offline recovery commands (`#LOCATE#`, `#SIREN#`, etc.) silently. |
| `SEND_SMS` | Dispatches emergency coordinates and thief SIM notifications back to the owner. |
| `BIND_DEVICE_ADMIN` | Enables remote screen lock, blocks unauthorized app uninstall, and allows remote factory wipe. |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Whitelists Trackd from aggressive OEM battery killers (MIUI/HyperOS, Samsung One UI, ColorOS). |
| `SYSTEM_ALERT_WINDOW` | Renders lockscreen emergency owner contact banners and decoy crash dialogs. |
| `BIND_ACCESSIBILITY_SERVICE` | Intercepts power-off attempts and shields financial apps when marked stolen. |

---

## 🚀 Setup & Installation Guide

### 1. Firebase Spark Setup (Free Tier)
1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g., `trackd-app`).
2. Enable **Authentication** → **Email/Password**.
3. Create **Cloud Firestore** in production mode.
4. Add a **Web App** → Copy your config keys into `.env` (see below).
5. Add an **Android App** with package name `com.trackd.app` → Download `google-services.json` and place it in `android/app/google-services.json`.

### 2. Environment Variables (`.env`)
Create a `.env` file in the project root:

```env
# Firebase Client Keys (Web Console & Auth)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:...

# Vercel Serverless Backend (Optional for SMS OTP and FCM Wake)
SAILUP_API_KEY=sailup_...
FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Deploy Web Console to Vercel
```bash
npm install
npm run build
vercel deploy --prod
```
The console is live and accessible at your production Vercel URL.

### 4. Build & Install Android APK
Connect your Android phone via USB with USB Debugging enabled:

```bash
# 1. Compile web assets
npm run build

# 2. Copy web assets to Android
npx cap copy android

# 3. Compile debug APK
cd android
.\gradlew assembleDebug
cd ..

# 4. Stream install APK directly to device via ADB
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 5. Launch Trackd Shield
adb shell am start -n com.trackd.app/.MainActivity
```

---

## 🔒 Security & Privacy Guarantee

* **Zero-Knowledge PIN Verification:** Recovery PINs are salted and hashed using SHA-256 before storage in Android's hardware-backed `EncryptedSharedPreferences`. Raw PINs are never transmitted or stored in plaintext.
* **Strict Firestore Security Rules:** Telemetry entries are write-once, append-only records. Users can only read and write devices belonging to their authenticated UID.
* **Silent Broadcast Abort:** Emergency SMS commands are intercepted at the telephony stack level via `abortBroadcast()`, ensuring no traces are visible in the device messaging history.

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
