import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { adminDb } from "../_lib/admin.js";
import { handleCors } from "../_lib/cors.js";

const E164 = /^\+\d{7,15}$/;
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * POST /api/auth/send-otp  { phoneNumber: "+233..." }
 * Generates a 6-digit OTP, stores only its SHA-256 hash in Firestore
 * (otps/{phoneNumber}, 5-minute TTL), and dispatches it via Sailup.io.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { phoneNumber } = (req.body ?? {}) as { phoneNumber?: unknown };
  if (typeof phoneNumber !== "string" || !E164.test(phoneNumber)) {
    return res.status(400).json({ success: false, error: "phoneNumber must be E.164 (+233...)" });
  }

  const apiKey = process.env.SAILUP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "SMS gateway is not configured" });
  }

  try {
    const ref = adminDb().collection("otps").doc(phoneNumber);
    const existing = await ref.get();
    const now = Date.now();
    if (existing.exists) {
      const requestedAt = Date.parse(
        (existing.data()?.requestedAt as string | undefined) ?? ""
      );
      if (Number.isFinite(requestedAt) && now - requestedAt < RESEND_COOLDOWN_MS) {
        return res
          .status(429)
          .json({ success: false, error: "A code was just sent. Wait before retrying." });
      }
    }

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    const sailup = await fetch("https://api.sailup.io/v1/sms/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Trackd",
        to: [phoneNumber],
        body: `Your TRACKD verification code is: ${code}. Valid for 5 minutes.`
      })
    });

    if (!sailup.ok) {
      const detail = await sailup.text().catch(() => "");
      return res.status(502).json({
        success: false,
        error: `SMS gateway error (${sailup.status}): ${detail.slice(0, 200)}`
      });
    }

    let messageId = "unknown";
    try {
      const payload = (await sailup.json()) as { messageId?: string; id?: string };
      messageId = payload.messageId ?? payload.id ?? "unknown";
    } catch {
      /* non-JSON gateway reply — still a success */
    }

    await ref.set({
      codeHash,
      expiresAt: new Date(now + OTP_TTL_MS).toISOString(),
      attempts: 0,
      requestedAt: new Date(now).toISOString()
    });

    return res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error("send-otp failed", error);
    return res.status(500).json({ success: false, error: "Failed to send verification code" });
  }
}
