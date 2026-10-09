# Trackd — Technical Inventory (Web Dashboard / Mobile APK Separation)

> Generated from repo state: branch `main` @ `e0a8332` · product `trackd` v1.0.0
> Purpose: document every moving part so the Web Dashboard can be separated from the Mobile Client APK without breaking services.

---

## 1. Project Structure & Routing

### Framework / bundler

| Item      | Value                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bundler   | **Vite 5.4.8** + `@vitejs/plugin-react` (`vite.config.ts` — no proxy, port 5173, build target `es2020`, no sourcemaps) |
| UI        | React**18.3.1** + TypeScript 5.6, Tailwind CSS 3.4 + design tokens (`src/index.css`)                                   |
| Routing   | **No router library.** Conditional state render (2 views)                                                              |
| API layer | Vercel serverless functions in`api/` (`@vercel/node` 22)                                                               |
| Scripts   | `dev`, `build` (`tsc -b && vite build`), `typecheck`, `cap:sync`                                                       |

### Entry points

```
index.html                  → <div id="root"> + /src/main.tsx
src/main.tsx                → ReactDOM.createRoot → <App/>, imports leaflet.css + index.css
src/App.tsx                 → top-level state machine (the only "router")
```

### Routing logic — `src/App.tsx:43-107`

```tsx
// No <BrowserRouter>. Three-way branch:
if (!isConfigured)  → <SetupNotice/> (or <ConsolePage demo/> if ?demo=1)
if (booting)        → spinner (12s slow-boot timeout)
return user ? <ConsolePage user={user}/> : <AuthPage backendSlow={slowBoot}/>;
// user comes from onAuthStateChanged(auth()) — Firebase Auth listener
```

- **`src/pages/AuthPage.tsx`** — email+password sign-in, signup wizard (name/password → OTP via `/api/auth/send-otp` → emergency contact + PIN), demo-mode toggle.
- **`src/pages/ConsolePage.tsx`** — authenticated shell. **Second routing layer**: line 44 `const isNative = Capacitor.isNativePlatform()` → renders `<MobileConsole/>` (APK) vs desktop `<aside>` + map layout (web).
- **`src/lib/demo.ts`** — `?demo=1` / unconfigured fallback: mock device + 40 telemetry points behind the same subscribe APIs.

---

## 2. Capacitor & Android Configuration

### Capacitor plugins in `package.json`

Only **3** Capacitor runtime packages — everything else (location, SMS, device admin, FCM) is **hand-written native Kotlin**:

```json
"@capacitor/android": "^6.1.2",
"@capacitor/core": "^6.1.2",
"@capacitor/preferences": "^6.0.2",
"@capacitor/cli" (dev): "^6.1.2"
```

> No `@capacitor/geolocation`, `@capacitor/push-notifications`, `@capacitor/device`, `@capacitor/network`. Capacitor **6.1.x**.

### `capacitor.config.ts`

```ts
{
  appId: "com.trackd.app",
  appName: "Trackd",
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: { SplashScreen: { launchShowDuration: 0 } }
}
```

(Generated copy: `android/app/src/main/assets/capacitor.config.json`.)

### Native code — `android/app/src/main/java/com/trackd/app/` (11 files)

| File                              | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MainActivity.java`               | `BridgeActivity`; registers `TrackdBridgePlugin`, `TelemetryDispatcher.startPeriodic` in onCreate, `public onDestroy` stops it                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TrackdBridgePlugin.kt`           | Capacitor bridge:`scanInstalledFintechApps`, `requestDeviceAdmin`, `isDeviceAdminActive`, `saveEmergencyContact`, `saveDeviceCredentials`, `configureAccount` (native Firebase Auth email/password sign-in → `sendNow("APP_LINKED")`), `checkAccessibilityPermission`, `openAccessibilitySettings`, `openAppSettings`, `requestOverlayPermission`, `getDeviceStatus`, `getLinkState`, `markStolen`, plus **permission aliases** (location/sms/notifications/phoneState/phoneNumbers → Capacitor built-in `requestPermissions`/`checkPermissions`) |
| `TelemetryDispatcher.kt`          | GPS capture: 12s`CancellationTokenSource` timeout → `lastLocation` fallback → null-fix post; `startPeriodic`/`stopPeriodic` 5-min heartbeat; `sendNow(context, reason)` with triggers: `FCM_WAKE`, `APP_LINKED`, `APP_START`, `PERIODIC`, `BOOT`, `SHUTDOWN`, `SIM_CHANGE`, `SMS_COMMAND`, `LOCATE_REQUEST`                                                                                                                                                                                                                                       |
| `FirestoreSync.kt`                | Firestore SDK writes (requires`FirebaseAuth.currentUser`): `writeTelemetry` → `telemetry_logs.add` + `devices.update(lastSeenAt/battery/lastTelemetry)`; **`startCommandListener`** = `devices/{id}.addSnapshotListener` → `handleDeviceSnapshot` (acts on `isStolen`, `requestLocate` → LOCATE + ack-reset, `requestWipe` → WIPE + ack-reset); `pushFcmToken`, `pushStolen`                                                                                                                                                                      |
| `AegisPushService.kt`             | `FirebaseMessagingService`: `onNewToken` → store + `pushFcmToken`; `onMessageReceived` data `{action}` → `STOLEN`/`SAFE` set state, `LOCATE` → `sendNow("FCM_WAKE")`, `WIPE` → `AntiTheftAdminReceiver.executeWipe`                                                                                                                                                                                                                                                                                                                               |
| `SmsCommandReceiver.kt`           | `SMS_RECEIVED` (priority 999): parses `#LOCATE\|STOLEN\|SAFE\|WIPE <PIN>` (SHA-256 PIN check), replies via SMS (`handleLocate` sends GPS text)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SimStateReceiver.kt`             | `BOOT_COMPLETED` / `SIM_STATE_CHANGED` → telemetry (`BOOT` / `SIM_CHANGE`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ShutdownReceiver.kt`             | `ACTION_SHUTDOWN` → REST `POST` of SHUTDOWN telemetry via Firebase ID token (survives process teardown; no SDK)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AntiTheftAdminReceiver.kt`       | `DeviceAdminReceiver` + `executeWipe` (factory reset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `AppDecoyAccessibilityService.kt` | Blocks fintech app launches when stolen: return home + fake "app crashed" overlay                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AegisState.kt`                   | SharedPreferences singleton (`stolen`, `fcm_token`, device id, admin flag)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### `AndroidManifest.xml` — permissions & components

```xml
<!-- 18 permissions -->
INTERNET, ACCESS_NETWORK_STATE,
ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION,
FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION,
RECEIVE_BOOT_COMPLETED, RECEIVE_SMS, READ_SMS, SEND_SMS,
READ_PHONE_STATE, READ_PHONE_NUMBERS,
QUERY_ALL_PACKAGES (tools:ignore), SYSTEM_ALERT_WINDOW,
POST_NOTIFICATIONS, WAKE_LOCK, VIBRATE

<!-- components -->
<activity .MainActivity>                      singleTask, MAIN/LAUNCHER
<provider FileProvider>                       ${applicationId}.fileprovider
<service .AegisPushService>                   MESSAGING_EVENT (channel "trackd_alerts")
<receiver .AntiTheftAdminReceiver>            BIND_DEVICE_ADMIN + device_admin_policies.xml
<receiver .ShutdownReceiver>                  priority 1000, ACTION_SHUTDOWN/QUICKBOOT
<receiver .SmsCommandReceiver>                BROADCAST_SMS, priority 999, SMS_RECEIVED
<receiver .SimStateReceiver>                  priority 999, BOOT_COMPLETED/SIM_STATE_CHANGED
<service .AppDecoyAccessibilityService>       BIND_ACCESSIBILITY_SERVICE
```

No foreground-service class exists — location runs in Capacitor activity scope with FGS-location permission declared.

---

## 3. Backend & Real-Time Sync (Firebase / Firestore)

### Frontend init — `src/lib/firebase.ts`

```ts
initializeApp({ apiKey, authDomain, projectId, storageBucket,
                messagingSenderId, appId })   // all from VITE_* env
export isConfigured / auth() / db() / projectId   // lazy singletons
```

- Firebase project: `trackd-6a6e5`, Spark plan.
- Server side: `api/_lib/admin.ts` (`firebase-admin` SA, `FIREBASE_*` env) + `api/_lib/cors.ts`.

### Collections (constants `src/lib/api.ts:28-30`)

| Collection       | Written by                                                                                                            | Read by                                                                              | Schema                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| `users`          | Web`saveProfile()`                                                                                                    | Web`fetchProfile()`                                                                  | `UserProfile`          |
| `devices`        | Web`createDevice`/`updateDevice`; Native `FirestoreSync` (`fcmToken`, `lastSeenAt`, `battery`, `lastTelemetry`, acks) | Web`subscribeDevices`/`subscribeDevice`; Native `addSnapshotListener`; `wake-device` | `Device`               |
| `telemetry_logs` | Native`writeTelemetry`; Web `appendTelemetry` (demo `LOCATE_REQUEST`)                                                 | Web`subscribeTelemetry`                                                              | `TelemetryLog`         |
| `otps`           | `/api/auth/send-otp`                                                                                                  | `/api/auth/verify-otp` (deleted after use)                                           | { code, expiresAt, … } |

### Interface schemas — `src/lib/types.ts`

```ts
TriggerReason = "SHUTDOWN" | "SIM_CHANGE" | "SMS_COMMAND" | "LOCATE_REQUEST"
              | "FCM_WAKE" | "APP_LINKED" | "APP_START" | "PERIODIC" | "BOOT"
RemoteCommand = "STOLEN" | "SAFE" | "LOCATE" | "WIPE"

UserProfile  { fullName, email, phoneNumber, emergencyContactPhone,
               masterPinHash, createdAt }                  // sha256 hex (crypto.ts)
Device       { id, userId, deviceName, deviceModel?, fcmToken?,
               registeredSimSerial?, isStolen, requestLocate,
               requestWipe?, lastSeenAt, lastTelemetry?, battery? }
TelemetrySnapshot { lat, lng, accuracy, battery, trigger }
TelemetryLog { id, deviceId, userId, lat, lng, accuracy,
               battery, triggerReason, timestamp }
```

### Data flows

**Telemetry (phone → Firestore):**

```
TelemetryDispatcher.sendNow / heartbeat
  → fused location (12s timeout → lastKnown → null)
  → FirestoreSync.writeTelemetry  [Firestore SDK, signed-in user]
      telemetry_logs.add({deviceId, userId, lat, lng, accuracy, battery, triggerReason, timestamp})
      devices.update({lastSeenAt, battery, lastTelemetry?})   // only if fix != null
```

Shutdown path is the exception: `ShutdownReceiver` posts via REST
`POST /v1/projects/…/databases/(default)/documents/telemetry_logs` with a fresh ID token.

**Telemetry (Firestore → web):**

```ts
subscribeTelemetry(deviceId, userId, cb)   // src/lib/api.ts:146
  query(collection(db, "telemetry_logs"),
        where("deviceId", "==", deviceId),
        where("userId",   "==", userId),
        limit(250))
  → onSnapshot(...)                        // snapshot stream, no polling

subscribeDevices(userId) → where("userId","==",userId) + onSnapshot
```

**Remote actions (web → phone) — dual channel, Firestore flags primary:**

```
ActionToolbar (src/components/ActionToolbar.tsx:28)
  1) updateDevice(deviceId, {isStolen | requestLocate | requestWipe …})  // Firestore flag
  2) fetch(apiUrl("/api/admin/wake-device"), { deviceId, action })      // silent FCM ping
        ↓                                     ↓
  devices/{id}.addSnapshotListener      AegisPushService.onMessageReceived {action}
  (FirestoreSync.kt:116)                    STOLEN / SAFE / LOCATE / WIPE dispatch
        both paths → TelemetryDispatcher.sendNow / AntiTheftAdminReceiver.executeWipe
        → ack: updateDoc(requestLocate=false / requestWipe=false)
```

**Auth → phone link:** `configureAccount(email, password)` in bridge → native
`FirebaseAuth.signInWithEmailAndPassword` → stores uid/deviceId in `AegisState` → enables all `FirestoreSync` writes.

**Firestore rules (live, ruleset `5698fa7a`):** owner-only —
`devices`/`telemetry_logs` reads/writes require
`resource.data.userId == request.auth.uid`. Every client query must carry
`deviceId` + `userId` equality filters (single-field index merging; composite index not provisioned on current SA).

---

## 4. Current UI Components & View Logic

`src/components/` (11) + `src/pages/` (2) + `src/plugins/` (1):

| File                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                              | Platform            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `MobileConsole.tsx`                  | **APK-only UI**: floating glass app bar (logo / live-dot / email / theme / sign-out) + bottom sheet, 3 tabs (Status / Protect / Commands), `LinkCard`                                                                                                                                                                                                                                                                | native only         |
| `ConsolePage.tsx`                    | Shell + platform branch (line 44`isNative`), device selection, demo wiring, `lastKnown` prop                                                                                                                                                                                                                                                                                                                         | both                |
| `MapPanel.tsx`                       | react-leaflet map, trail +`lastKnown` marker, 0,0 filtering, `showFix`                                                                                                                                                                                                                                                                                                                                               | both                |
| `ActionToolbar.tsx`                  | STOLEN / SAFE / LOCATE / WIPE buttons →`updateDevice` + `/api/admin/wake-device`                                                                                                                                                                                                                                                                                                                                     | both                |
| `StatusPills.tsx`                    | last-seen / battery / stolen chips                                                                                                                                                                                                                                                                                                                                                                                   | both                |
| `CheatSheet.tsx`                     | SMS command reference,**clipboard copy only** (no `sms:` deeplink)                                                                                                                                                                                                                                                                                                                                                   | both                |
| `DeviceOnboarding.tsx`               | Register/link device;**password required when `isNative`** (line 17) → native `configureAccount`                                                                                                                                                                                                                                                                                                                     | both                |
| `PermissionChecklist.tsx`            | Exports`autoRequestTrackingPermissions()` (once/session); rows → native `requestPermissions` alias or Settings (line 47 `isNative`)                                                                                                                                                                                                                                                                                  | both                |
| `WipeDialog.tsx` / `ThemeToggle.tsx` | Confirm modal / dark-light toggle                                                                                                                                                                                                                                                                                                                                                                                    | both                |
| `AuthPage.tsx`                       | Sign-in / signup + OTP (calls`apiUrl`)                                                                                                                                                                                                                                                                                                                                                                               | both                |
| `src/plugins/trackd.ts`              | `registerPlugin<TrackdPlugin>("TrackdBridge")` + Web stubs: `configureAccount`, `scanInstalledFintechApps`, `requestDeviceAdmin`, `isDeviceAdminActive`, `saveEmergencyContact`, `saveDeviceCredentials`, `checkAccessibilityPermission`, `openAccessibilitySettings`, `openAppSettings`, `requestOverlayPermission`, `getDeviceStatus`, **`checkPermissions` / `requestPermissions`**, `getLinkState`, `markStolen` | both (stubs on web) |

**Platform checks today — 5 call sites** (`Capacitor.isNativePlatform()`):

- `src/pages/ConsolePage.tsx:44` — layout branch
- `src/lib/api.ts:32` — `API_ORIGIN` (absolute vs relative `/api`)
- `src/components/DeviceOnboarding.tsx:17` — password requirement
- `src/components/PermissionChecklist.tsx:47` — permission flow
- `src/components/MobileConsole.tsx:155` — link-card visibility

Same bundle serves both platforms — branching is **runtime, not build-time**.

Shared-data seam: `src/lib/api.ts` imported by both pages; demo mode (`src/lib/demo.ts`) swaps implementations via `isDemoMode()`.

---

## 5. Offline SMS & External Services

| Concern                                    | Location                                                                                                                                       | Mechanism                                                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inbound SMS commands** (offline channel) | `android/…/SmsCommandReceiver.kt`                                                                                                              | `SMS_RECEIVED` broadcast → `parseCommand` (`#LOCATE\|STOLEN\|SAFE\|WIPE <PIN>`, SHA-256 PIN vs `AegisState`) → `handleLocate` replies with GPS via `SmsManager.sendTextMessage`; STOLEN/SAFE flip `AegisState` |
| **SMS command reference** (web copy)       | `src/components/CheatSheet.tsx` + `SMS_COMMANDS` in `src/lib/types.ts:57`                                                                      | clipboard copy only — web**never sends** commands over SMS                                                                                                                                                     |
| **OTP SMS (Sailup.io)**                    | `api/auth/send-otp.ts`                                                                                                                         | Server-side HTTP POST to Sailup API,**sender = `Trackd`** (TRACKD pending; revert = one word each in `send-otp.ts` + `AuthPage.tsx` hint); consumed by `api/auth/verify-otp.ts`                                |
| **Outbound shutdown report**               | `android/…/ShutdownReceiver.kt`                                                                                                                | REST`POST`/`PATCH` with fresh Firebase ID token (no SDK — survives process death)                                                                                                                              |
| **FCM push**                               | Server:`api/admin/wake-device.ts` (`getMessaging().send({ data: { action }, android: { priority: "high" } })`) · Device: `AegisPushService.kt` | token persisted to`devices.fcmToken` by `FirestoreSync.pushFcmToken`                                                                                                                                           |
| **Vercel endpoints**                       | `api/auth/send-otp`, `api/auth/verify-otp`, `api/admin/wake-device`, `api/_lib/{admin,cors}.ts`                                                | CORS via`handleCors`; web calls relative `/api/*`, native calls absolute `API_ORIGIN = VITE_API_ORIGIN ?? https://trackd-livid.vercel.app` (`src/lib/api.ts:32-39`)                                            |

---

## Separation map (Web vs APK)

```
                        ┌─ WEB (browser) ───────────────────────────┐
 index.html → main.tsx → App.tsx → AuthPage / ConsolePage(desktop)   │
                        │   MapPanel · ActionToolbar · CheatSheet    │
                        │   subscribe* (onSnapshot) + relative /api  │
                        └────────────┬───────────────────────────────┘
     shared single bundle (runtime Capacitor.isNativePlatform() branch — the seam)
                        ┌─ APK (Capacitor webview) ─────────────────┐
 ConsolePage → MobileConsole (sheet/tabs/LinkCard) + PermissionChecklist auto-ask
                        │   trackd.ts → TrackdBridgePlugin (13 methods)
                        │   TelemetryDispatcher / FirestoreSync / AegisPushService /
                        │   SmsCommandReceiver / ShutdownReceiver / …
                        └────────────────────────────────────────────┘
```

**Split-relevant facts:**

1. **One Vite build, one `webDir: "dist"`** — no build-time separation yet. Splitting = two Vite entries (or two SPAs) sharing `src/lib/` (`types`, `firebase`, `api`, `crypto`, `demo`).
2. **Native-only code is 100% outside `src/`** (`android/` + `plugins/trackd.ts` stubs) — safe to keep as the APK's own entry.
3. **Web-only surfaces:** `AuthPage` OTP/signup (phone uses native `configureAccount`), `CheatSheet`, `PermissionChecklist`, demo mode, desktop sidebar layout.
4. **Coupling to cut carefully:** `api.ts`'s `API_ORIGIN` (native absolute vs web relative `/api`), and `updateDevice` flag writes — both platforms write the same `devices` doc; commands must keep working (Firestore flags primary, FCM wake secondary).
5. **Rules constrain every query:** `devices`/`telemetry_logs` require `userId == request.auth.uid` — any new client-side query must carry both `deviceId` + `userId` equality filters (composite index unavailable with current SA permissions).
