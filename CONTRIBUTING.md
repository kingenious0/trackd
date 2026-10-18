# Contributing to Trackd 🛡️

Thank you for your interest in contributing to Trackd! Trackd is an open-source, offline-first phone recovery and anti-theft platform designed to protect users against real-world device theft, unauthorized resets, and financial account draining.

We welcome contributions from mobile engineers, security researchers, web developers, and designers.

---

## 🚀 Quick Setup

Trackd is composed of two primary layers:
1. **Android Native Core (`/android`):** Native Kotlin services, Accessibility guards, BroadcastReceivers, and Device Policy Admin integration.
2. **Web Dashboard & Companion (`/src`):** React 18, Vite, Tailwind CSS, Leaflet Maps, and Firebase SDK.

### Prerequisites
- Node.js (v18+) & `npm`
- Android Studio (Jellyfish / Koala or newer)
- Android SDK 34 (API 34)
- A physical Android device running Android 8.0+ (emulators cannot test GSM SMS or biometric features reliably).

### Running the Web Dashboard Locally
```bash
git clone https://github.com/kingenious0/trackd.git
cd trackd
npm install
npm run dev
```

### Building the Android APK
```bash
cd android
./gradlew assembleRelease
# APK is generated at android/app/build/outputs/apk/release/app-release.apk
```

---

## 🛠️ Contribution Guidelines

### 1. Finding Something to Work On
Check the [Issues](https://github.com/kingenious0/trackd/issues) tab. Look for issues labeled:
- `good first issue`: Ideal for newcomers.
- `help wanted`: Complex or high-priority improvements.
- `bug`: Confirmed bugs ready for patch proposals.

### 2. Privacy & Security First
- **Zero PII in Logs/Analytics:** Never log phone numbers, contacts, PINs, or raw GPS coordinates to logs, analytics, or third-party servers.
- **Local Decryption:** Master PINs must remain encrypted on-device.

### 3. Pull Request Process
1. Fork the repo and create a feature branch (`git checkout -b feat/your-feature-name`).
2. Keep changes focused and surgical.
3. Verify the build passes cleanly:
   ```bash
   npm run build
   ```
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(...)`: New feature or capability
   - `fix(...)`: Bug fix
   - `docs(...)`: Documentation updates
   - `refactor(...)`: Code improvement without behavioral change
5. Open a Pull Request referencing the related issue.

---

## 📜 Code of Conduct
Please review and adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md). Be respectful, collaborative, and constructive.
