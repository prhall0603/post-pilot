import crypto from "node:crypto";

const FALLBACK = "postpilot-dev-encryption-key-change-me";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || FALLBACK;
  // Derive a stable 32-byte key from any input.
  return crypto.createHash("sha256").update(raw).digest();
}

/** AES-256-GCM encryption for stored OAuth tokens. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${enc.toString("base64")}.${tag.toString("base64")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [ivB64, dataB64, tagB64] = payload.split(".");
    if (!ivB64 || !dataB64 || !tagB64) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Timing-safe comparison for session tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---- passwords (scrypt) ----

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${dk.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, dkHex] = stored.split(":");
  if (!saltHex || !dkHex) return false;
  const dk = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return safeEqual(dk.toString("hex"), dkHex);
}