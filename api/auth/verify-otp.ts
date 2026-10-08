import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { adminDb } from "../_lib/admin";

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/verify-otp  { phoneNumber, code }
 * Checks the 6-digit code against the stored hash. On success the OTP is
 * consumed (deleted) and a one-time verification session token is returned.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ verified: false, error: "Method not allowed" });
  }

  const { phoneNumber, code } = (req.body ?? {}) as {
    phoneNumber?: unknown;
    code?: unknown;
  };
  if (typeof phoneNumber !== "string" || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ verified: false, error: "phoneNumber and 6-digit code required" });
  }

  try {
    const ref = adminDb().collection("otps").doc(phoneNumber);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(401).json({ verified: false, error: "No active code. Request a new one." });
    }

    const data = snapshot.data() as {
      codeHash?: string;
      expiresAt?: string;
      attempts?: number;
    };

    if (!data.expiresAt || Date.now() > Date.parse(data.expiresAt)) {
      await ref.delete().catch(() => undefined);
      return res.status(410).json({ verified: false, error: "Code expired. Request a new one." });
    }

    if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
      await ref.delete().catch(() => undefined);
      return res.status(429).json({ verified: false, error: "Too many attempts. Request a new code." });
    }

    const candidate = crypto.createHash("sha256").update(code).digest("hex");
    if (candidate !== data.codeHash) {
      await ref.update({ attempts: (data.attempts ?? 0) + 1 }).catch(() => undefined);
      return res.status(401).json({ verified: false, error: "Incorrect code." });
    }

    await ref.delete().catch(() => undefined);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    return res.status(200).json({ verified: true, verificationToken });
  } catch (error) {
    console.error("verify-otp failed", error);
    return res.status(500).json({ verified: false, error: "Verification failed" });
  }
}
