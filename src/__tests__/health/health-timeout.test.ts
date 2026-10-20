import { jest } from "@jest/globals";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const mockQueryRaw = jest.fn(async () => await new Promise<never>(() => {}));

jest.unstable_mockModule("../../db.js", () => ({
  db: { $queryRaw: mockQueryRaw },
}));
jest.unstable_mockModule("../../redis.js", () => ({
  redis: { ping: jest.fn(async () => "PONG") },
}));

const { checkDatabase } =
  await import("../../modules/health/health.service.js");

describe("readiness probe timeout", () => {
  afterEach(() => jest.useRealTimers());

  it("reports a probe that never settles as down after its deadline", async () => {
    jest.useFakeTimers();

    const result = checkDatabase();
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toMatchObject({
      status: "down",
      latencyMs: 2_000,
      error: "probe timed out after 2000ms",
    });
  });
});
