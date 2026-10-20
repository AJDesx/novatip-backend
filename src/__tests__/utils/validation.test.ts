/**
 * validation.test.ts
 *
 * Tests for shared Zod validators in utils/validation.ts.
 * Focus: httpsUrl — ensures only https: scheme URLs are accepted.
 */

import { httpsUrl } from "../../utils/validation.js";

const avatarUrl = httpsUrl("Avatar URL");

describe("httpsUrl", () => {
  describe("accepts valid https URLs", () => {
    const valid = [
      "https://cdn.example.com/avatar.png",
      "https://api.dicebear.com/7.x/identicon/svg?seed=alice",
      "https://novatip.xyz/images/avatar.jpg",
      "https://images.unsplash.com/photo-123?w=400",
      "HTTPS://cdn.example.com/avatar.png",
    ];

    test.each(valid)("accepts %s", (url) => {
      expect(avatarUrl.safeParse(url).success).toBe(true);
    });
  });

  describe("rejects dangerous schemes", () => {
    const cases = [
      "javascript:alert(1)",
      "javascript:void(0)",
      "javascript://comment%0Aalert(1)",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
      "data:text/html,<h1>hi</h1>",
      "data:application/javascript,alert(1)",
      "file:///etc/passwd",
      "file://localhost/etc/hosts",
      "file:///C:/Windows/System32/config/SAM",
      "http://cdn.example.com/avatar.png",
      "http://api.dicebear.com/7.x/identicon/svg",
      "ftp://example.com/avatar.png",
      "blob:https://example.com/some-id",
      "ws://example.com/socket",
      "wss://example.com/socket",
    ];

    test.each(cases)("rejects %s", (url) => {
      expect(avatarUrl.safeParse(url).success).toBe(false);
    });
  });

  describe("rejects malformed or empty values", () => {
    const cases = [
      "",
      "not-a-url",
      "//cdn.example.com/avatar.png",
      "cdn.example.com/avatar.png",
    ];

    test.each(cases)("rejects %s", (url) => {
      expect(avatarUrl.safeParse(url).success).toBe(false);
    });
  });

  describe("error messages", () => {
    it("reports the field-specific message for an avatar URL", () => {
      const result = avatarUrl.safeParse("http://example.com/img.png");
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.errors.map((error) => error.message);
        expect(messages).toContain("Avatar URL must use the https: scheme.");
      }
    });

    it("reports the field-specific message for a webhook URL", () => {
      const result = httpsUrl("Webhook URL").safeParse(
        "http://example.com/hook",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.errors.map((error) => error.message);
        expect(messages).toContain("Webhook URL must use the https: scheme.");
        expect(messages).not.toContain(
          "Avatar URL must use the https: scheme.",
        );
      }
    });

    it("reports a URL validation message for completely malformed input", () => {
      const result = avatarUrl.safeParse("not-a-url");
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.errors.map((error) => error.message);
        expect(messages).toContain("Must be a valid URL.");
      }
    });
  });
});
