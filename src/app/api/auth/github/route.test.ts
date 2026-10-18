import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/visitor/auth", async (original) => ({
  ...(await original<typeof import("@/lib/visitor/auth")>()),
  completeOAuth: vi.fn(),
}));
import { POST } from "./route";
import { GET as callback } from "./callback/route";
import {
  completeOAuth,
  createVisitorSession,
  startOAuth,
  visitorIdentity,
} from "@/lib/visitor/auth";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "oauth-route-test-secret-with-32-or-more-characters");
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("APP_ORIGIN", "https://inspector.example");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-token");
  vi.mocked(completeOAuth).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("OAuth routes", () => {
  it("starts login only from the configured origin and sets a bounded secure state cookie", async () => {
    const good = new NextRequest("https://inspector.example/api/auth/github", {
      method: "POST",
      headers: { Origin: "https://inspector.example" },
    });
    const response = POST(good);
    expect(response.status).toBe(200);
    expect((await response.json()).authorizationUrl).toMatch(
      /^https:\/\/github.com\/login\/oauth\/authorize\?/,
    );
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      POST(
        new NextRequest(good.url, { method: "POST", headers: { Origin: "https://evil.example" } }),
      ).status,
    ).toBe(403);
    expect(
      POST(
        new NextRequest("https://evil.example/api/auth/github", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        }),
      ).status,
    ).toBe(403);
  });
  it("sets a visitor cookie only after a matching state and provider exchange", async () => {
    const { url, cookie } = startOAuth();
    vi.mocked(completeOAuth).mockResolvedValue(createVisitorSession(123));
    const request = new NextRequest(
      `https://inspector.example/api/auth/github/callback?code=code&state=${url.searchParams.get("state")}`,
      { headers: { Cookie: `wsi_oauth=${cookie}` } },
    );
    const response = await callback(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://inspector.example/");
    expect(visitorIdentity(response.cookies.get("wsi_visitor")?.value)).toBeTruthy();
    expect(response.cookies.get("wsi_oauth")?.maxAge).toBe(0);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=strict/i);
  });
  it("rejects invalid state and keeps codes, provider errors and return URLs out of redirects", async () => {
    const response = await callback(
      new NextRequest(
        "https://inspector.example/api/auth/github/callback?code=SECRET_CODE&state=wrong&returnTo=https://attacker.example",
      ),
    );
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://inspector.example/?login=failed");
    expect(response.cookies.get("wsi_visitor")).toBeUndefined();
    expect(response.cookies.get("wsi_oauth")?.maxAge).toBe(0);
  });
});
