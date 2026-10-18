import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inspection/network", () => ({ inspectTarget: vi.fn() }));
vi.mock("@/lib/visitor/rate-limit", () => ({ visitorBurst: vi.fn(() => true) }));
vi.mock("@/lib/visitor/dns", async (original) => ({
  ...(await original<typeof import("@/lib/visitor/dns")>()),
  hasDnsProof: vi.fn(),
}));
vi.mock("@/lib/visitor/store", async (original) => ({
  ...(await original<typeof import("@/lib/visitor/store")>()),
  updateVisitor: vi.fn(),
}));
import { POST } from "./route";
import { createVisitorSession, visitorIdentity } from "@/lib/visitor/auth";
import { addDomain, emptyRecord, updateVisitor } from "@/lib/visitor/store";
import { hasDnsProof } from "@/lib/visitor/dns";
import { inspectTarget } from "@/lib/inspection/network";
import { createDemoResult } from "@/lib/inspection/demo";
import { changeDomain } from "@/lib/visitor/service";
import type { VisitorRecord } from "@/lib/visitor/types";

const records = new Map<string, VisitorRecord>();
function request(
  id = 1,
  body: unknown = { url: "https://owned.example/", authorized: true },
  extra: Record<string, string> = {},
) {
  return new NextRequest("http://localhost:3000/api/visitor/inspect", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      Cookie: `wsi_visitor=${createVisitorSession(id)}`,
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
function record(id: number, verified = true) {
  const key = visitorIdentity(createVisitorSession(id))!;
  const data = emptyRecord();
  addDomain(data, "owned.example");
  data.domains[0].verifiedAt = verified ? Date.now() : null;
  records.set(key, data);
  return { key, data };
}
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "visitor-test-secret-with-at-least-32-characters");
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("VERCEL", "");
  records.clear();
  vi.mocked(updateVisitor).mockImplementation(async (id, change) => {
    const data = structuredClone(records.get(id) ?? emptyRecord());
    change(data);
    records.set(id, data);
    return data;
  });
  vi.mocked(inspectTarget)
    .mockReset()
    .mockResolvedValue({ ...createDemoResult(), mode: "live" });
  vi.mocked(hasDnsProof).mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("visitor scan authorization end-to-end boundary", () => {
  it("requires a visitor session and same origin before reading or scanning", async () => {
    expect((await POST(request(1, undefined, { Cookie: "" }))).status).toBe(401);
    expect((await POST(request(1, undefined, { Cookie: "wsi_visitor=forged" }))).status).toBe(401);
    expect((await POST(request(1, undefined, { Origin: "https://attacker.example" }))).status).toBe(
      403,
    );
    expect(inspectTarget).not.toHaveBeenCalled();
    expect(updateVisitor).not.toHaveBeenCalled();
  });
  it("cannot use another user's verified domain, even with a forged body owner/allowlist", async () => {
    record(1);
    const response = await POST(
      request(2, {
        url: "https://owned.example",
        authorized: true,
        userId: visitorIdentity(createVisitorSession(1)),
        hosts: ["owned.example"],
      }),
    );
    expect(response.status).toBe(403);
    expect(hasDnsProof).not.toHaveBeenCalled();
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("denies pending domains, unrelated domains and implicit subdomains without target traffic", async () => {
    record(1, false);
    expect((await POST(request())).status).toBe(403);
    record(1);
    for (const url of [
      "https://other.example",
      "https://sub.owned.example",
      "http://169.254.169.254",
    ]) {
      expect((await POST(request(1, { url, authorized: true }))).status).toBe(403);
    }
    expect(inspectTarget).not.toHaveBeenCalled();
    expect(hasDnsProof).not.toHaveBeenCalled();
  });
  it("rechecks DNS at every scan and un-verifies the domain when its TXT is removed", async () => {
    const { key } = record(1);
    expect((await POST(request())).status).toBe(200);
    expect(inspectTarget).toHaveBeenCalledWith(
      new URL("https://owned.example/"),
      ["owned.example"],
      expect.any(AbortSignal),
    );
    vi.mocked(hasDnsProof).mockResolvedValue(false);
    vi.mocked(inspectTarget).mockClear();
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(inspectTarget).not.toHaveBeenCalled();
    expect(records.get(key)!.domains[0].verifiedAt).toBe(null);
  });
  it("does not allow DNS confirmation to be reused by a second account or after expiry", async () => {
    const first = record(1),
      second = record(2, false);
    vi.mocked(hasDnsProof).mockImplementation(async (d) => d.token === first.data.domains[0].token);
    await changeDomain(second.key, { action: "verify", host: "owned.example" });
    expect(records.get(second.key)!.domains[0].verifiedAt).toBe(null);
    records.get(second.key)!.domains[0].createdAt = Date.now() - 8 * 86400000;
    await expect(
      changeDomain(second.key, { action: "verify", host: "owned.example" }),
    ).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    expect(inspectTarget).not.toHaveBeenCalled();
  });
  it("reserves quota across failed attempts and denies a sixth scan", async () => {
    record(1);
    for (let i = 0; i < 5; i++) expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
    expect(inspectTarget).toHaveBeenCalledTimes(5);
  });
  it("fails closed on missing configuration, DNS and storage failures, and missing consent", async () => {
    record(1);
    expect(
      (await POST(request(1, { url: "https://owned.example", authorized: false }))).status,
    ).toBe(403);
    vi.mocked(hasDnsProof).mockRejectedValue(new Error("SECRET_DNS_DETAIL"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SECRET");
    vi.mocked(updateVisitor).mockRejectedValue(new Error("PRIVATE_STORAGE_TOKEN"));
    expect((await POST(request())).status).toBe(500);
    const unauthenticated = request();
    vi.stubEnv("SESSION_SECRET", "");
    expect((await POST(unauthenticated)).status).toBe(503);
    expect(inspectTarget).not.toHaveBeenCalled();
  });
});
