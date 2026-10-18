import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
import { GET, POST, DELETE } from "./route";
import { validSession } from "@/lib/admin/auth";

const password = "test-admin-password-at-least-32-characters";
function request(value: unknown = password, origin = "http://localhost:3000", method = "POST") {
  return new NextRequest("http://localhost:3000/api/admin/session", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify({ password: value }) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", password);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("administrator session endpoint", () => {
  it("shows configuration state without exposing credentials", async () => {
    const response = GET(request(undefined, undefined, "GET"));
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      authenticated: false,
      authConfigured: true,
      storageConfigured: false,
    });
    expect(text).not.toContain(password);
  });
  it("issues a signed HttpOnly cookie after login and clears it on logout", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    const value = response.cookies.get("wsi_admin")?.value;
    expect(validSession(value)).toBe(true);
    expect(DELETE(request(undefined, undefined, "DELETE")).headers.get("set-cookie")).toContain(
      "Max-Age=0",
    );
  });
  it("rejects wrong passwords and cross-origin attempts", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect((await POST(request(password, "https://evil.com"))).status).toBe(403);
  });
  it("marks cookies Secure in the Vercel environment", async () => {
    vi.stubEnv("VERCEL", "1");
    expect((await POST(request())).headers.get("set-cookie")).toContain("Secure");
  });
  it("limits repeated password guesses", async () => {
    let limited = false;
    for (let i = 0; i < 6; i++) {
      if ((await POST(request("wrong"))).status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});
