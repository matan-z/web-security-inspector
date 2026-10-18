import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), cancel: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolveTxt = mocks.resolve;
    cancel = mocks.cancel;
  },
}));
import { domainHost, hasDnsProof, recordValue } from "./dns";

const domain = {
  host: "owned.example",
  token: "a".repeat(64),
  createdAt: Date.now(),
  verifiedAt: null,
};
beforeEach(() => {
  mocks.resolve.mockReset();
  mocks.cancel.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("DNS domain control", () => {
  it("queries only the exact TXT name and matches a complete, possibly split TXT value", async () => {
    mocks.resolve.mockResolvedValue([["wsi-verification=", domain.token]]);
    expect(await hasDnsProof(domain)).toBe(true);
    expect(mocks.resolve).toHaveBeenCalledWith("_wsi.owned.example");
    for (const records of [
      [[recordValue("b".repeat(64))]],
      [[recordValue(domain.token) + "extra"]],
      [["unrelated"]],
      [],
    ]) {
      mocks.resolve.mockResolvedValue(records);
      expect(await hasDnsProof(domain)).toBe(false);
    }
  });
  it("does not treat missing records or resolver failures as verification", async () => {
    for (const code of ["ENODATA", "ENOTFOUND"]) {
      mocks.resolve.mockRejectedValue(Object.assign(new Error("internal"), { code }));
      expect(await hasDnsProof(domain)).toBe(false);
    }
    mocks.resolve.mockRejectedValue(new Error("PRIVATE_DNS_DETAILS"));
    await expect(hasDnsProof(domain)).rejects.toMatchObject({
      code: "DNS_UNAVAILABLE",
      status: 503,
    });
  });
  it("cancels a stalled DNS lookup", async () => {
    vi.useFakeTimers();
    mocks.resolve.mockReturnValue(new Promise(() => {}));
    const result = expect(hasDnsProof(domain)).rejects.toMatchObject({ code: "DNS_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });
  it("rejects IPs, internal hosts, wildcards, credentials and invalid proof tokens before DNS", async () => {
    for (const host of [
      "127.0.0.1",
      "localhost",
      "test.local",
      "*.example.com",
      "https://user:pass@example.com",
    ])
      expect(() => domainHost(host)).toThrow();
    await expect(hasDnsProof({ ...domain, token: "bad" })).rejects.toThrow();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
