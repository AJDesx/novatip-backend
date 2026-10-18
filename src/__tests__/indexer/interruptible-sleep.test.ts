/**
 * __tests__/indexer/interruptible-sleep.test.ts
 *
 * Tests for interruptible indexer sleep on shutdown (#81):
 * - stopIndexer remains safe to call when the indexer is not running
 * - A stop request wakes the loop rather than waiting out the sleep
 * - A poll already in progress is still allowed to finish
 */

import { jest } from "@jest/globals";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-at-least-32-chars-long-123456";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const fetchTipEventsMock = jest.fn<() => Promise<any[]>>();
const readCursorMock = jest.fn(async () => 100);
const updateCursorMock = jest.fn(async () => {});

jest.unstable_mockModule("@novatip/sdk", () => ({
  fetchTipEvents: fetchTipEventsMock,
  getNetwork: jest.fn(() => ({ name: "testnet" })),
  networkFromEnv: jest.fn(() => ({ name: "testnet" })),
}));

jest.unstable_mockModule("../../indexer/rpc.js", () => ({
  fetchLatestLedger: jest.fn(async () => 100),
}));

jest.unstable_mockModule("../../indexer/persist.js", () => ({
  readCursor: readCursorMock,
  updateCursor: updateCursorMock,
  persistTip: jest.fn(async () => {}),
}));

jest.unstable_mockModule("../../modules/webhooks/webhooks.service.js", () => ({
  dispatchWebhooks: jest.fn(async () => {}),
}));

jest.unstable_mockModule("../../modules/notifications/email.service.js", () => ({
  sendTipNotification: jest.fn(async () => {}),
}));

jest.unstable_mockModule("../../db.js", () => ({
  db: {},
  disconnectDb: async (): Promise<void> => undefined,
}));

jest.unstable_mockModule("../../redis.js", () => ({
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(async () => undefined),
  cacheInvalidate: jest.fn(async () => undefined),
  disconnectRedis: async (): Promise<void> => undefined,
}));

const { startIndexer, stopIndexer } = await import(
  "../../indexer/indexer.js"
);

describe("interruptible indexer sleep (#81)", () => {
  beforeEach(async () => {
    await stopIndexer();
    fetchTipEventsMock.mockReset();
    readCursorMock.mockReset();
    readCursorMock.mockResolvedValue(100);
    updateCursorMock.mockReset();
  });

  afterEach(async () => {
    await stopIndexer();
  });

  test("stopIndexer is safe to call when the indexer is not running", async () => {
    await expect(stopIndexer()).resolves.toBeUndefined();
  });

  test("a stop request wakes the loop immediately rather than waiting out the sleep", async () => {
    fetchTipEventsMock.mockResolvedValue([]);

    const loopPromise = startIndexer({ pollIntervalMs: 10_000, pollLimit: 200 });

    // Wait until the loop has executed one fetch and entered sleep
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchTipEventsMock).toHaveBeenCalled();

    const startTime = Date.now();
    await stopIndexer();
    const elapsed = Date.now() - startTime;

    // Must resolve almost immediately, well below the 10,000ms sleep interval
    expect(elapsed).toBeLessThan(1_000);
    await expect(loopPromise).resolves.toBeUndefined();
  });

  test("a poll already in progress is allowed to finish before stopping", async () => {
    let resolvePoll: (val: any[]) => void = () => {};
    let pollFinished = false;

    fetchTipEventsMock.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolvePoll = (val: any[]) => {
          pollFinished = true;
          resolve(val);
        };
      });
    });

    const loopPromise = startIndexer({ pollIntervalMs: 5_000, pollLimit: 200 });

    // Wait for the poll to start
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchTipEventsMock).toHaveBeenCalledTimes(1);
    expect(pollFinished).toBe(false);

    // Call stopIndexer while poll is still in progress
    const stopPromise = stopIndexer();

    // The stop promise should not resolve yet because the poll is still running
    let stopResolved = false;
    stopPromise.then(() => {
      stopResolved = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(stopResolved).toBe(false);
    expect(pollFinished).toBe(false);

    // Complete the in-progress poll
    resolvePoll([]);

    // Now both promises must resolve
    await stopPromise;
    await loopPromise;
    expect(pollFinished).toBe(true);
    expect(stopResolved).toBe(true);
  });
});
