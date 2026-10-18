import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuth } from "firebase-admin/auth";
import { adminApp, adminDb } from "../_lib/admin.js";
import { handleCors } from "../_lib/cors.js";

/**
 * Authorized Super Admins
 * Can also be augmented via process.env.TRACKD_ADMIN_EMAILS (comma-separated)
 */
const DEFAULT_ADMIN_EMAILS = ["kingenious0@gmail.com"];

function getAuthorizedAdminEmails(): string[] {
  const extra = (process.env.TRACKD_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...extra]));
}

async function verifyAdminCaller(req: VercelRequest): Promise<{ authorized: boolean; email?: string }> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { authorized: false };
  }
  const idToken = authHeader.substring(7).trim();
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(idToken);
    const callerEmail = (decoded.email ?? "").toLowerCase();
    const authorizedList = getAuthorizedAdminEmails();
    if (callerEmail && authorizedList.includes(callerEmail)) {
      return { authorized: true, email: callerEmail };
    }
    return { authorized: false, email: callerEmail };
  } catch (err) {
    console.error("Token verification failed", err);
    return { authorized: false };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { authorized, email } = await verifyAdminCaller(req);
  if (!authorized) {
    return res.status(403).json({
      success: false,
      error: "Access denied. Only authorized Trackd administrators may access this console."
    });
  }

  try {
    const db = adminDb();

    // 1. Fetch all devices
    const devicesSnap = await db.collection("devices").orderBy("lastSeenAt", "desc").limit(200).get();
    const devices = devicesSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        userId: d.userId ?? "",
        deviceName: d.deviceName ?? "Unnamed Device",
        deviceModel: d.deviceModel ?? "Android Handset",
        fcmToken: Boolean(d.fcmToken),
        registeredSimSerial: d.registeredSimSerial ?? "",
        isStolen: Boolean(d.isStolen),
        requestLocate: Boolean(d.requestLocate),
        requestSiren: Boolean(d.requestSiren),
        battery: d.battery ?? (d.lastTelemetry?.battery ?? null),
        lastSeenAt: d.lastSeenAt ?? null,
        lastTelemetry: d.lastTelemetry ?? null
      };
    });

    // 2. Fetch all user profiles
    const usersSnap = await db.collection("users").limit(200).get();
    const users = usersSnap.docs.map((doc) => {
      const u = doc.data();
      return {
        id: doc.id,
        fullName: u.fullName ?? "Trackd User",
        email: u.email ?? "",
        phoneNumber: u.phoneNumber ?? "",
        emergencyContactPhone: u.emergencyContactPhone ?? "",
        createdAt: u.createdAt ?? null
      };
    });

    // 3. Fetch recent telemetry trigger events
    const logsSnap = await db
      .collection("telemetry_logs")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get()
      .catch(() => null);

    const recentLogs = logsSnap
      ? logsSnap.docs.map((doc) => {
          const l = doc.data();
          return {
            id: doc.id,
            deviceId: l.deviceId ?? "",
            userId: l.userId ?? "",
            triggerReason: l.triggerReason ?? "UNKNOWN",
            battery: l.battery ?? null,
            timestamp: l.timestamp ?? null,
            accuracy: l.accuracy ?? null
          };
        })
      : [];

    // Aggregate stats
    const totalInstalls = devices.length;
    const stolenCount = devices.filter((d) => d.isStolen).length;
    const now = Date.now();
    const active24h = devices.filter((d) => {
      if (!d.lastSeenAt) return false;
      const seenTime = new Date(d.lastSeenAt).getTime();
      return now - seenTime < 24 * 60 * 60 * 1000;
    }).length;

    return res.status(200).json({
      success: true,
      adminEmail: email,
      stats: {
        totalDevices: totalInstalls,
        totalUsers: users.length,
        active24h,
        stolenActive: stolenCount,
        totalLogsCaptured: recentLogs.length
      },
      devices,
      users,
      recentLogs
    });
  } catch (error) {
    console.error("admin console stats error", error);
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: `Admin backend error: ${msg}`
    });
  }
}
