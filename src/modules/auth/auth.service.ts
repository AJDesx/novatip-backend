/**
 * auth.service.ts
 *
 * Sign-In With Stellar (SIWS) authentication.
 *
 * Flow:
 *   1. Client calls POST /auth/challenge  → receives a one-time nonce
 *   2. Client signs the nonce with their Stellar private key (Ed25519)
 *   3. Client calls POST /auth/verify     → receives a JWT on success
 *
 * Signature verification uses TweetNaCl (Ed25519) — the same curve
 * Stellar keypairs use. The Stellar SDK is only used to decode the walletAddress
 * strkey into its raw public key bytes.
 */

import { Prisma, type Creator } from "@prisma/client";
import nacl from "tweetnacl";
import { createHash, randomBytes } from "crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { setAuthNonce, consumeAuthNonce } from "../../redis.js";
import { db } from "../../db.js";
import { isValidAccountId } from "@novatip/sdk";

/** Maximum attempts to generate an uncollided temporary slug/jarId for new creators. */
export const MAX_CREATOR_CREATE_ATTEMPTS = 5;

// ── Challenge ─────────────────────────────────────────────────────────────────

/**
 * Generate a random nonce and store it in Redis against the wallet address.
 * The nonce expires after 5 minutes (enforced by Redis TTL).
 */
export async function generateChallenge(
  walletAddress: string,
): Promise<string> {
  if (!isValidAccountId(walletAddress)) {
    throw Object.assign(new Error("Invalid Stellar account address."), {
      statusCode: 400,
    });
  }

  const nonce = randomBytes(32).toString("hex");
  await setAuthNonce(walletAddress, nonce);
  return nonce;
}

// ── Verify ────────────────────────────────────────────────────────────────────

/**
 * Claims embedded in a creator session token. Must stay in step with the
 * FastifyJWT payload augmentation in src/types/fastify.d.ts.
 */
export interface SessionClaims {
  sub: string;
  wallet: string;
  slug: string;
}

export interface VerifyResult {
  jwt: string;
  isNewUser: boolean;
}

/**
 * Verify a signed challenge and return a JWT.
 *
 * Nonces are single-use: `consumeAuthNonce` burns the stored challenge
 * immediately upon retrieval before signature verification. Consuming the nonce
 * on any attempt (success or failure) prevents replay attacks, ensuring an
 * attacker cannot intercept and reuse a nonce after a failed attempt. Because
 * any failed verification consumes the challenge, the client must request a new
 * challenge before attempting verification again.
 *
 * @param walletAddress - G... Stellar account address
 * @param signatureHex  - Hex-encoded Ed25519 signature over the nonce bytes
 */
export async function verifyChallenge(
  walletAddress: string,
  signatureHex: string,
  signJwt: (payload: SessionClaims) => string,
): Promise<VerifyResult> {
  if (!isValidAccountId(walletAddress)) {
    throw Object.assign(new Error("Invalid Stellar account address."), {
      statusCode: 400,
    });
  }

  // Retrieve and consume the nonce (single-use: burns the nonce before
  // verification to prevent replay attacks on failed attempts).
  const nonce = await consumeAuthNonce(walletAddress);
  if (!nonce) {
    throw Object.assign(
      new Error("Challenge not found or expired. Request a new challenge."),
      { statusCode: 401 },
    );
  }

  // The public key is derived from walletAddress itself rather than taken from
  // the client, so there is no separate value that could name a different key
  // than the one the signature is checked against.
  const publicKey = StrKey.decodeEd25519PublicKey(walletAddress);

  // Verify Ed25519 signature
  const valid = verifyEd25519(nonce, signatureHex, publicKey);
  if (!valid) {
    throw Object.assign(
      new Error("Signature verification failed. Request a new challenge."),
      { statusCode: 401 },
    );
  }

  // Resolve creator record (wallet address is the identity anchor)
  let creator = await db.creator.findUnique({ where: { walletAddress } });
  const isNewUser = !creator;

  if (!creator) {
    // New user — create a bare record; they'll claim a slug in onboarding.
    // Temporary slug generation can collide, so retry on unique constraint violations up to a bounded limit.
    let created: Creator | null = null;
    for (let attempt = 0; attempt < MAX_CREATOR_CREATE_ATTEMPTS; attempt++) {
      try {
        const idSuffix = randomBytes(4).toString("hex");
        created = await db.creator.create({
          data: {
            walletAddress,
            slug: `user_${idSuffix}`,
            jarId: `@user_${idSuffix}`,
          },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          attempt < MAX_CREATOR_CREATE_ATTEMPTS - 1
        ) {
          continue;
        }
        throw err;
      }
    }

    if (!created) {
      throw new Error("Failed to create creator record.");
    }
    creator = created;
  }

  const token = signJwt({
    sub: creator.id,
    wallet: walletAddress,
    slug: creator.slug,
  });

  return { jwt: token, isNewUser };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify an Ed25519 signature over a UTF-8 nonce string.
 * Returns true only if signature is valid.
 */
/**
 * SEP-53 message prefix. Wallets sign
 * `SHA256("Stellar Signed Message:\n" + message)` rather than the raw bytes,
 * so that a signed message can never be mistaken for a signed transaction.
 */
const SEP53_PREFIX = "Stellar Signed Message:\n";

/** The digest a SEP-53 wallet actually signs for a given message. */
function sep53Digest(message: string): Buffer {
  const encoded = Buffer.concat([
    Buffer.from(SEP53_PREFIX, "utf8"),
    Buffer.from(message, "utf8"),
  ]);
  return createHash("sha256").update(encoded).digest();
}

/**
 * Verify a signature over the challenge nonce.
 *
 * Two payloads are accepted, and both prove the same thing — that the holder
 * of this account's key signed this specific single-use nonce:
 *
 *   1. The SEP-53 digest. This is what Freighter's signMessage and every other
 *      SEP-53 wallet produces, and it is the path the browser actually uses.
 *      Verifying only the raw bytes is why wallet sign-in never worked.
 *   2. The raw nonce bytes, for scripts and tests that sign with a keypair
 *      directly rather than through a wallet.
 */
function verifyEd25519(
  nonce: string,
  signatureHex: string,
  publicKey: Buffer,
): boolean {
  try {
    const signature = Buffer.from(signatureHex, "hex");

    if (publicKey.length !== 32) return false;
    if (signature.length !== 64) return false;

    const key = new Uint8Array(publicKey);
    const sig = new Uint8Array(signature);

    const candidates = [sep53Digest(nonce), Buffer.from(nonce, "utf8")];
    return candidates.some((payload) =>
      nacl.sign.detached.verify(new Uint8Array(payload), sig, key),
    );
  } catch {
    return false;
  }
}
