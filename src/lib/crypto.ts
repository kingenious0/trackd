export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function toUnsignedE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}

/** Derives a 256-bit AES-GCM key from the user's UID via PBKDF2. */
async function deriveKey(uid: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(uid),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("trackd-pin-salt-v1"),
      iterations: 100_000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a 4-digit PIN with AES-GCM, keyed to the user's UID.
 * Returns a base64 string: `<12-byte-iv>.<ciphertext>` (both base64).
 */
export async function encryptPin(pin: string, uid: string): Promise<string> {
  const key = await deriveKey(uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(pin)
  );
  const toB64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)));
  return `${toB64(iv)}.${toB64(ct)}`;
}

/**
 * Decrypts the stored encrypted PIN blob back to the raw 4-digit string.
 * Returns null if decryption fails (wrong UID / corrupted blob).
 */
export async function decryptPin(blob: string, uid: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = blob.split(".");
    if (!ivB64 || !ctB64) return null;
    const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const key = await deriveKey(uid);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      key,
      fromB64(ctB64)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
