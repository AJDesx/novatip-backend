/**
 * utils/html.test.ts
 *
 * Unit tests for escapeHtml helper (#91).
 */

import { escapeHtml } from "./html.js";

describe("escapeHtml", () => {
  it("escapes angle brackets and quotes", () => {
    const input = `<script>alert("XSS 'attack'")</script>`;
    const output = escapeHtml(input);
    expect(output).toBe(
      "&lt;script&gt;alert(&quot;XSS &#39;attack&#39;&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("Alice & Bob")).toBe("Alice &amp; Bob");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("Hello World 123!")).toBe("Hello World 123!");
    expect(escapeHtml("")).toBe("");
  });

  it("escapes isolated special characters", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
    expect(escapeHtml("&")).toBe("&amp;");
  });
});
