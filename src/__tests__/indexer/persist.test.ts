/**
 * __tests__/indexer/persist.test.ts
 *
 * Covers:
 * - Unregistered jar skipping with log line (#83)
 * - Named constant INDEXER_CURSOR_ID for single-row cursor table (#84)
 */

import { jest } from "@jest/globals";
import type { TipEvent } from "@novatip/sdk";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const findUniqueCreatorMock =
  jest.fn<
    (args: { where: { jarId: string } }) => Promise<{ id: string } | null>
  >();
const upsertTipMock =
  jest.fn<
    (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  >();
const upsertCursorMock =
  jest.fn<
    (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  >();
const findUniqueCursorMock =
  jest.fn<
    (args: {
      where: { id: number };
    }) => Promise<{ id: number; lastLedger: number } | null>
  >();

const loggerInfoMock = jest.fn();

jest.unstable_mockModule("../../db.js", () => ({
  db: {
    creator: { findUnique: findUniqueCreatorMock },
    tip: { upsert: upsertTipMock },
    indexerCursor: {
      upsert: upsertCursorMock,
      findUnique: findUniqueCursorMock,
    },
  },
  disconnectDb: async (): Promise<void> => undefined,
}));

jest.unstable_mockModule("../../utils/logger.js", () => ({
  logger: {
    child: (): Record<string, unknown> => ({
      info: loggerInfoMock,
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const { persistTip, updateCursor, readCursor, INDEXER_CURSOR_ID } =
  await import("../../indexer/persist.js");

describe("indexer persist (#83 logging unregistered jars & #84 named cursor id)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleEvent: TipEvent = {
    txHash: "0xdeadbeef",
    ledger: 100,
    timestamp: "2023-11-14T22:13:20.000Z",
    jarId: "@unknown_jar",
    from: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    amount: BigInt(5000000),
    message: "great work!",
  };

  it("exports named constant INDEXER_CURSOR_ID as 1 (#84)", () => {
    expect(INDEXER_CURSOR_ID).toBe(1);
  });

  it("uses INDEXER_CURSOR_ID in updateCursor (#84)", async () => {
    await updateCursor(500);

    expect(upsertCursorMock).toHaveBeenCalledWith({
      where: { id: INDEXER_CURSOR_ID },
      update: { lastLedger: 500 },
      create: { id: INDEXER_CURSOR_ID, lastLedger: 500 },
    });
  });

  it("uses INDEXER_CURSOR_ID in readCursor (#84)", async () => {
    findUniqueCursorMock.mockResolvedValue({
      id: INDEXER_CURSOR_ID,
      lastLedger: 450,
    });

    const ledger = await readCursor();

    expect(ledger).toBe(450);
    expect(findUniqueCursorMock).toHaveBeenCalledWith({
      where: { id: INDEXER_CURSOR_ID },
    });
  });

  it("logs at info level and skips silently when jarId is unregistered (#83)", async () => {
    findUniqueCreatorMock.mockResolvedValue(null);

    await persistTip(sampleEvent, "0xdeadbeef");

    expect(findUniqueCreatorMock).toHaveBeenCalledWith({
      where: { jarId: sampleEvent.jarId },
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { jarId: sampleEvent.jarId },
      expect.stringContaining("unregistered jar"),
    );
    expect(upsertTipMock).not.toHaveBeenCalled();
  });

  it("persists tip when creator is found for jarId", async () => {
    findUniqueCreatorMock.mockResolvedValue({ id: "creator_valid" });

    await persistTip(sampleEvent, "0xfeedbeef");

    expect(findUniqueCreatorMock).toHaveBeenCalledWith({
      where: { jarId: sampleEvent.jarId },
    });
    expect(loggerInfoMock).not.toHaveBeenCalled();
    expect(upsertTipMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txHash: "0xfeedbeef" },
        create: expect.objectContaining({
          creatorId: "creator_valid",
          txHash: "0xfeedbeef",
          fromAddress: sampleEvent.from,
        }),
      }),
    );
  });
});
