import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("guarded-fetch", () => ({ guardedFetch: vi.fn(), readBodyAsText: vi.fn() }));
import { guardedFetch, readBodyAsText } from "guarded-fetch";
import { inspectTarget, MAX_RESPONSE_BYTES, TIMEOUT_MS } from "./network";

beforeEach(() => {
  vi.mocked(guardedFetch).mockReset();
  vi.mocked(readBodyAsText).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("outbound request boundary", () => {
  it("refuses to connect if TLS certificate verification is disabled", async () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    await expect(
      inspectTarget(new URL("https://example.com/"), ["example.com"]),
    ).rejects.toMatchObject({ code: "TLS_CONFIGURATION_UNSAFE", status: 503 });
    expect(guardedFetch).not.toHaveBeenCalled();
  });
  it("uses exactly one credential-free GET and never follows redirects", async () => {
    vi.mocked(guardedFetch).mockResolvedValue(
      new Response("", { status: 302, headers: { Location: "http://169.254.169.254/metadata" } }),
    );
    vi.mocked(readBodyAsText).mockResolvedValue("");
    const result = await inspectTarget(new URL("https://example.com/"), ["example.com"]);
    expect(guardedFetch).toHaveBeenCalledTimes(1);
    expect(guardedFetch).toHaveBeenCalledWith(
      "https://example.com/",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        followRedirects: false,
        allowedHosts: ["example.com"],
        skipSsrfCheckForAllowedHosts: false,
        timeoutMs: TIMEOUT_MS,
        sanitizeHeaders: true,
        opaqueErrors: true,
      }),
    );
    const options = vi.mocked(guardedFetch).mock.calls[0][1];
    expect(new Headers(options?.headers).has("cookie")).toBe(false);
    expect(new Headers(options?.headers).has("authorization")).toBe(false);
    expect(readBodyAsText).toHaveBeenCalledWith(
      expect.any(Response),
      expect.objectContaining({
        maxResponseBytes: MAX_RESPONSE_BYTES,
        deadlineAt: expect.any(Number),
      }),
    );
    expect(result.redirected).toBe(true);
    expect(result.url).toBe("https://example.com/");
    expect(result.mode).toBe("live");
  });
  it("returns opaque failure rather than leaking upstream details or substituting demo", async () => {
    vi.mocked(guardedFetch).mockRejectedValue(
      new Error("TOP_SECRET: 10.0.0.2 certificate stack trace"),
    );
    await expect(
      inspectTarget(new URL("https://example.com/"), ["example.com"]),
    ).rejects.toMatchObject({ code: "CONNECTION_FAILED", status: 502 });
    try {
      await inspectTarget(new URL("https://example.com/"), ["example.com"]);
    } catch (error) {
      expect(String(error)).not.toContain("TOP_SECRET");
    }
  });
  it("rejects results if body size or deadline enforcement fails", async () => {
    vi.mocked(guardedFetch).mockResolvedValue(new Response(""));
    vi.mocked(readBodyAsText).mockRejectedValue(new Error("too large"));
    await expect(
      inspectTarget(new URL("https://example.com/"), ["example.com"]),
    ).rejects.toMatchObject({ status: 502 });
  });
});
