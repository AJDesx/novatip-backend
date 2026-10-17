/**
 * __tests__/webhooks/config-limits.test.ts
 *
 * Covers:
 * - Configurable delivery limits: WEBHOOK_TIMEOUT_MS, WEBHOOK_MAX_BODY_SIZE, WEBHOOK_MAX_PAYLOAD_SIZE
 * - Delivery does not follow redirects (redirect: "manual"), recording redirects as failed attempts with their status code.
 */

import { jest } from "@jest/globals";
import type { TipEvent } from "@novatip/sdk";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const { createFakeDb } = await import("./fake-db.helper.js");
type Fake = ReturnType<typeof createFakeDb>;

let fake: Fake;

jest.unstable_mockModule("../../db.js", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, property: string) =>
        (fake.db as Record<string, unknown>)[property],
    },
  ),
  disconnectDb: async (): Promise<void> => undefined,
}));

const mockFetch = jest.fn<typeof fetch>();
globalThis.fetch = mockFetch as unknown as typeof fetch;

const { config } = await import("../../config.js");
const { dispatchWebhooks } =
  await import("../../modules/webhooks/webhooks.service.js");

describe("webhook delivery limits and redirect handling", () => {
  beforeEach(() => {
    fake = createFakeDb();
    mockFetch.mockReset();
  });

  const tip: TipEvent = {
    jarId: "@alice",
    from: "GUSER123",
    amount: 10000000n,
    message: "Test tip",
    ledger: 100,
    timestamp: "2026-10-17T12:00:00Z",
    txHash: "0xabcdef1234567890",
  };

  it("defaults timeoutMs to 5000, maxBodySize to 1024, and maxPayloadSize to 2048", () => {
    expect(config.webhooks.timeoutMs).toBe(5_000);
    expect(config.webhooks.maxBodySize).toBe(1_024);
    expect(config.webhooks.maxPayloadSize).toBe(2_048);
  });

  it("does not follow redirects and records a 302 as a failed delivery with its status code", async () => {
    fake.seedCreator({ id: "creator_1", jarId: "@alice" });
    const webhook = fake.seedWebhook({
      creatorId: "creator_1",
      url: "https://redirect.example.com/webhook",
      secret: "test_secret_1234567890",
    });

    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 302,
        statusText: "Found",
        headers: { Location: "http://malicious.example.com/internal" },
      }),
    );

    await dispatchWebhooks(tip);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchInit = mockFetch.mock.calls[0]?.[1];

    // Verifies redirect: "manual" is set
    expect(fetchInit?.redirect).toBe("manual");

    // Verifies timestamp and signature headers were sent
    const headers = fetchInit?.headers as Record<string, string>;
    expect(headers["X-Novatip-Timestamp"]).toBeDefined();
    expect(headers["X-Novatip-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Verifies delivery attempt was recorded as a failure with statusCode 302
    const deliveries = Array.from(fake.deliveries.values()).filter(
      (d) => d.webhookId === webhook.id,
    );
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]?.statusCode).toBe(302);
    expect(deliveries[0]?.success).toBe(false);
  });

  it("truncates response bodies longer than maxBodySize", async () => {
    fake.seedCreator({ id: "creator_1", jarId: "@alice" });
    fake.seedWebhook({
      creatorId: "creator_1",
      url: "https://hooks.example.com/webhook",
      secret: "test_secret_1234567890",
    });

    // Provide a large response body > 1024 bytes
    const largeResponse = "x".repeat(2000);
    mockFetch.mockResolvedValueOnce(
      new Response(largeResponse, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await dispatchWebhooks(tip);

    const deliveries = Array.from(fake.deliveries.values());
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]?.response?.length).toBe(config.webhooks.maxBodySize);
  });
});
