# Trackd

Anti-theft recovery and financial-protection system: an Android client (Capacitor 6 + Kotlin native shell) paired with a Find My-style React/Vite console, backed by the **Firebase Spark (free) plan** (Auth, Cloud Firestore, Cloud Messaging) plus **Vercel serverless routes** for Sailup.io SMS OTP and FCM wake pings. No Cloud Functions, no Phone Auth, no Blaze billing.

## Layout

```
AegisTrack/                            (folder name; product = Trackd)
├── api/                               Vercel serverless routes (Node.js)
│   ├── _lib/admin.ts                firebase-admin singleton (env credentials)
│   ├── auth/send-otp.ts             6-digit Sailup.io SMS OTP, hashed store, 5-min TTL
│   ├── auth/verify-otp.ts           code check → verification session token
│   └── admin/wake-device.ts         high-priority data-only FCM ping
├── android/                           Capacitor Gradle project (package com.trackd.app)
│   └── app/src/main/                  Kotlin sources, manifest, admin/accessibility XML
├── src/                               React console (Vite + Tailwind + Leaflet)
│   ├── pages/                       AuthPage (4-step onboarding), ConsolePage (onSnapshot)
│   ├── components/                  StatusPills, ActionToolbar, MapPanel, CheatSheet,
│   │                                WipeDialog, DeviceOnboarding, PermissionChecklist, ThemeToggle
│   ├── lib/                         firebase init, Firestore api wrappers, demo store, crypto
│   └── plugins/trackd.ts            Typed TrackdBridge interface + web fallback
├── firestore.rules                   Owner-only rules, telemetry append-only, otps server-only
└── capacitor.config.ts               appId com.trackd.app, appName Trackd
```

## Firestore schema

| Doc | Fields |
| --- | --- |
| `users/{userId}` | `fullName`, `email`, `phoneNumber` (verified via Sailup.io), `emergencyContactPhone`, `masterPinHash` (SHA-256), `createdAt` |
| `devices/{deviceId}` | `userId`, `deviceName`, `deviceModel`, `fcmToken`, `registeredSimSerial`, `isStolen`, `requestLocate`, `requestWipe`, `lastSeenAt`, `lastTelemetry {lat,lng,accuracy,battery,trigger}` |
| `telemetry_logs/{logId}` | `deviceId`, `userId`, `lat`, `lng`, `accuracy`, `battery`, `triggerReason` (`SHUTDOWN` / `SIM_CHANGE` / `SMS_COMMAND` / `LOCATE_REQUEST`), `timestamp` — immutable |
| `otps/{phoneNumber}` | `codeHash`, `expiresAt`, `attempts`, `requestedAt` — backend only (clients denied by rules) |

Realtime is plain Firestore `onSnapshot()`. The dashboard writes `isStolen` / `requestLocate` / `requestWipe` flags; the phone's snapshot listener in `FirestoreSync.kt` reacts, answers `requestLocate` with GPS, and clears the flag. Every dashboard action additionally fires a fire-and-forget POST to `/api/admin/wake-device` (silent FCM ping) when deployed on Vercel — Firestore flags remain authoritative.

## Native components

| Class | Role |
| --- | --- |
| `TrackdBridgePlugin` | Capacitor bridge: `configureAccount` (Firebase sign-in → starts listener), `saveDeviceCredentials`, fintech scan, admin, secure settings, accessibility/overlay/app-settings intents |
| `FirestoreSync` | SDK telemetry writes, device snapshot listener (stolen / locate / wipe), FCM-token + stolen-flag pushes |
| `AntiTheftAdminReceiver` | `DeviceAdminReceiver`, policy XML binds `force-lock` + `wipe-data`, exposes `executeWipe()` |
| `ShutdownReceiver` | `ACTION_SHUTDOWN` / `QUICKBOOT_POWEROFF` → GPS fix → **Firestore REST** `POST telemetry_logs` + `PATCH devices/{id}` with the Auth idToken; offline or write failure → SMS `"ALERT [TRACKD]: Phone powering down. Last GPS: …"` |
| `AppDecoyAccessibilityService` | `TYPE_WINDOW_STATE_CHANGED`; when `isStolen` and a Ghana fintech app (MTN, Vodafone, AT, GCB, Ecobank, Zenith, Fidelity, Stanbic, Zeepay, Hubtel) is foregrounded → home + un-cancelable crash dialog |
| `SmsCommandReceiver` | `#LOCATE#/#STOLEN#/#SAFE#/#WIPE#[PIN]`, SHA-256 PIN verify, replies/acts, `abortBroadcast()`; LOCATE and stolen/safe changes also sync to Firestore |
| `SimStateReceiver` | Boot + SIM change; ICCID mismatch → emergency SMS + `SIM_CHANGE` telemetry |
| `AegisPushService` | FCM data messages (`STOLEN`/`SAFE`/`LOCATE`/`WIPE`) drive the same state machine |

## Running it

**1. Firebase console (one-time):**

1. Create a project, add a **Web app** → copy the config into `.env` (`VITE_FIREBASE_*` keys).
2. Enable **Authentication → Email/Password**.
3. Create **Cloud Firestore** (production mode, Spark plan) → deploy `firestore.rules`.
4. Add an **Android app** (`com.trackd.app`) → `google-services.json` into `android/app/`.
5. Create a **service account key** (Project settings → Service accounts) for the `/api` backend.

**2. Backend env (Vercel → Project → Settings → Environment Variables):**

```
SAILUP_API_KEY=sailup_...
FIREBASE_PROJECT_ID=<project>
FIREBASE_CLIENT_EMAIL=<service-account email>
FIREBASE_PRIVATE_KEY=<private key, \n-escaped>
```

Deploy the repo on Vercel: the SPA is served statically and `/api/*` become serverless functions. Local API dev: `vercel dev`.

**3. Web console:**

```bash
npm install
npm run dev                 # http://localhost:5173
npm run build               # tsc -b && vite build → dist/
```

Unconfigured `.env` shows a setup card (never a whitescreen) with a demo-mode button; `?demo=1` opens the simulated console directly. Auth has a 12s Firebase-reachability fallback instead of an endless spinner.

**Onboarding flow:** ① account (name/email/password/phone) → Sailup.io SMS code ② 6-digit verify → session token ③ emergency contact + 4-digit Master Recovery PIN → Firebase account + `users/{uid}` ④ device registration + native permission triggers (Device Admin, Accessibility, Overlay, Location/SMS) via `PermissionChecklist` inside the Android app.

**4. Android app:**

```bash
npm run build
npm run cap:sync
```

Open `AegisTrack/android` in Android Studio (installs SDK, syncs Gradle, Run ▶ on API 26+), or `.\gradlew.bat assembleDebug` once the SDK exists.

## Security notes

- `firestore.rules`: reads/writes scoped to `request.auth.uid`; `telemetry_logs` create+read, never update/delete; `otps/*` denied to clients entirely.
- OTPs are stored hashed with 5-minute TTL, 60s resend cooldown, 5-attempt lockout, single-use (deleted on success).
- Native writes use the signed-in Auth session; the shutdown REST path attaches the idToken and falls back to SMS within ~8s if the write cannot land.
- Command PINs exist only as SHA-256 digests (device `EncryptedSharedPreferences`, `users/{uid}.masterPinHash`); wrong SMS PINs abort silently. The account password used for on-device linking is never persisted.
- SMS replies use sender ID `TRACKD`; emergency commands never reach the inbox (`abortBroadcast()`).
- Dashboard wipe requires typing `WIPE DEVICE` before `requestWipe` is written.
