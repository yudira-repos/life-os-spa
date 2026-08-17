import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";

// Envelope encryption for provider secrets — today that means Plaid access
// tokens, which are long-lived bearer credentials to somebody's bank data. A
// leaked database dump must not be enough to read them.
//
// Format:  v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
//
// AES-256-GCM (authenticated) so tampering with a stored ciphertext fails
// loudly instead of silently decrypting to garbage. The version prefix is
// there so a future key rotation ("v2:") can be introduced without a
// migration that has to decrypt everything at once.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_VERSION = "v1";

class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "FINANCIAL_ENC_KEY is not set. FinancialOS refuses to store provider " +
        "credentials without it. Generate one with: openssl rand -base64 32"
    );
    this.name = "MissingEncryptionKeyError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.FINANCIAL_ENC_KEY;
  if (!raw) throw new MissingEncryptionKeyError();

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `FINANCIAL_ENC_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

/** True if the module is configured to store provider secrets at all. */
export function encryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    KEY_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted secret envelope");
  }
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== KEY_VERSION) {
    throw new Error(`Unsupported encryption key version: ${version}`);
  }

  const key = loadKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Mask an account number down to the last 4. FinancialOS never persists a full
 * account number — this exists for the manual-entry path, where a user might
 * paste one in, and for defensive display.
 */
export function maskAccountNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** Stable hash used for recommendation input fingerprints and explanation cache keys. */
export function stableHash(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

/** JSON.stringify with sorted keys, so key order never changes a hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
    .join(",");
  return `{${body}}`;
}

/** Constant-time compare for webhook/verification secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
