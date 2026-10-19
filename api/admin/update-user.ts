import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "../_lib/admin.js";
import { verifyAdminCaller } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (handleCors(req, res)) return;

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const { authorized } = await verifyAdminCaller(req);
    if (!authorized) {
      return res.status(403).json({ success: false, error: "Access denied. Administrator privileges required." });
    }

  const { targetUserId, updates } = (req.body ?? {}) as {
    targetUserId?: string;
    updates?: { emergencyContactPhone?: string; fullName?: string };
  };

  if (!targetUserId || typeof targetUserId !== "string") {
    return res.status(400).json({ success: false, error: "targetUserId is required" });
  }

  try {
    const db = adminDb();
    const cleanUpdates: Record<string, string> = {};
    if (updates?.emergencyContactPhone) {
      cleanUpdates.emergencyContactPhone = updates.emergencyContactPhone.trim();
    }
    if (updates?.fullName) {
      cleanUpdates.fullName = updates.fullName.trim();
    }

    if (Object.keys(cleanUpdates).length > 0) {
      await db.collection("users").doc(targetUserId).update(cleanUpdates);
    }

    return res.status(200).json({ success: true, message: "User account updated successfully" });
  } catch (error) {
    console.error("update user failed", error);
    return res.status(500).json({ success: false, error: "Failed to update user record" });
  }
}
