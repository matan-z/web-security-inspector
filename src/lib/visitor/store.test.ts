import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  get: vi.fn(),
  put: vi.fn(),
}));
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import {
  addDomain,
  consumeQuota,
  domainView,
  emptyRecord,
  readVisitor,
  updateVisitor,
} from "./store";
import { MAX_DAILY_SCANS, WINDOW_MS, type VisitorRecord } from "./types";
const id = "a".repeat(64);

function response(data: unknown, etag = "v1") {
  const text = JSON.stringify(data);
  return {
    statusCode: 200,
    stream: new Response(text).body!,
    headers: new Headers(),
    blob: {
      size: Buffer.byteLength(text),
      etag,
      url: "https://test.private.blob.vercel-storage.com/test",
      downloadUrl: "",
      pathname: "test",
      contentDisposition: "",
      cacheControl: "",
      uploadedAt: new Date(),
      contentType: "application/json",
    },
  } as Awaited<ReturnType<typeof get>>;
}
beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-token");
  vi.mocked(get).mockReset().mockResolvedValue(null);
  vi.mocked(put)
    .mockReset()
    .mockResolvedValue({ etag: "v2" } as Awaited<ReturnType<typeof put>>);
});
afterEach(() => vi.unstubAllEnvs());

describe("isolated domain storage and distributed quotas", () => {
  it("uses user-derived paths, private reads, fresh configuration, and no profile information", async () => {
    await updateVisitor(id, (data) => {
      consumeQuota(data, false);
      addDomain(data, "owned.example");
    });
    expect(get).toHaveBeenCalledWith(
      `web-security-inspector/visitors-v1/${id}.json`,
      expect.objectContaining({ access: "private", useCache: false }),
    );
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ access: "private", addRandomSuffix: false, allowOverwrite: false }),
    );
    await readVisitor("b".repeat(64));
    expect(vi.mocked(get).mock.calls[1][0]).not.toBe(vi.mocked(get).mock.calls[0][0]);
    await expect(readVisitor("../admin")).rejects.toThrow();
  });
  it("counts every reserved scan and preserves the daily quota across windows", () => {
    const now = Date.now(),
      data = emptyRecord(now);
    for (let i = 0; i < 5; i++) consumeQuota(data, true, now);
    expect(() => consumeQuota(data, true, now)).toThrow();
    consumeQuota(data, true, now + WINDOW_MS);
    expect(data.quota.dailyScans).toBe(6);
    data.quota.dailyScans = MAX_DAILY_SCANS;
    expect(() => consumeQuota(data, true, now + WINDOW_MS)).toThrow();
    consumeQuota(data, true, now + 24 * 60 * 60 * 1000);
    expect(data.quota.dailyScans).toBe(1);
  });
  it("limits domain mutations and allocates different proof tokens to different users", () => {
    const first = emptyRecord(),
      second = emptyRecord();
    addDomain(first, "owned.example");
    addDomain(second, "owned.example");
    expect(first.domains[0].token).not.toBe(second.domains[0].token);
    addDomain(first, "two.example");
    addDomain(first, "three.example");
    expect(() => addDomain(first, "four.example")).toThrow();
    expect(domainView(first).domains[0].recordName).toBe("_wsi.owned.example");
    for (let i = 0; i < 20; i++) consumeQuota(first, false);
    expect(() => consumeQuota(first, false)).toThrow();
  });
  it("retries with the latest ETag so a concurrent reservation cannot exceed quota", async () => {
    const before = emptyRecord(),
      after = emptyRecord();
    before.quota.scans = 4;
    after.quota.scans = 5;
    vi.mocked(get)
      .mockResolvedValueOnce(response(before, "v1"))
      .mockResolvedValueOnce(response(after, "v2"));
    vi.mocked(put).mockRejectedValueOnce(new BlobPreconditionFailedError());
    await expect(updateVisitor(id, (data) => consumeQuota(data, true))).rejects.toMatchObject({
      status: 429,
    });
    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ ifMatch: "v1" }),
    );
  });
  it("fails closed after conflicts or storage errors", async () => {
    vi.mocked(put).mockRejectedValue(new BlobPreconditionFailedError());
    await expect(updateVisitor(id, (data) => consumeQuota(data, true))).rejects.toMatchObject({
      status: 409,
    });
    expect(put).toHaveBeenCalledTimes(3);
    vi.mocked(get).mockRejectedValue(new Error("SECRET_TOKEN"));
    await expect(readVisitor(id)).rejects.toMatchObject({
      code: "ACCOUNT_UNAVAILABLE",
      status: 503,
    });
  });
  it("rejects corrupt records and rejects a token/host modified outside the application", async () => {
    const values: unknown[] = [
      { version: 1 },
      {
        ...emptyRecord(),
        domains: [{ host: "*.example.com", token: "a".repeat(64), createdAt: 1, verifiedAt: null }],
      },
    ];
    const duplicate: VisitorRecord = emptyRecord();
    addDomain(duplicate, "owned.example");
    duplicate.domains.push({ ...duplicate.domains[0] });
    values.push(duplicate);
    for (const data of values) {
      vi.mocked(get).mockResolvedValue(response(data));
      await expect(readVisitor(id)).rejects.toMatchObject({ status: 503 });
    }
  });
});
