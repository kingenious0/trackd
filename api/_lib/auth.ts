import type { VercelRequest } from "@vercel/node";

const DEFAULT_ADMIN_EMAILS = ["kingenious0@gmail.com"];
const GOOGLE_API_KEY =
  process.env.VITE_FIREBASE_API_KEY ||
  "AIzaSyBnD2UOr899fTCHEam8FmT0QyIhYfmn3rg";

export function getAuthorizedAdminEmails(): string[] {
  const extra = (process.env.TRACKD_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...extra]));
}

/**
 * Validates the caller is a genuine signed-in Firebase user with admin privileges.
 * Performs validation via Google Identity Toolkit REST API without importing
 * the heavy `firebase-admin/auth` package which crashes in Vercel serverless bundling.
 */
export async function verifyAdminCaller(
  req: VercelRequest
): Promise<{ authorized: boolean; email?: string }> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { authorized: false };
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return { authorized: false };
  }

  try {
    // 1. Fast decode to check payload email
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      return { authorized: false };
    }
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf8")
    );
    const email = (payload.email ?? "").toLowerCase();
    const authorizedList = getAuthorizedAdminEmails();
    if (!email || !authorizedList.includes(email)) {
      return { authorized: false, email };
    }

    // 2. Cryptographic token verification via Google Identity Toolkit
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );

    if (!verifyRes.ok) {
      return { authorized: false };
    }

    const data = (await verifyRes.json()) as {
      users?: Array<{ email?: string }>;
    };
    const verifiedUser = data.users?.[0];
    const verifiedEmail = (verifiedUser?.email ?? "").toLowerCase();

    if (verifiedEmail && authorizedList.includes(verifiedEmail)) {
      return { authorized: true, email: verifiedEmail };
    }
    return { authorized: false, email: verifiedEmail };
  } catch (err) {
    console.error("Token verification failed", err);
    return { authorized: false };
  }
}
