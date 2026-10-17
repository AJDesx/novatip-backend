/**
 * indexer/persist.ts
 *
 * Persists a decoded TipEvent to PostgreSQL and updates the indexer cursor.
 * Called by the indexer loop after each confirmed event batch.
 */

import type { TipEvent } from "@novatip/sdk";
import { db } from "../db.js";
import { logger } from "../utils/logger.js";

const persistLogger = logger.child({ component: "indexer:persist" });

/**
 * The IndexerCursor table holds exactly one row by design to track the
 * indexer's progress across restarts.
 */
export const INDEXER_CURSOR_ID = 1;

/**
 * Persist a single TipEvent.
 * Uses upsert on txHash so re-runs are idempotent.
 *
 * @param event     - Decoded TipEvent from the SDK event parser
 * @param txHash    - Soroban transaction hash (used as idempotency key)
 */
export async function persistTip(
  event: TipEvent,
  txHash: string,
): Promise<void> {
  // Resolve creator by jarId
  const creator = await db.creator.findUnique({
    where: { jarId: event.jarId },
  });

  if (!creator) {
    // Jar not registered in our DB — skip (expected if the jar belongs to another application)
    persistLogger.info(
      { jarId: event.jarId },
      "Tip received for unregistered jar; skipping (jar may belong to another application)",
    );
    return;
  }

  await db.tip.upsert({
    where: { txHash },
    update: {}, // already persisted — no-op
    create: {
      txHash,
      ledger: event.ledger,
      ledgerAt: new Date(event.timestamp),
      fromAddress: event.from,
      amount: event.amount.toString(),
      message: event.message,
      creatorId: creator.id,
    },
  });
}

/**
 * Update the indexer cursor to the last processed ledger.
 * Uses upsert on the single-row IndexerCursor table (id = 1).
 */
export async function updateCursor(ledger: number): Promise<void> {
  await db.indexerCursor.upsert({
    where: { id: INDEXER_CURSOR_ID },
    update: { lastLedger: ledger },
    create: { id: INDEXER_CURSOR_ID, lastLedger: ledger },
  });
}

/**
 * Read the last processed ledger from the cursor table.
 * Returns 0 if the cursor has never been set.
 */
export async function readCursor(): Promise<number> {
  const cursor = await db.indexerCursor.findUnique({
    where: { id: INDEXER_CURSOR_ID },
  });
  return cursor?.lastLedger ?? 0;
}
