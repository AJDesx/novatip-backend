/**
 * config.ts
 *
 * Centralised, validated environment config for novatip-backend.
 * Fails fast at startup if any required variable is missing.
 */

function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * Read an integer setting, failing fast on a non-numeric value rather than
 * letting NaN reach the code that uses it — a typo'd retention window would
 * otherwise produce an invalid cutoff date and a prune that quietly does
 * nothing (or throws deep inside the scheduler, hours after boot).
 */
function optionalInt(key: string, fallback: number, min?: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Env var ${key} must be an integer, got "${raw}"`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`Env var ${key} must be >= ${min}, got ${parsed}`);
  }
  return parsed;
}

const STELLAR_NETWORKS = ["testnet", "mainnet", "local"] as const;
type StellarNetwork = (typeof STELLAR_NETWORKS)[number];

function isStellarNetwork(value: string): value is StellarNetwork {
  return (STELLAR_NETWORKS as readonly string[]).includes(value);
}

// Minimum JWT secret length: short enough to type by hand, long enough that
// brute-forcing it is infeasible. A 256-bit (32-byte) secret is the usual
// floor for HMAC signing keys; anything shorter signs real sessions with a
// guessable key.
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Read a comma-separated list setting, trimming each entry and dropping
 * empty ones (a trailing comma or stray whitespace shouldn't produce a ""
 * entry that then never matches a real origin).
 */
function optionalList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

const appBaseUrl = optional("APP_BASE_URL", "http://localhost:3000");

const jwtSecretValue = require("JWT_SECRET");
if (jwtSecretValue.length < MIN_JWT_SECRET_LENGTH) {
  throw new Error(
    `Env var JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters ` +
      `(a short secret is brute-forceable), got ${jwtSecretValue.length}`,
  );
}

const stellarNetwork = optional("STELLAR_NETWORK", "testnet");
if (!isStellarNetwork(stellarNetwork)) {
  throw new Error(
    `Env var STELLAR_NETWORK must be one of ${STELLAR_NETWORKS.join(", ")}, got "${stellarNetwork}"`,
  );
}

export const config = {
  port: parseInt(optional("PORT", "3001"), 10),
  host: optional("HOST", "0.0.0.0"),
  nodeEnv: optional("NODE_ENV", "development"),

  databaseUrl: require("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),

  jwtSecret: jwtSecretValue,

  stellar: {
    network: stellarNetwork,
    rpcUrl: optional("SOROBAN_RPC_URL", "https://soroban-testnet.stellar.org"),
    horizonUrl: optional("HORIZON_URL", "https://horizon-testnet.stellar.org"),
    passphrase: optional(
      "NETWORK_PASSPHRASE",
      "Test SDF Network ; September 2015",
    ),
    tipSplitterContractId: require("TIP_SPLITTER_CONTRACT_ID"),
    // Defaulting this on mainnet would silently point at an asset that
    // doesn't exist there (the fallback below is the *testnet* USDC SAC), so
    // mainnet must set it explicitly; testnet/local keep the convenience
    // default (issue #71).
    usdcContractId:
      stellarNetwork === "mainnet"
        ? require("USDC_CONTRACT_ID")
        : optional(
            "USDC_CONTRACT_ID",
            "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
          ),
    indexerStartLedger: optionalInt("INDEXER_START_LEDGER", 0, 0),
  },

  webhooks: {
    /**
     * How long (in ms) to wait for an endpoint to answer before timing out
     * and recording a failed delivery. Defaults to 5,000 ms (5s), giving external
     * endpoints reasonable time to respond without tying up indexer dispatch
     * workers or socket pools indefinitely.
     */
    timeoutMs: optionalInt(
      "WEBHOOK_TIMEOUT_MS",
      optionalInt("TIMEOUT_MS", 5_000),
    ),

    /**
     * Maximum response body bytes captured and stored in delivery attempt logs.
     * Defaults to 1,024 bytes (1 KB), keeping enough diagnostics for debugging
     * failures without letting misbehaved endpoints return megabytes of junk to
     * bloat the database.
     */
    maxBodySize: optionalInt(
      "WEBHOOK_MAX_BODY_SIZE",
      optionalInt("MAX_BODY_SIZE", 1_024),
    ),

    /**
     * Maximum stored delivery payload size in bytes.
     * Defaults to 2,048 bytes (2 KB), which easily accommodates standard tip payloads
     * while trimming oversized variable fields (e.g. long messages) to prevent
     * historical delivery logs from ballooning storage.
     */
    maxPayloadSize: optionalInt(
      "WEBHOOK_MAX_PAYLOAD_SIZE",
      optionalInt("MAX_PAYLOAD_SIZE", 2_048),
    ),

    /**
     * Most webhooks one creator may register. Every enabled endpoint is
     * delivered to on every indexed tip, each with its own timeout and its own
     * delivery row, so this bounds how much outbound work a single tip can
     * cause. Set to 0 to remove the cap.
     */
    maxPerCreator: optionalInt("MAX_WEBHOOKS_PER_CREATOR", 5),

    /**
     * Delivery-log retention. Every attempt writes a WebhookDelivery row
     * carrying the payload and up to 1 KB of response body, one per tip per
     * enabled webhook — left alone this becomes the largest table in the
     * database. Set either window to 0 to keep that class forever.
     */
    retention: {
      /** Successful deliveries are the bulk of the rows and the least useful. */
      successDays: optionalInt("WEBHOOK_DELIVERY_RETENTION_DAYS", 30),
      /** Failures are kept longer — they are what anyone actually debugs. */
      failureDays: optionalInt("WEBHOOK_DELIVERY_FAILURE_RETENTION_DAYS", 90),
      /** Rows deleted per statement, so a large backlog never locks the table. */
      batchSize: optionalInt("WEBHOOK_DELIVERY_PRUNE_BATCH_SIZE", 500),
      /** How often the pruner wakes up. */
      intervalMinutes: optionalInt(
        "WEBHOOK_DELIVERY_PRUNE_INTERVAL_MINUTES",
        60,
      ),
    },
  },

  resend: {
    apiKey: optional("RESEND_API_KEY", ""),
    from: optional("EMAIL_FROM", "tips@novatip.xyz"),
  },

  rateLimits: {
    /**
     * The server-wide budget every route not covered by a dedicated limiter
     * shares, enforced in server.ts. 100 req/min is a reasonable guess and
     * the wrong number for both a load test and a busy creator page polling
     * for new tips — RATE_LIMIT_MAX and RATE_LIMIT_WINDOW let an operator
     * tune it per deployment instead of editing the code.
     */
    global: {
      max: optionalInt("RATE_LIMIT_MAX", 100),
      /** @fastify/rate-limit's own format, e.g. "1 minute" or a ms count. */
      window: optional("RATE_LIMIT_WINDOW", "1 minute"),
    },

    /**
     * Per-IP cap on POST /auth/challenge. That route is unauthenticated by
     * nature, so under the shared global budget (100 req/min) a single
     * caller could exhaust the allowance minting nonces for arbitrary wallet
     * addresses, filling Redis with short-lived keys and starving legitimate
     * auth traffic — this is the dedicated, much tighter limit instead.
     */
    authChallenge: optionalInt("AUTH_CHALLENGE_RATE_LIMIT", 5),

    /**
     * Per-IP cap on the QR endpoints. QR generation is CPU-heavy (512px PNG
     * rasterisation) and public, so the shared global budget is far too
     * permissive — a single client could exhaust it with QR requests alone.
     */
    qr: optionalInt("QR_RATE_LIMIT", 10),
  },

  appBaseUrl,

  /**
   * Origins allowed through CORS in production. The web client deploys to a
   * platform that gives every preview build its own hostname, so a single
   * fixed origin can't cover them; set CORS_ALLOWED_ORIGINS to a
   * comma-separated list to allow more than one. Defaults to just
   * appBaseUrl so an unconfigured deployment keeps today's behaviour.
   */
  corsAllowedOrigins: optionalList("CORS_ALLOWED_ORIGINS", [appBaseUrl]),
} as const;
