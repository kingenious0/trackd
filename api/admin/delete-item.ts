import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "../_lib/admin.js";
import { verifyAdminCaller } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";

/**
 * POST /api/admin/delete-item
 * Body: { type: 'device' | 'user', id: string, deleteUserDevices?: boolean }
 * Deletes a registered handset or user profile from the Trackd fleet.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (handleCors(req, res)) return;

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const { authorized } = await verifyAdminCaller(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Administrator privileges required."
      });
    }

    const { type, id, deleteUserDevices } = (req.body ?? {}) as {
      type?: "device" | "user";
      id?: string;
      deleteUserDevices?: boolean;
    };

    if (!type || !id || (type !== "device" && type !== "user")) {
      return res.status(400).json({
        success: false,
        error: "type ('device' | 'user') and id are required"
      });
    }

    const db = adminDb();

    if (type === "device") {
      // 1. Delete device doc
      await db.collection("devices").doc(id).delete();

      // 2. Clean up device's telemetry logs (if any)
      const logsSnap = await db
        .collection("telemetry_logs")
        .where("deviceId", "==", id)
        .limit(100)
        .get();

      if (!logsSnap.empty) {
        const batch = db.batch();
        logsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }

      return res.status(200).json({
        success: true,
        message: `Device ${id} deleted successfully`
      });
    }

    if (type === "user") {
      // 1. Delete user profile
      await db.collection("users").doc(id).delete();

      // 2. If deleteUserDevices is requested, delete user's registered devices
      if (deleteUserDevices) {
        const devicesSnap = await db
          .collection("devices")
          .where("userId", "==", id)
          .get();

        if (!devicesSnap.empty) {
          const batch = db.batch();
          devicesSnap.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
      }

      return res.status(200).json({
        success: true,
        message: `User ${id} deleted successfully`
      });
    }

    return res.status(400).json({ success: false, error: "Invalid type" });
  } catch (error) {
    console.error("delete-item error", error);
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: `Failed to delete item: ${msg}`
    });
  }
}
