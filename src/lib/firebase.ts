import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? ""
};

export const isConfigured =
  config.apiKey.length > 0 &&
  config.projectId.length > 0 &&
  !config.apiKey.startsWith("YOUR_") &&
  !config.projectId.startsWith("your-");

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let analyticsInstance: Analytics | null = null;

function app$(): FirebaseApp {
  if (!app) app = initializeApp(config);
  return app;
}

export function auth(): Auth {
  if (!isConfigured) throw new Error("Firebase is not configured yet");
  if (!authInstance) authInstance = getAuth(app$());
  return authInstance;
}

export function db(): Firestore {
  if (!isConfigured) throw new Error("Firebase is not configured yet");
  if (!dbInstance) dbInstance = getFirestore(app$());
  return dbInstance;
}

export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (!isConfigured || typeof window === "undefined") return null;
  if (!analyticsInstance) {
    const supported = await isSupported().catch(() => false);
    if (supported) {
      analyticsInstance = getAnalytics(app$());
    }
  }
  return analyticsInstance;
}

/**
 * Privacy-first event tracking: NEVER include PII (phone, PIN, exact GPS coords, email)
 */
export async function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  try {
    const instance = await getAnalyticsInstance();
    if (instance) {
      logEvent(instance, eventName, params);
    }
  } catch {
    // Analytics failures must never break app execution
  }
}

export const projectId = config.projectId;
