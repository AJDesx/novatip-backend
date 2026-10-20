/**
 * __tests__/auth/auth-me-fresh-slug.test.ts
 *
 * Tests for GET /auth/me:
 * - Reads current slug from database by sub rather than relying on stale JWT claims (#124)
 * - Returns 401 when creator no longer exists in database
 * - Claims a slug and asserts /auth/me returns the newly claimed slug using the original token
 */

import { jest } from "@jest/globals";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import jwtPlugin from "@fastify/jwt";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-at-least-32-chars-long-123456";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

interface CreatorRecord {
  id: string;
  walletAddress: string;
  slug: string;
  jarId: string;
  displayName: string | null;
  bio: string | null;
  splits: unknown;
}

let creatorsDb = new Map<string, CreatorRecord>();

const findUniqueMock = jest.fn(
  async (args: { where: { id?: string; walletAddress?: string; slug?: string }; select?: Record<string, boolean> }) => {
    if (args.where.id) {
      const creator = creatorsDb.get(args.where.id);
      if (!creator) return null;
      if (args.select) {
        const out: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(args.select)) {
          if (val) out[key] = creator[key as keyof CreatorRecord];
        }
        return out;
      }
      return creator;
    }
    if (args.where.slug) {
      for (const creator of creatorsDb.values()) {
        if (creator.slug === args.where.slug) return creator;
      }
      return null;
    }
    return null;
  },
);

const updateMock = jest.fn(
  async (args: { where: { id: string }; data: Partial<CreatorRecord> }) => {
    const existing = creatorsDb.get(args.where.id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...args.data };
    creatorsDb.set(args.where.id, updated);
    return updated;
  },
);

jest.unstable_mockModule("../../db.js", () => ({
  db: {
    creator: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
    // The claim below releases the initial slug; hold checks and the
    // release upsert both run against this table.
    releasedSlug: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => null),
    },
  },
  disconnectDb: async (): Promise<void> => undefined,
}));

jest.unstable_mockModule("../../redis.js", () => ({
  consumeAuthNonce: jest.fn(async () => null),
  setAuthNonce: jest.fn(async () => undefined),
  cacheInvalidate: jest.fn(async () => undefined),
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(async () => undefined),
  disconnectRedis: async (): Promise<void> => undefined,
}));

const { authRoutes } = await import("../../modules/auth/auth.routes.js");
const { claimSlug } = await import("../../modules/creator/creator.service.js");

describe("GET /auth/me fresh slug and authentication", () => {
  let app: FastifyInstance;
  const CREATOR_ID = "creator_123";
  const WALLET = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
  const INITIAL_SLUG = "user_initial42";

  beforeEach(async () => {
    creatorsDb = new Map<string, CreatorRecord>();
    creatorsDb.set(CREATOR_ID, {
      id: CREATOR_ID,
      walletAddress: WALLET,
      slug: INITIAL_SLUG,
      jarId: `@${INITIAL_SLUG}`,
      displayName: null,
      bio: null,
      splits: [],
    });

    app = Fastify();
    await app.register(jwtPlugin, {
      secret: "test-secret-at-least-32-chars-long-123456",
    });

    app.decorate(
      "authenticate",
      async function (request: FastifyRequest, reply: FastifyReply) {
        try {
          await request.jwtVerify();
        } catch {
          reply.status(401).send({
            error: {
              code: "UNAUTHORIZED",
              message: "Authentication required.",
            },
          });
        }
      },
    );

    await app.register(authRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  test("returns current slug from database after claiming a new slug using original session token", async () => {
    // Mint token with the placeholder initial slug
    const token = app.jwt.sign({
      sub: CREATOR_ID,
      wallet: WALLET,
      slug: INITIAL_SLUG,
    });

    // Initial check: should return INITIAL_SLUG
    const initialRes = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(initialRes.statusCode).toBe(200);
    expect(initialRes.json()).toEqual({
      user: {
        sub: CREATOR_ID,
        wallet: WALLET,
        slug: INITIAL_SLUG,
      },
    });

    // Creator claims a real slug
    const claimedSlug = "alice_wonder";
    await claimSlug({ creatorId: CREATOR_ID, slug: claimedSlug });

    // Calling /auth/me with the SAME initial token must reflect the newly claimed slug
    const freshRes = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(freshRes.statusCode).toBe(200);
    expect(freshRes.json()).toEqual({
      user: {
        sub: CREATOR_ID,
        wallet: WALLET,
        slug: claimedSlug,
      },
    });
  });

  test("returns 401 when the creator no longer exists in the database", async () => {
    const token = app.jwt.sign({
      sub: "creator_deleted_or_unknown",
      wallet: WALLET,
      slug: "ghost",
    });

    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });
});
