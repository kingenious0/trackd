# 🛡️ Trackd (AegisTrack)

> **Tactical Anti-Theft Defense, Hardware Recovery & Financial Vault Shield for Android & Web**  
> *Engineered for high-threat environments, zero-data offline recovery, and instant asset containment.*

---

## 📌 Executive Summary

**Trackd** is an enterprise-grade mobile anti-theft, hardware recovery, and financial asset defense platform. Standard consumer "Find My" utilities fail within seconds during real-world theft:
1. **The 5-Second Vulnerability:** Thieves immediately swipe down the quick settings shade to toggle Airplane Mode or turn off Mobile Data and Location.
2. **The SIM Extraction Attack:** Thieves eject the physical SIM card to cut internet access and attempt SIM-swap attacks to hijack banking 2FA.
3. **The Power-Down Race:** Thieves hold the power button to shut the handset down before any location fix can be transmitted.
4. **The Banking & Mobile Money Drain:** While the handset is unlocked or under duress, thieves open Mobile Money (MTN MoMo, Telecel Cash, AT Money) and banking apps to drain funds.
5. **The Instant Recovery Wipe:** Thieves enter settings or recovery mode to wipe the phone for resale.

Trackd overcomes every single one of these attack vectors through a **Dual-Engine Defense Architecture**:

* **⚡ Layer 1 — Cloud OTA Engine (Real-Time Web Telemetry):**
  * Powered by the free **Firebase Spark** tier (Auth, Cloud Firestore, Cloud Messaging).
  * Pairs your handset with the **Apple Maps-inspired Tactical Web Console** (`https://trackd-livid.vercel.app`).
  * Streams real-time breadcrumb coordinates with automatic reverse-geocoding via OpenStreetMap (OSM) Nominatim.
  * Pushes sub-second remote commands (Live GPS Locate, High-Decibel Siren, Theft Mode Arming, and Factory Wipe).

* **📡 Layer 2 — Zero-Data Offline GSM/SMS & Hardware Trapdoor (Offline Recovery):**
  * Operates **100% offline** without active Wi-Fi, cellular data, or Google Play Services.
  * GPS satellites require zero internet: Trackd hooks the hardware `FusedLocationProviderClient` and broadcasts coordinates via encrypted SMS directly to the owner's emergency contact.
  * Silently intercepts incoming SMS commands (`#LOCATE#<PIN>`, `#SIREN#<PIN>`, `#SILENCE#<PIN>`, `#STOLEN#<PIN>`, `#SAFE#<PIN>`, `#WIPE#<PIN>`) using telephony-level `abortBroadcast()`, preventing thieves from seeing incoming or outgoing messages.
  * Employs an **Accessibility Decoy Engine** that shields banking and mobile money apps by terminating their launch and displaying a convincing system memory crash overlay.

---

## 🏗️ System Architecture

```mermaid
graph TD
    subgraph "Tactical Web Console (Operator Dashboard)"
        WC[Web Dashboard / Map Console] -->|onSnapshot / Device Updates| FS[(Cloud Firestore)]
        WC -->|Silent Wake Ping| VFN[Vercel Serverless /api/admin/wake-device]
    end

    subgraph "Cloud & Backend Infrastructure"
        FS -->|Realtime Stream| DBL[devices / telemetry_logs]
        VFN -->|High-Priority Data Ping| FCM[Firebase Cloud Messaging]
    end

    subgraph "Handset Android Security Core (Trackd Sentinel)"
        FCM -.->|Silent Wake Push| APS[AegisPushService.kt]
        FS <-->|Bidirectional Sync| FSS[FirestoreSync.kt]
        
        subgraph "Native Hardware Guardians"
            DAR[AntiTheftAdminReceiver.kt<br/>Device Admin Lock & Wipe]
            SDR[ShutdownReceiver.kt<br/>Last-Gasp GPS & Offline SMS]
            SSR[SimStateReceiver.kt<br/>SIM Swap Detection & Silent Alert]
            SMR[SmsCommandReceiver.kt<br/>Zero-Data SMS Command Engine]
            ADE[AppDecoyAccessibilityService.kt<br/>Anti-Power-Off & Fintech Shield]
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

    subgraph "Zero-Data Recovery Network"
        EP[Trusted Emergency Phone] <-->|Encrypted SMS Protocol| SMR
        SSR -->|Silent Thief Alert SMS| EP
        SDR -->|Last-Gasp SMS| EP
    end
```

---

## 🎯 Threat Scenarios & Tactical Playbooks

### Scenario 1: Street Snatch & Power-Off Attempt (Last-Gasp GPS)
* **Attacker's Vector:** The phone is snatched in transit. The thief presses and holds the power button to power down the device and prevent tracking.
* **Trackd Defense:**
  1. **Accessibility Decoy Interception:** If the thief triggers the system power menu, `AppDecoyAccessibilityService` intercepts the window touch event and closes the power dialog.
  2. **Last-Gasp Hardware GPS Lock:** If the phone proceeds to power down via hardware combination (`ACTION_SHUTDOWN` or `QUICKBOOT_POWEROFF`), `ShutdownReceiver` intercepts the broadcast, requests a rapid hardware GPS lock from the GPS chip, and posts an emergency payload to `telemetry_logs` within 2 seconds.
  3. **Offline GSM Fail-Safe:** If cellular data has been severed, Trackd falls back to GSM and fires an emergency SMS with GPS coordinates and battery percentage to the owner's trusted recovery number before the OS terminates:
     ```text
     ALERT [TRACKD SHUTDOWN]: Battery 78%. GPS: 5.6037,-0.1870. https://maps.google.com/?q=5.6037,-0.1870
     ```

---

### Scenario 2: Data Severed / Airplane Mode Active (Zero-Data SMS Recovery)
* **Attacker's Vector:** The thief swipes down the notification shade and enables Airplane Mode or turns off Mobile Data and Wi-Fi.
* **Trackd Defense:**
  * Trackd does not rely on internet connectivity. The owner borrows any phone and sends an encrypted text message to their device with their 4-digit Master PIN:
    * `#LOCATE#<PIN>`: Android wakes the GPS satellite receiver, computes coordinates, and texts back an instant Google Maps link:
      ```text
      Trackd GPS: 5.6037, -0.1870 (±6m) https://maps.google.com/?q=5.6037,-0.1870
      ```
    * `#SIREN#<PIN>`: `HardwareAlarm.kt` overrides silent mode and volume limits, maxes `STREAM_ALARM` to 100%, and sounds a high-decibel siren.
    * `#SILENCE#<PIN>`: Silences the emergency siren.
    * `#STOLEN#<PIN>`: Marks the device stolen, engaging the financial decoy shield.
    * `#SAFE#<PIN>`: Disarms theft mode and restores normal operation.
    * `#WIPE#<PIN>`: Triggers an irreversible low-level hardware factory wipe.
  * **Stealth Operation:** `SmsCommandReceiver` invokes `abortBroadcast()`. The incoming SMS never rings, never vibrates, never illuminates the screen, and leaves no entry in the SMS inbox or outbox.

---

### Scenario 3: Physical SIM Removal & SIM Swap Trap
* **Attacker's Vector:** The thief ejects the owner's SIM card and inserts their own SIM card to use the device or intercept 2FA codes.
* **Trackd Defense:**
  * Trackd caches the cryptographic hash of the legitimate SIM card's serial (ICCID) in hardware-backed `EncryptedSharedPreferences`.
  * On every device boot and SIM state change, `SimStateReceiver` validates the active SIM against the registered baseline.
  * **Silent Back-Channel SMS:** If an unauthorized SIM is detected, Trackd secretly dispatches a background alert SMS using the thief's newly inserted SIM card directly to the owner's emergency contact:
    ```text
    ALERT: SIM swap detected. New number: +23354XXXXXXX GPS: https://maps.google.com/?q=5.6037,-0.1870
    ```
  * The owner now has the thief's active phone number and real-time location.

---

### Scenario 4: Banking & Mobile Money Decoy Shield (Fintech Trap)
* **Attacker's Vector:** The thief attempts to access mobile banking, cryptocurrency wallets, or Mobile Money apps (MTN MoMo, Telecel Cash, AT Money, GCB, Ecobank, Zenith, Fidelity, Stanbic, Zeepay, Hubtel, Binance).
* **Trackd Defense:**
  * When the handset is marked as `isStolen: true`, `AppDecoyAccessibilityService` monitors `AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED`.
  * The moment an unauthorized user attempts to open any monitored financial application, Trackd sends `GLOBAL_ACTION_HOME`, returning them to the home screen.
  * A realistic native error overlay appears:
    ```text
    Application Crashed: Memory fault 0x884F
    Please reboot your device and try again later.
    ```
  * User funds and financial credentials remain completely inaccessible.

---

### Scenario 5: Real-Time Tactical Radar & Breadcrumb Tracking (Web Console)
* **Operator Action:** The owner opens `https://trackd-livid.vercel.app` from any desktop, tablet, or smartphone browser.
* **Trackd Defense:**
  * The Web Console establishes an active Firestore `onSnapshot` listener, streaming live device status, battery percentage, charging state, and GPS coordinates with zero polling lag.
  * Precision Leaflet vector maps render live coordinates, accuracy radius circles, and sequential breadcrumb trails.
  * **Live Reverse Geocoding:** Latitude/Longitude coordinates are automatically translated into human-readable suburban addresses (e.g., *"Adum, Kumasi"* or *"Airport Residential Area, Accra"*) via free OpenStreetMap Nominatim APIs without paid Google Maps billing.

---

### Scenario 6: High-Decibel Acoustic Recovery in Crowds or Indoors
* **Operator Action:** The map indicates the device is inside a specific multi-story building, crowded bus terminal, or market stall.
* **Trackd Defense:**
  * Triggered via the Web Console ("Trigger Siren") or SMS (`#SIREN#<PIN>`).
  * `HardwareAlarm.kt` access `AudioManager` to override system volume limits, sets `STREAM_ALARM` to the absolute hardware maximum, configures audio attributes to `USAGE_ALARM` with `FLAG_AUDIBILITY_ENFORCED`, and loops the alarm tone.
  * The siren cannot be muted using hardware volume buttons. Deactivation requires entering the Master PIN or tapping "Stop Loud Alarm".

---

### Scenario 7: Total Loss Containment (Hardware Factory Wipe)
* **Operator Action:** The handset is confirmed unrecoverable or contains sensitive enterprise credentials, banking tokens, and private data.
* **Trackd Defense:**
  * The owner executes the emergency wipe command via Web Console (requiring explicit uppercase confirmation `"WIPE DEVICE"`) or sends `#WIPE#<PIN>`.
  * `AntiTheftAdminReceiver` executes `DevicePolicyManager.wipeData(0)`.
  * The device immediately terminates all active processes, purges internal and external storage, destroys encryption keys, and initiates a hardware factory reset.

---

### Scenario 8: OEM Aggressive Battery Optimization Whitelist
* **Attacker's Vector:** Aggressive OEM battery managers (Xiaomi HyperOS / MIUI, Samsung One UI, Oppo / OnePlus ColorOS) kill background apps after 10 minutes of screen-off time.
* **Trackd Defense:**
  * Trackd requests `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` to whitelist the Sentinel package from the Android Doze whitelist.
  * In `MainActivity.java`, `TelemetryDispatcher.startPeriodic(this)` runs a resilient 5-minute heartbeat with partial wake lock capabilities.

---

## 📱 Mobile Sentinel UI (4-State Native Security Model)

The native Android APK (`com.trackd.app`) implements a robust 4-state lifecycle modeled after Google Play Protect and Pixel Security Center, strictly engineered to fit within `100dvh` (zero vertical scroll):

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
   (6/6 Perms Active)                    (< 6 Perms Active)
             |                                     |
             v                                     v
+-----------------------------+       +-----------------------------+
|       2. ARMED STATE        |       |      3. DEGRADED STATE      |
|  - Emerald 6/6 Glow Dial    | <---> |  - Amber Progress Arc       |
|  - "Device is Protected"    |       |  - Missing items float top  |
|  - PIN-Gated Settings Row   |       |  - "Finish setup" CTA       |
|  - Neon Siren Test Pill     |       |                             |
+--------------+--------------+       +--------------+--------------+
               |                                     |
               +------------------+------------------+
                                  |
                        (Device Marked Stolen)
                                  |
                                  v
                    +-----------------------------+
                    |       4. STOLEN STATE       |
                    |  - Crimson Emergency Beacon |
                    |  - Live GPS Stream to Web   |
                    |  - Financial App Decoy Trap |
                    |  - Owner PIN Unlock Gate    |
                    +-----------------------------+
```

### ASCII Layout (Armed & Degraded View)

```
+-------------------------------------------------------+
|  [🛡️]  Trackd                     Redmi • Guarded [🔄]|
|                                                       |
|                     .--------.                        |
|                    /   6/6    \                       |
|                   |  PROTECTED |                      |
|                    \          /                       |
|                     '--------'                        |
|                   Fully protected                     |
|                                                       |
|          [ 🔋 Battery 77% ]     [ ● SMS ready ]       |
|                                                       |
|  PROTECTION                              ((•)) Live Synced
|  +-------------------------------------------------+  |
|  | [📍] Always-on location                     [✓] |  |
|  | [💬] Find phone offline                     [✓] |  |
|  | [🔒] Remote lock and erase                  [✓] |  |
|  | [⚡] Keep app running                       [✓] |  |
|  | [⚠️] Prevent power off                      [✓] |  |
|  | [👁️] Lock screen message                   [✓] |  |
|  +-------------------------------------------------+  |
|                                                       |
|  +-------------------------------------------------+  |
|  | [🔑] Offline PIN & contact   Locked • Needs PIN [>] |
|  +-------------------------------------------------+  |
|                                                       |
|  [         🔊 TEST LOUD SIREN (EMERALD PILL)       ]  |
+-------------------------------------------------------+
```

| UI Element | Functionality & Real Hardware Integration |
| :--- | :--- |
| **Top Header Bar** | Minimal obsidian bar displaying "Trackd" shield and live hardware model (`Build.MODEL`) with real-time state badge (`Guarded` in emerald or `Partly guarded` in amber). |
| **Central Hero Dial** | Dynamic SVG progress ring. Displays emerald ring at 6/6 coverage, or amber segmented arc when degraded. |
| **Hardware Telemetry Pills** | **100% Real OS Ground Truth**: Live battery reading via `BatteryManager`, real telephony SMS provider status, and live Firestore sync status. |
| **Dynamic Inset Checklist** | Grouped card of 6 native protections. In `degraded` mode, ungranted permissions float to the top with a blue "Set up >" button. |
| **Master PIN Keypad Gate** | Sleek slide-up numeric bottom sheet (1–9, fingerprint, 0, backspace, 4 dots) requiring Master PIN before revealing emergency credentials. |
| **Step-by-Step Onboarding** | Step 1 (Firebase Auth), Step 2 (Device naming), Step 3 (Master PIN), Step 4 (Trusted phone), and Steps 5–6 (Progressive permission elevation). |
| **Test Loud Siren** | Vibrates phone with `@capacitor/haptics`, sounds 100% max volume alarm via `HardwareAlarm.kt`, and auto-stops after 5 seconds. |

---

## 📟 Encrypted SMS Command Matrix

All commands require the owner's 4-digit Master Recovery PIN. Telephony broadcasts are silenced via `abortBroadcast()`.

| Command Syntax | Functionality | Handset Reaction | Automated SMS Reply Format |
| :--- | :--- | :--- | :--- |
| `#LOCATE#<PIN>` | Satellite GPS Fix | Hooks `FusedLocationProviderClient`, computes coordinates | `Trackd GPS: <LAT>,<LNG> (±<ACC>m) https://maps.google.com/?q=<LAT>,<LNG>` |
| `#SIREN#<PIN>` | Acoustic Alarm | Maxes `STREAM_ALARM` volume to 100%, loops siren | `Trackd: High-decibel emergency siren activated.` |
| `#SILENCE#<PIN>` | Silence Alarm | Immediately stops active audio ringtone | `Trackd: Emergency siren silenced.` |
| `#STOLEN#<PIN>` | Lock & Trap | Arms `isStolen`, enables Fintech decoy crash overlay | `Trackd: device marked STOLEN. Financial decoys armed.` |
| `#SAFE#<PIN>` | Disarm System | Sets `isStolen: false`, restores normal use | `Trackd: device marked SAFE. Decoys disarmed.` |
| `#WIPE#<PIN>` | Factory Reset | Calls `DevicePolicyManager.wipeData(0)` | `Trackd: initiating factory reset.` |

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Mobile Core (Android)** | Kotlin 1.9, Capacitor 6, Android SDK 26–35+, Android `DevicePolicyManager`, `FusedLocationProviderClient` |
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

### 1. Firebase Spark Setup (Free Tier — Zero Cost)
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
