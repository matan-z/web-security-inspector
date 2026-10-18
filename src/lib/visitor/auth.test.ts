import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
import {
  completeOAuth,
  createVisitorSession,
  oauthVerifier,
  startOAuth,
  visitorConfigured,
  visitorIdentity,
  VISITOR_SESSION_SECONDS,
} from "./auth";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "visitor-test-secret-with-more-than-32-characters");
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("visitor OAuth and signed identity", () => {
  it("fails closed for missing secrets, unsafe origins, and invalid session inputs", () => {
    expect(visitorConfigured()).toBe(true);
    for (const origin of [
      "",
      "http://public.example",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com?x=1",
    ]) {
      vi.stubEnv("APP_ORIGIN", origin);
      expect(visitorConfigured()).toBe(false);
    }
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("SESSION_SECRET", "short");
    expect(visitorIdentity("forged")).toBe(null);
    expect(() => createVisitorSession(1)).toThrow();
  });
  it("isolates identities, rejects tampering and expiry, and binds sessions to origin and secret", () => {
    const now = Date.now();
    const one = createVisitorSession(1, now),
      two = createVisitorSession(2, now);
    expect(visitorIdentity(one, now)).toBe(createHash("sha256").update("github:1").digest("hex"));
    expect(visitorIdentity(one)).not.toBe(visitorIdentity(two));
    expect(visitorIdentity(`x${one}`)).toBe(null);
    expect(visitorIdentity(one, now + VISITOR_SESSION_SECONDS * 1000)).toBe(null);
    expect(visitorIdentity(undefined)).toBe(null);
    vi.stubEnv("APP_ORIGIN", "https://other.example");
    expect(visitorIdentity(one)).toBe(null);
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("SESSION_SECRET", "rotated-test-secret-with-more-than-32-characters");
    expect(visitorIdentity(one)).toBe(null);
    for (const id of [0, -1, 1.2, NaN]) expect(() => createVisitorSession(id)).toThrow();
  });
  it("uses random state and S256 PKCE, and rejects swapped, missing, expired and wrong-purpose cookies", () => {
    const now = Date.now(),
      started = startOAuth(now);
    const state = started.url.searchParams.get("state");
    const verifier = oauthVerifier(started.cookie, state, now);
    expect(started.url.origin).toBe("https://github.com");
    expect(started.url.searchParams.get("scope")).toBe("");
    expect(started.url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/github/callback",
    );
    expect(started.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(started.url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
    expect(startOAuth().cookie).not.toBe(started.cookie);
    for (const cookie of [undefined, createVisitorSession(1), `x${started.cookie}`])
      expect(() => oauthVerifier(cookie, state)).toThrow();
    expect(() => oauthVerifier(started.cookie, "a".repeat(64))).toThrow();
    expect(() => oauthVerifier(started.cookie, state, now + 600000)).toThrow();
  });
  it("exchanges the code at fixed endpoints and returns no provider token or profile", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "provider_test_token", token_type: "bearer" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 123, email: "private@example.com", name: "Private Profile" }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const session = await completeOAuth("code", "verifier");
    expect(visitorIdentity(session)).toBeTruthy();
    const payload = Buffer.from(session.split(".")[0], "base64url").toString();
    expect(payload).not.toMatch(/private|provider_test_token|Private Profile|email/);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/login/oauth/access_token",
      "https://api.github.com/user",
    ]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(fetch.mock.calls[0][1].body.get("code_verifier")).toBe("verifier");
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer provider_test_token");
  });
  it("hides provider errors and rejects invalid identities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SECRET_PROVIDER_DETAIL")));
    await expect(completeOAuth("code", "verifier")).rejects.toMatchObject({
      code: "OAUTH_FAILED",
      status: 502,
    });
    await expect(completeOAuth("evil?token", "verifier")).rejects.toMatchObject({
      code: "OAUTH_FAILED",
    });
  });
  it("rejects an OAuth app that returns previously granted repository permissions", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "provider_test_token",
          token_type: "bearer",
          scope: "repo",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(completeOAuth("code", "verifier")).rejects.toMatchObject({ code: "OAUTH_FAILED" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
