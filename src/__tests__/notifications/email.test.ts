/**
 * __tests__/notifications/email.test.ts
 *
 * Verifies tip notification emails dispatched via Resend:
 * - Includes both HTML and plain-text alternatives in the send payload.
 * - Confirms both parts carry the same amount, message, and dashboard link.
 * - Confirms the text part is not HTML-escaped.
 */

import { jest } from "@jest/globals";
import type { TipEvent } from "@novatip/sdk";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;
process.env["RESEND_API_KEY"] = "re_test_key";
process.env["APP_BASE_URL"] = "https://app.novatip.xyz";

type SendPayload = {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
};

type CreatorRecord = {
  id: string;
  slug: string;
  displayName?: string | null;
  email?: string | null;
};

const mockSend =
  jest.fn<(payload: SendPayload) => Promise<{ error: null | Error }>>();

jest.unstable_mockModule("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

const mockDb = {
  creator: {
    findUnique: jest.fn<() => Promise<CreatorRecord | null>>(),
  },
  notification: {
    create: jest.fn<() => Promise<unknown>>(),
  },
};

jest.unstable_mockModule("../../db.js", () => ({
  db: mockDb,
  disconnectDb: async (): Promise<void> => undefined,
}));

const { sendTipNotification } =
  await import("../../modules/notifications/email.service.js");

describe("sendTipNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ error: null });
  });

  const tipEvent: TipEvent = {
    jarId: "@alice",
    from: "GUSER123",
    amount: 50000000n, // 5.00 USDC (7 decimals)
    message: "Thanks for the great work & tips <3!",
    ledger: 12345,
    timestamp: "2026-10-17T12:00:00Z",
    txHash: "0x1234567890abcdef",
  };

  it("sends both text and html parts carrying the same amount, message, and dashboard link", async () => {
    mockDb.creator.findUnique.mockResolvedValue({
      id: "creator_1",
      slug: "alice",
      displayName: "Alice",
      email: "alice@example.com",
    });

    await sendTipNotification(tipEvent);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0]?.[0];
    if (!payload) throw new Error("mockSend payload is undefined");

    expect(payload.to).toEqual(["alice@example.com"]);
    expect(payload.subject).toContain("5.00 USDC");

    // Both text and html must be present
    expect(typeof payload.text).toBe("string");
    expect(typeof payload.html).toBe("string");

    // Both carry the same amount
    expect(payload.text).toContain("5.00 USDC");
    expect(payload.html).toContain("5.00 USDC");

    // Both carry the message
    expect(payload.text).toContain('"Thanks for the great work & tips <3!"');
    expect(payload.html).toContain('"Thanks for the great work & tips <3!"');

    // Both carry the dashboard link
    expect(payload.text).toContain("https://app.novatip.xyz/dashboard");
    expect(payload.html).toContain("https://app.novatip.xyz/dashboard");

    // Text part is plain text, not HTML formatted or escaped
    expect(payload.text).not.toContain("<strong>");
    expect(payload.text).not.toContain("<h2>");
    expect(payload.text).toContain("&");
    expect(payload.text).toContain("<3");
  });

  it("handles empty message gracefully in both text and html parts", async () => {
    mockDb.creator.findUnique.mockResolvedValue({
      id: "creator_1",
      slug: "alice",
      displayName: "Alice",
      email: "alice@example.com",
    });

    const tipWithoutMessage: TipEvent = {
      ...tipEvent,
      message: "",
    };

    await sendTipNotification(tipWithoutMessage);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0]?.[0];
    if (!payload) throw new Error("mockSend payload is undefined");

    expect(payload.text).toContain("No message left.");
    expect(payload.html).toContain("No message left.");
  });
});
