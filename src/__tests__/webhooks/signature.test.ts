/**
 * __tests__/webhooks/signature.test.ts
 *
 * Pins sign(), the HMAC that every webhook receiver verifies deliveries
 * against. It is a published interface: nothing else in this codebase calls
 * into a receiver's verification code, so a silent change to the algorithm,
 * the encoding or the signed material would only surface as every existing
 * integration rejecting deliveries it used to accept.
 *
 * config.ts validates required env vars at module load, so those are set
 * before the module graph is imported.
 */

import { jest } from "@jest/globals";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

jest.unstable_mockModule("../../db.js", () => ({
  db: {},
  disconnectDb: async (): Promise<void> => undefined,
}));

const { sign } = await import("../../modules/webhooks/webhooks.service.js");

describe("sign", () => {
  it("matches a known HMAC-SHA256 hex digest for a fixed body and secret", () => {
    // Independently computable: `printf '%s' '{"a":1}' | openssl dgst -sha256
    // -hmac 'shh' -hex`. If this ever fails, the algorithm, the encoding or
    // what gets signed has changed underneath every receiver already
    // verifying against it.
    expect(sign('{"a":1}', "shh")).toBe(
      "dfb8cf3fc9778c70386e30f5e0776d37f9ee9c8756d3cbd7df0902150644358d",
    );
  });

  it("produces a different signature for a different secret, same body", () => {
    const body = "same body";

    const a = sign(body, "secret-one");
    const b = sign(body, "secret-two");

    expect(a).not.toBe(b);
  });

  it("produces a different signature for a different body, same secret", () => {
    const secret = "same-secret";

    const a = sign("body-one", secret);
    const b = sign("body-two", secret);

    expect(a).not.toBe(b);
  });

  it("is deterministic: the same body and secret always sign the same", () => {
    expect(sign("stable", "secret")).toBe(sign("stable", "secret"));
  });

  it("outputs a lowercase hex digest the sha256= header format expects", () => {
    // What dispatch and the test ping both send as
    // X-Novatip-Signature: `sha256=${sign(body, secret)}` — asserting the
    // raw shape here, rather than hardcoding the full header elsewhere,
    // keeps this test from drifting if that prefix ever moves.
    const digest = sign("payload", "secret");

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
