import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Lazy firebase-admin singleton for Vercel serverless functions.
 * Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 * No Cloud Functions / Blaze billing involved — this runs on Vercel.
 */
function cleanPrivateKey(raw?: string): string {
  if (!raw) return "";
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

export function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    "trackd-6a6e5";

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    "firebase-adminsdk-fbsvc@trackd-6a6e5.iam.gserviceaccount.com";

  const privateKey = cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!privateKey) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is missing from environment variables."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId
  });
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
