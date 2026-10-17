/**
 * __tests__/webhooks/list-query.test.ts
 *
 * Covers WebhookQuery, the paging schema for GET /webhooks.
 *
 * The regression under test: GET /webhooks parsed limit and offset with its
 * own inline schema and then clamped with Math.min(limit, 100), so
 * ?limit=500 silently came back as 100 rows — a caller paging through their
 * webhooks had no way to tell its page was shortened. GET /webhooks/:id
 * /deliveries already rejects an out-of-range limit with a 400 naming the
 * ceiling instead; WebhookQuery gives the list endpoint the same shared,
 * exported schema and the same behaviour, mirrored here the same way
 * deliveries.test.ts covers DeliveryQuery's bounds.
 *
 * config.ts validates required env vars at module load, so those are set
 * before the module graph is imported. db is mocked through the shared fake
 * even though these tests never call a db-touching function — WebhookQuery
 * is plain zod — so importing webhooks.routes.js never risks a real
 * PrismaClient touching PostgreSQL.
 */

import { jest } from "@jest/globals";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const { createFakeDb } = await import("./fake-db.helper.js");
const fake = createFakeDb();

jest.unstable_mockModule("../../db.js", () => ({
  db: fake.db,
  disconnectDb: async (): Promise<void> => undefined,
}));

const { DEFAULT_WEBHOOK_PAGE_SIZE, MAX_WEBHOOK_PAGE_SIZE } =
  await import("../../modules/webhooks/webhooks.service.js");
const { WebhookQuery } = await import("../../modules/webhooks/webhooks.routes.js");

describe("WebhookQuery", () => {
  it("defaults an absent limit and offset", () => {
    expect(WebhookQuery.parse({})).toEqual({
      limit: DEFAULT_WEBHOOK_PAGE_SIZE,
      offset: 0,
    });
  });

  it("coerces the strings Fastify hands over", () => {
    expect(WebhookQuery.parse({ limit: "10", offset: "20" })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it("accepts the ceiling exactly", () => {
    expect(
      WebhookQuery.parse({ limit: String(MAX_WEBHOOK_PAGE_SIZE) }).limit,
    ).toBe(MAX_WEBHOOK_PAGE_SIZE);
  });

  it.each([
    ["above the ceiling", { limit: String(MAX_WEBHOOK_PAGE_SIZE + 1) }],
    ["zero", { limit: "0" }],
    ["negative", { limit: "-1" }],
    ["fractional", { limit: "1.5" }],
    ["not a number", { limit: "all" }],
    ["a negative offset", { offset: "-1" }],
  ])("rejects %s", (_label, query) => {
    // Rejected rather than clamped: a caller paging through their webhooks
    // needs to know its page was shortened, and silently returning 100 for
    // ?limit=500 looks like the list simply ends there — the same reasoning
    // DeliveryQuery's own bounds test gives for the deliveries endpoint.
    expect(WebhookQuery.safeParse(query).success).toBe(false);
  });
});
