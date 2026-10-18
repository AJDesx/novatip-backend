import { jest } from "@jest/globals";

const envKeys = [
  "DATABASE_URL",
  "JWT_SECRET",
  "TIP_SPLITTER_CONTRACT_ID",
  "INDEXER_START_LEDGER",
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);

async function loadConfig(): Promise<
  (typeof import("../config.js"))["config"]
> {
  const modules: Array<typeof import("../config.js")> = [];
  await jest.isolateModulesAsync(async () => {
    modules.push(await import("../config.js"));
  });
  return modules[0]!.config;
}

beforeEach(() => {
  process.env["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/test";
  process.env["JWT_SECRET"] = "test-secret-not-used-for-signing";
  process.env["TIP_SPLITTER_CONTRACT_ID"] = `C${"A".repeat(55)}`;
  delete process.env["INDEXER_START_LEDGER"];
});

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("config", () => {
  it("throws when a required environment variable is missing", async () => {
    delete process.env["DATABASE_URL"];

    await expect(loadConfig()).rejects.toThrow(
      "Missing required env var: DATABASE_URL",
    );
  });

  it("loads a present required environment variable", async () => {
    await expect(loadConfig()).resolves.toMatchObject({
      databaseUrl: "postgresql://user:pass@localhost:5432/test",
    });
  });

  it("uses the fallback for a blank integer environment variable", async () => {
    process.env["INDEXER_START_LEDGER"] = " ";

    await expect(loadConfig()).resolves.toMatchObject({
      stellar: { indexerStartLedger: 0 },
    });
  });

  it("names a non-numeric integer environment variable in the error", async () => {
    process.env["INDEXER_START_LEDGER"] = "not-a-number";

    await expect(loadConfig()).rejects.toThrow(
      "Env var INDEXER_START_LEDGER must be an integer",
    );
  });
});
