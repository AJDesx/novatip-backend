/**
 * indexer/rpc.ts
 *
 * Minimal Soroban RPC helper for the indexer.
 *
 * Only `getLatestLedger` is needed: during quiet periods the event fetch
 * returns nothing, so chain head is the only way to learn how far the indexer
 * has safely scanned. Issued as a plain JSON-RPC call rather than through the
 * SDK so the indexer keeps a single event-shaped dependency on it.
 */

/**
 * Default RPC request timeout in milliseconds.
 * 5 seconds is chosen as the default because it gives a healthy Soroban RPC
 * node ample time to answer a getLatestLedger call during normal operation
 * without stalling indexer idle checks, while being configurable via
 * config.stellar.rpcTimeoutMs (INDEXER_RPC_TIMEOUT_MS) to avoid spurious
 * warnings when polling slower or more distant endpoints.
 */
const DEFAULT_TIMEOUT_MS = 5_000;

function getRpcTimeout(): number {
  const envVal = process.env["INDEXER_RPC_TIMEOUT_MS"];
  if (envVal) {
    const parsed = Number.parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

interface LatestLedgerResponse {
  result?: { sequence?: number };
  error?: { message?: string };
}

/**
 * Fetch the sequence number of the latest closed ledger.
 *
 * @param rpcUrl - Soroban RPC endpoint
 * @param timeoutMs - Request timeout in milliseconds (defaults to configured timeout or 5s)
 * @throws if the endpoint is unreachable, times out, or returns no sequence
 */
export async function fetchLatestLedger(
  rpcUrl: string,
  timeoutMs: number = getRpcTimeout(),
): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!res.ok) {
    throw new Error(`getLatestLedger failed: HTTP ${res.status}`);
  }

  const body = (await res.json()) as LatestLedgerResponse;

  if (body.error) {
    throw new Error(
      `getLatestLedger failed: ${body.error.message ?? "unknown RPC error"}`,
    );
  }

  const sequence = body.result?.sequence;

  if (typeof sequence !== "number" || !Number.isFinite(sequence)) {
    throw new Error("getLatestLedger returned no ledger sequence");
  }

  return sequence;
}
