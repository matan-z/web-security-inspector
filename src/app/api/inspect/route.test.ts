import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDemoResult } from "@/lib/inspection/demo";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/storage", () => ({ readHostSettings: vi.fn() }));

vi.mock("@/lib/inspection/network", () => ({ inspectTarget: vi.fn() }));
vi.mock("@/lib/inspection/rate-limit", () => ({
  takeRequest: vi.fn(() => true),
  acquireInspection: vi.fn(() => vi.fn()),
}));
import { inspectTarget } from "@/lib/inspection/network";
import { takeRequest } from "@/lib/inspection/rate-limit";
import { POST } from "./route";
import { createSession } from "@/lib/admin/auth";
import { readHostSettings } from "@/lib/admin/storage";

function request(
  body: unknown = { url: "https://example.com/", authorized: true },
  headers: Record<string, string> = {},
) {
  return new NextRequest("http://localhost:3000/api/inspect", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      Cookie: `wsi_admin=${createSession()}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "test-admin-password-with-at-least-32-characters");
  vi.mocked(readHostSettings).mockResolvedValue({
    hosts: ["example.com"],
    revision: "v1",
    updatedAt: null,
  });
  vi.mocked(inspectTarget).mockReset();
  vi.mocked(takeRequest).mockReturnValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("inspection API", () => {
  it("makes no request without configured hosts", async () => {
    vi.mocked(readHostSettings).mockResolvedValue({ hosts: [], revision: null, updatedAt: null });
    expect((await POST(request())).status).toBe(503);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized domain before network access", async () => {
    const response = await POST(
      request({ url: "https://evil.com", authorized: true, hosts: ["evil.com"] }),
    );
    expect(response.status).toBe(403);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("uses the actual Host when Next.js uses a different bind address", async () => {
    vi.mocked(readHostSettings).mockResolvedValue({ hosts: [], revision: null, updatedAt: null });
    const local = new NextRequest("http://0.0.0.0:3000/api/inspect", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        Cookie: `wsi_admin=${createSession()}`,
      },
      body: JSON.stringify({ url: "https://example.com/", authorized: true }),
    });
    expect((await POST(local)).status).toBe(503);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("rejects false ownership confirmations and cross-origin requests", async () => {
    expect((await POST(request({ url: "https://example.com", authorized: false }))).status).toBe(
      403,
    );
    expect((await POST(request(undefined, { Origin: "https://evil.com" }))).status).toBe(403);
    expect((await POST(request(undefined, { Origin: "" }))).status).toBe(403);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("limits request bodies regardless of content-length", async () => {
    expect((await POST(request("a".repeat(5000)))).status).toBe(413);
    expect((await POST(request({}, { "Content-Length": "5000" }))).status).toBe(413);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("handles malformed JSON and content types", async () => {
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request({}, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(request(null))).status).toBe(400);
  });
  it("returns 429 with a retry hint before opening connections", async () => {
    vi.mocked(takeRequest).mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("returns a no-store response for allowed domains", async () => {
    vi.mocked(inspectTarget).mockResolvedValue({ ...createDemoResult(), mode: "live" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(inspectTarget).toHaveBeenCalledWith(
      new URL("https://example.com/"),
      ["example.com"],
      expect.any(AbortSignal),
    );
  });
  it("never exposes unknown server exceptions", async () => {
    vi.mocked(inspectTarget).mockRejectedValue(new Error("DATABASE_PASSWORD=TOP_SECRET"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("TOP_SECRET");
  });
  it("requires an administrator session before reading storage or connecting", async () => {
    vi.mocked(readHostSettings).mockClear();
    const response = await POST(request(undefined, { Cookie: "" }));
    expect(response.status).toBe(401);
    expect(readHostSettings).not.toHaveBeenCalled();
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("fails closed on storage failure, including with legacy ALLOWED_HOSTS", async () => {
    vi.stubEnv("ALLOWED_HOSTS", "example.com");
    vi.mocked(readHostSettings).mockRejectedValue(new Error("storage unavailable"));
    expect((await POST(request())).status).toBe(500);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
});
