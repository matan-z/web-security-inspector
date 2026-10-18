import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/storage", () => ({ readHostSettings: vi.fn(), writeHostSettings: vi.fn() }));
vi.mock("@/lib/inspection/rate-limit", () => ({ takeRequest: vi.fn(() => true) }));
import { createSession } from "@/lib/admin/auth";
import { readHostSettings, writeHostSettings } from "@/lib/admin/storage";
import { GET, POST } from "./route";

function request(body?: unknown, authenticated = true, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/admin/hosts", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: `wsi_admin=${createSession()}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "admin-test-password-with-at-least-32-characters");
  vi.mocked(readHostSettings)
    .mockReset()
    .mockResolvedValue({ hosts: [], revision: null, updatedAt: null });
  vi.mocked(writeHostSettings)
    .mockReset()
    .mockResolvedValue({ hosts: ["example.com"], revision: "v1", updatedAt: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("browser settings API", () => {
  it("does not disclose or modify hosts without authentication", async () => {
    expect((await GET(request(undefined, false))).status).toBe(401);
    expect(
      (await POST(request({ hosts: ["example.com"], revision: null, authorized: true }, false)))
        .status,
    ).toBe(401);
    expect(readHostSettings).not.toHaveBeenCalled();
    expect(writeHostSettings).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations", async () => {
    expect(
      (await POST(request({ hosts: [], revision: null }, true, "https://evil.com"))).status,
    ).toBe(403);
    expect(writeHostSettings).not.toHaveBeenCalled();
  });
  it("requires permission confirmation for newly added hosts", async () => {
    expect((await POST(request({ hosts: ["example.com"], revision: null }))).status).toBe(403);
    expect(writeHostSettings).not.toHaveBeenCalled();
  });
  it("normalizes URL input and saves only the validated server-side list", async () => {
    const response = await POST(
      request({ hosts: ["https://example.com/path"], revision: null, authorized: true }),
    );
    expect(response.status).toBe(200);
    expect(writeHostSettings).toHaveBeenCalledWith(["example.com"], null);
  });
  it("rejects stale versions and permits removing all domains", async () => {
    vi.mocked(readHostSettings).mockResolvedValue({
      hosts: ["example.com"],
      revision: "v2",
      updatedAt: null,
    });
    expect((await POST(request({ hosts: [], revision: "v1" }))).status).toBe(409);
    expect(writeHostSettings).not.toHaveBeenCalled();
    expect((await POST(request({ hosts: [], revision: "v2" }))).status).toBe(200);
    expect(writeHostSettings).toHaveBeenCalledWith([], "v2");
  });
});
