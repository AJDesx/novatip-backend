import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  parseWebhookEncryptionKey,
} from "../../modules/webhooks/secret-crypto.js";

describe("webhook secret encryption", () => {
  const key = Buffer.alloc(32, 42);

  it("encrypts and decrypts a webhook secret", () => {
    const encrypted = encryptWebhookSecret("receiver-secret", key);

    expect(encrypted).not.toContain("receiver-secret");
    expect(decryptWebhookSecret(encrypted, key)).toBe("receiver-secret");
  });

  it("rejects a tampered authentication tag", () => {
    const parts = encryptWebhookSecret("receiver-secret", key).split(":");
    const tag = parts[3];
    if (!tag) throw new Error("encrypted value has no authentication tag");
    parts[3] = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;

    expect(() => decryptWebhookSecret(parts.join(":"), key)).toThrow();
  });

  it("requires exactly 32 key bytes encoded as hex", () => {
    expect(() => parseWebhookEncryptionKey("short")).toThrow(
      /64 hexadecimal characters/,
    );
  });
});
