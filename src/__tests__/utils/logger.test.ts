import pino from "pino";

process.env["DATABASE_URL"] ??= "postgresql://user:pass@localhost:5432/test";
process.env["JWT_SECRET"] ??= "test-secret-not-used-for-signing";
process.env["TIP_SPLITTER_CONTRACT_ID"] ??= `C${"A".repeat(55)}`;

const { buildLoggerOptions } = await import("../../utils/logger.js");

describe("logger redaction", () => {
  it("omits authorization and cookie values from log output", () => {
    let output = "";
    const logger = pino(buildLoggerOptions(true), {
      write: (line: string) => {
        output += line;
      },
    });

    logger.error({
      req: {
        headers: { authorization: "Bearer req-token", cookie: "req-session" },
      },
      request: {
        headers: {
          authorization: "Bearer request-token",
          cookie: "request-session",
        },
      },
      headers: {
        authorization: "Bearer direct-token",
        cookie: "direct-session",
      },
    });

    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("req-token");
    expect(output).not.toContain("req-session");
    expect(output).not.toContain("request-token");
    expect(output).not.toContain("request-session");
    expect(output).not.toContain("direct-token");
    expect(output).not.toContain("direct-session");
  });
});
