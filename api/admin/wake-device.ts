import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getMessaging } from "firebase-admin/messaging";
import { adminApp, adminDb } from "../_lib/admin.js";
import { handleCors } from "../_lib/cors.js";

const ACTIONS = new Set(["LOCATE", "STOLEN", "SAFE", "WIPE"]);

/**
 * POST /api/admin/wake-device  { deviceId, action }
 * Looks up the device's FCM registration token and dispatches a
 * high-priority data-only wake message. The Firestore flag writes made by
 * the dashboard remain the primary command channel; this is the silent ping
 * that wakes a dozing phone so its snapshot listener fires promptly.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { deviceId, action } = (req.body ?? {}) as {
    deviceId?: unknown;
    action?: unknown;
  };
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return res.status(400).json({ success: false, error: "deviceId is required" });
  }
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    return res.status(400).json({ success: false, error: "action must be LOCATE | STOLEN | SAFE | WIPE" });
  }

  try {
    const snapshot = await adminDb().collection("devices").doc(deviceId).get();
    if (!snapshot.exists) {
      return res.status(404).json({ success: false, error: "Device not found" });
    }
    const fcmToken = snapshot.data()?.fcmToken as string | undefined;
    if (!fcmToken) {
      return res.status(404).json({ success: false, error: "Device has no FCM token yet" });
    }

    const messageId = await getMessaging(adminApp()).send({
        token: fcmToken,
        data: { action, timestamp: Date.now().toString() },
        android: { priority: "high" }
      });

    return res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error("wake-device failed", error);
    return res.status(500).json({ success: false, error: "Failed to dispatch wake message" });
  }
}
