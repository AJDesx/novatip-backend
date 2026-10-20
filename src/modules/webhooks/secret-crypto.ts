import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTED_SECRET_PREFIX = "novatip:v1:";

export function parseWebhookEncryptionKey(value: string | undefined): Buffer {
  if (value === undefined || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "WEBHOOK_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)",
    );
  }

  return Buffer.from(value, "hex");
}

export function isEncryptedWebhookSecret(value: string): boolean {
  return value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

export function encryptWebhookSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return [
    ENCRYPTED_SECRET_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptWebhookSecret(value: string, key: Buffer): string {
  const [prefix, version, iv, tag, ciphertext] = value.split(":");
  if (
    prefix !== "novatip" ||
    version !== "v1" ||
    iv === undefined ||
    tag === undefined ||
    ciphertext === undefined
  ) {
    throw new Error("Stored webhook secret is not a supported encrypted value");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
