/**
 * indexer/backoff.ts
 *
 * Escalating backoff policy for indexer poll errors.
 * Kept as pure functions free of I/O or state so that backoff calculations
 * are deterministic and fully unit-testable.
 */

/**
 * Base backoff delay in milliseconds for the first failure (12 seconds,
 * matching POLL_INTERVAL_MS * 2).
 */
export const BASE_POLL_BACKOFF_MS = 12_000;

/**
 * Documented ceiling for backoff delays in milliseconds (60 seconds / 1 minute).
 * Prevents poll errors during extended RPC outages or rate limits from backing
 * off indefinitely, while bounding retry frequency to avoid log spam and keeping
 * provider rate limits engaged.
 */
export const MAX_POLL_BACKOFF_MS = 60_000;

/**
 * Calculate the backoff sleep duration in milliseconds based on consecutive failures.
 *
 * Escalates exponentially with consecutive failures:
 * - 1 failure:  12,000 ms (12s)
 * - 2 failures: 24,000 ms (24s)
 * - 3 failures: 48,000 ms (48s)
 * - 4+ failures: 60,000 ms (capped at MAX_POLL_BACKOFF_MS)
 *
 * @param consecutiveFailures - Total consecutive poll errors encountered (>= 1)
 * @param baseMs - Base backoff duration (defaults to BASE_POLL_BACKOFF_MS)
 * @param maxMs - Upper backoff ceiling (defaults to MAX_POLL_BACKOFF_MS)
 * @returns Delay in milliseconds to sleep before retrying
 */
export function calculatePollBackoff(
  consecutiveFailures: number,
  baseMs: number = BASE_POLL_BACKOFF_MS,
  maxMs: number = MAX_POLL_BACKOFF_MS,
): number {
  if (consecutiveFailures <= 0) return 0;
  const factor = Math.pow(2, consecutiveFailures - 1);
  const delay = baseMs * factor;
  return Math.min(delay, maxMs);
}
