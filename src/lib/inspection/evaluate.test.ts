import { describe, expect, it } from "vitest";
import { evaluateSnapshot } from "./evaluate";
import { createDemoResult } from "./demo";
import { summarize } from "./types";

const evaluate = (
  headers: Record<string, string> = {},
  options: { cookies?: string[]; url?: string; tls?: "verified" | "unknown" | "failed" } = {},
) =>
  evaluateSnapshot({
    url: options.url ?? "https://example.com/",
    headers: new Headers(headers),
    cookies: options.cookies ?? [],
    tls: options.tls ?? "verified",
    durationMs: 1,
    httpStatus: 200,
  });
const status = (headers: Record<string, string>, id: string) =>
  evaluate(headers).checks.find((c) => c.id === id)?.status;

describe("header value evaluation", () => {
  it("does not accept presence alone or report-only CSP", () => {
    expect(status({ "content-security-policy": "banana" }, "csp")).toBe("warn");
    expect(status({ "content-security-policy-report-only": "default-src 'none'" }, "csp")).toBe(
      "fail",
    );
    expect(status({ "x-content-type-options": "something" }, "nosniff")).toBe("fail");
    expect(status({ "x-content-type-options": "nosniff, invalid" }, "nosniff")).toBe("fail");
  });
  it("accepts a basic restrictive CSP and flags dangerous sources", () => {
    const policy = "default-src 'self'; object-src 'none'; base-uri 'self'";
    expect(status({ "content-security-policy": policy }, "csp")).toBe("pass");
    for (const source of [
      "*",
      "https:",
      "data:",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://*.example.com",
      "'nonsense'",
    ]) {
      expect(status({ "content-security-policy": `${policy}; script-src ${source}` }, "csp")).toBe(
        "warn",
      );
    }
    expect(
      status(
        { "content-security-policy": `${policy}; script-src 'nonce-dGVzdA==' 'unsafe-inline'` },
        "csp",
      ),
    ).toBe("pass");
    expect(status({ "content-security-policy": `${policy}; script-src-elem *` }, "csp")).toBe(
      "warn",
    );
  });
  it.each([
    ["max-age=0", "fail"],
    ["max-age=60", "warn"],
    ["max-age=31536000", "pass"],
    ["max-age=forever", "fail"],
    ['max-age="31536000', "fail"],
    ["max-age=31536000; max-age=0", "fail"],
  ])("evaluates HSTS %s", (value, expected) => {
    expect(status({ "strict-transport-security": value }, "hsts")).toBe(expected);
  });
  it("evaluates CSP framing without default-src inheritance", () => {
    expect(status({ "content-security-policy": "default-src 'none'" }, "framing")).toBe("fail");
    expect(status({ "content-security-policy": "frame-ancestors 'self'" }, "framing")).toBe("pass");
    expect(status({ "x-frame-options": "ALLOW-FROM https://example.com" }, "framing")).toBe("fail");
    expect(
      status(
        { "x-frame-options": "DENY", "content-security-policy": "frame-ancestors *" },
        "framing",
      ),
    ).toBe("warn");
    expect(status({ "x-frame-options": "SAMEORIGIN" }, "framing")).toBe("pass");
  });
  it("uses the last recognized Referrer-Policy and checks feature scope", () => {
    expect(status({ "referrer-policy": "no-referrer, unsafe-url" }, "referrer")).toBe("fail");
    expect(status({ "referrer-policy": "unsafe-url, strict-origin" }, "referrer")).toBe("pass");
    expect(
      status({ "permissions-policy": "camera=*, microphone=(), geolocation=()" }, "permissions"),
    ).toBe("warn");
    expect(
      status({ "permissions-policy": "camera=(), microphone=(), geolocation=()" }, "permissions"),
    ).toBe("pass");
    expect(
      status(
        { "permissions-policy": "camera=(), camera=*, microphone=(), geolocation=()" },
        "permissions",
      ),
    ).toBe("warn");
  });
});

describe("transport and cookies", () => {
  it("distinguishes HTTP, unavailable TLS, and missing cookies", () => {
    const result = evaluate({}, { url: "http://example.com/" });
    expect(result.checks.find((c) => c.id === "https")?.status).toBe("fail");
    expect(result.checks.find((c) => c.id === "tls")?.status).toBe("na");
    expect(
      result.checks.filter((c) => c.category === "cookies").every((c) => c.status === "na"),
    ).toBe(true);
    expect(evaluate({}, { tls: "unknown" }).checks.find((c) => c.id === "tls")?.status).toBe(
      "unknown",
    );
    expect(evaluate({}, { tls: "failed" }).checks.find((c) => c.id === "tls")?.status).toBe("fail");
  });
  it("checks all cookies and never exposes their values", () => {
    const result = evaluate(
      {},
      {
        cookies: [
          "session=SUPER_SECRET; HttpOnly; SameSite=None",
          "other=SECRET_TOO; Secure; HttpOnly; SameSite=Strict",
        ],
      },
    );
    expect(result.checks.find((c) => c.id === "cookie-secure")?.status).toBe("fail");
    expect(result.checks.find((c) => c.id === "cookie-httponly")?.status).toBe("pass");
    expect(result.checks.find((c) => c.id === "cookie-samesite")?.status).toBe("fail");
    expect(JSON.stringify(result)).not.toContain("SUPER_SECRET");
    expect(JSON.stringify(result)).not.toContain("SECRET_TOO");
  });
  it("flags duplicate SameSite and None even with Secure for contextual review", () => {
    for (const cookie of [
      "a=b; Secure; SameSite=Lax; SameSite=None",
      "a=b; Secure; SameSite=None",
    ]) {
      expect(
        evaluate({}, { cookies: [cookie] }).checks.find((c) => c.id === "cookie-samesite")?.status,
      ).toBe("warn");
    }
  });
});

describe("demo and score", () => {
  it("is deterministic, explicitly labeled and contains mixed results", () => {
    const result = createDemoResult();
    expect(result).toEqual(createDemoResult());
    expect(result.mode).toBe("demo");
    expect(result.checks).toHaveLength(11);
    expect(new Set(result.checks.map((c) => c.status))).toEqual(new Set(["pass", "warn", "fail"]));
    expect(result.checks.every((c) => c.meaning && c.risk && c.recommendation)).toBe(true);
  });
  it("excludes not applicable and unknown values from scores", () => {
    const [check] = createDemoResult().checks;
    expect(
      summarize([
        { ...check, status: "unknown" },
        { ...check, status: "na" },
      ]).score,
    ).toBeNull();
    expect(
      summarize([
        { ...check, status: "pass" },
        { ...check, status: "unknown" },
      ]).score,
    ).toBe(100);
  });
});
