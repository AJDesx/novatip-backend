/**
 * __tests__/health/readiness.test.ts
 *
 * Readiness must aggregate database and Redis health concurrently without
 * exposing connection details to unauthenticated callers.
 */

import { jest } from "@jest/globals";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const queryRawMock = jest.fn<() => Promise<unknown>>();
const redisPingMock = jest.fn<() => Promise<string>>();
const loggerErrorMock = jest.fn();

jest.unstable_mockModule("../../db.js", () => ({
  db: { $queryRaw: queryRawMock },
  disconnectDb: async (): Promise<void> => undefined,
}));

jest.unstable_mockModule("../../redis.js", () => ({
  redis: { ping: redisPingMock },
  disconnectRedis: async (): Promise<void> => undefined,
}));

jest.unstable_mockModule("../../utils/logger.js", () => ({
  logger: {
    child: (): Record<string, unknown> => ({
      error: loggerErrorMock,
    }),
  },
}));

const { getReadiness } = await import("../../modules/health/health.service.js");

describe("getReadiness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryRawMock.mockResolvedValue(undefined);
    redisPingMock.mockResolvedValue("PONG");
  });

  it("reports ok when both dependencies are up", async () => {
    const report = await getReadiness();

    expect(report.status).toBe("ok");
    expect(report.checks.database.status).toBe("up");
    expect(report.checks.redis.status).toBe("up");
    expect(report.checks.database.latencyMs).toEqual(expect.any(Number));
    expect(report.checks.redis.latencyMs).toEqual(expect.any(Number));
  });

  it("reports degraded when one dependency is down without exposing its error", async () => {
    const databaseError = new Error("postgresql://private-host/private-db");
    queryRawMock.mockRejectedValue(databaseError);

    const report = await getReadiness();

    expect(report.status).toBe("degraded");
    expect(report.checks.database).toMatchObject({
      status: "down",
      error: "Dependency probe failed.",
    });
    expect(report.checks.database.latencyMs).toEqual(expect.any(Number));
    expect(report.checks.database.error).not.toContain("private-host");
    expect(report.checks.redis.status).toBe("up");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: databaseError, dependency: "database" },
      "readiness probe failed",
    );
  });

  it("reports degraded when both dependencies are down", async () => {
    queryRawMock.mockRejectedValue(new Error("database unavailable"));
    redisPingMock.mockRejectedValue(new Error("redis unavailable"));

    const report = await getReadiness();

    expect(report.status).toBe("degraded");
    expect(report.checks.database.status).toBe("down");
    expect(report.checks.redis.status).toBe("down");
    expect(loggerErrorMock).toHaveBeenCalledTimes(2);
  });

  it("starts both dependency probes before either one resolves", async () => {
    let resolveDatabase!: (value: unknown) => void;
    let resolveRedis!: (value: string) => void;
    queryRawMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDatabase = resolve;
        }),
    );
    redisPingMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRedis = resolve;
        }),
    );

    const readiness = getReadiness();

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(redisPingMock).toHaveBeenCalledTimes(1);
    resolveDatabase(undefined);
    resolveRedis("PONG");

    await expect(readiness).resolves.toMatchObject({ status: "ok" });
  });
});
