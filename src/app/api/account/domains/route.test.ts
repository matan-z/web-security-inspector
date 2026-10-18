import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/visitor/store", () => ({ readVisitor: vi.fn(), domainView: vi.fn((data) => data) }));
vi.mock("@/lib/visitor/service", () => ({ changeDomain: vi.fn() }));
import { GET, POST } from "./route";
import { createVisitorSession, visitorIdentity } from "@/lib/visitor/auth";
import { readVisitor } from "@/lib/visitor/store";
import { changeDomain } from "@/lib/visitor/service";

function request(body?: unknown, cookie?: string, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/account/domains", {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      Cookie: cookie ?? `wsi_visitor=${createVisitorSession(1)}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "account-test-secret-with-at-least-32-characters");
  vi.stubEnv("GITHUB_CLIENT_ID", "test-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-secret");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("VERCEL", "");
  vi.mocked(readVisitor)
    .mockReset()
    .mockResolvedValue({ data: { domains: [] } } as never);
  vi.mocked(changeDomain)
    .mockReset()
    .mockResolvedValue({ domains: [] } as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("per-user domain endpoints", () => {
  it("reads only the identity from the signed cookie, and never a body userId", async () => {
    const ownId = visitorIdentity(createVisitorSession(1));
    expect((await GET(request())).status).toBe(200);
    expect(readVisitor).toHaveBeenCalledWith(ownId);
    const body = { action: "add", host: "owned.example", userId: "b".repeat(64), authorized: true };
    expect((await POST(request(body))).status).toBe(200);
    expect(changeDomain).toHaveBeenCalledWith(ownId, body);
  });
  it("denies unauthenticated, forged and cross-origin mutations before storage", async () => {
    expect((await GET(request(undefined, ""))).status).toBe(401);
    expect(
      (await POST(request({ action: "remove", host: "owned.example" }, "wsi_visitor=forged")))
        .status,
    ).toBe(401);
    expect(
      (await POST(request({ action: "add" }, undefined, "https://attacker.example"))).status,
    ).toBe(403);
    expect(readVisitor).not.toHaveBeenCalled();
    expect(changeDomain).not.toHaveBeenCalled();
  });
  it("hides storage exceptions and does not cache private domain results", async () => {
    expect((await GET(request())).headers.get("cache-control")).toBe("no-store");
    vi.mocked(readVisitor).mockRejectedValue(new Error("SECRET_STORE_TOKEN"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SECRET_STORE_TOKEN");
  });
});
