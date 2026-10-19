import Fastify from "fastify";
import { jest } from "@jest/globals";

process.env["DATABASE_URL"] ??= "postgresql://localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-at-least-32-chars-long-123456";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const { healthRoutes } = await import("../../modules/health/health.routes.js");

describe("GET /version", () => {
  test("returns package version, build commit and configured Stellar network", async () => {
    const previousCommit = process.env.BUILD_COMMIT;
    process.env.BUILD_COMMIT = "abc123def456";

    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/version" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      version: expect.any(String),
      commit: "abc123def456",
      network: "testnet",
    });
    expect(JSON.stringify(res.json())).not.toContain("postgresql://");

    if (previousCommit === undefined) {
      delete process.env.BUILD_COMMIT;
    } else {
      process.env.BUILD_COMMIT = previousCommit;
    }

    await app.close();
  });

  test("falls back to a clear placeholder when commit is unavailable", async () => {
    const previousCommit = process.env.BUILD_COMMIT;
    delete process.env.BUILD_COMMIT;

    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/version" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      commit: "unknown",
      network: "testnet",
    });

    if (previousCommit === undefined) {
      delete process.env.BUILD_COMMIT;
    } else {
      process.env.BUILD_COMMIT = previousCommit;
    }

    await app.close();
  });
});
