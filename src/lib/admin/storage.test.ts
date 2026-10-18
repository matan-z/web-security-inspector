import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  get: vi.fn(),
  put: vi.fn(),
}));
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { readHostSettings, writeHostSettings } from "./storage";

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-token");
  vi.mocked(get).mockReset();
  vi.mocked(put).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("private domain configuration", () => {
  it("fails closed with no storage configuration and never returns environment hosts", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("ALLOWED_HOSTS", "example.com");
    await expect(readHostSettings()).rejects.toMatchObject({ status: 503 });
    expect(get).not.toHaveBeenCalled();
  });
  it("returns an empty policy for a new store", async () => {
    vi.mocked(get).mockResolvedValue(null);
    expect(await readHostSettings()).toEqual({ hosts: [], revision: null, updatedAt: null });
    expect(get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        access: "private",
        useCache: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });
  it("reads canonical bounded configuration", async () => {
    const text = JSON.stringify({
      version: 1,
      hosts: ["example.com"],
      updatedAt: "2026-10-18T00:00:00Z",
    });
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Response(text).body!,
      headers: new Headers(),
      blob: {
        url: "https://store.private.blob.vercel-storage.com/config",
        downloadUrl: "",
        pathname: "config",
        contentDisposition: "",
        cacheControl: "",
        uploadedAt: new Date(),
        etag: "v1",
        contentType: "application/json",
        size: Buffer.byteLength(text),
      },
    });
    expect(await readHostSettings()).toMatchObject({ hosts: ["example.com"], revision: "v1" });
  });
  it("rejects corrupt and noncanonical stored policies", async () => {
    for (const hosts of [["*.example.com"], ["EXAMPLE.com"], ["127.0.0.1"]]) {
      const text = JSON.stringify({ version: 1, hosts, updatedAt: "2026-10-18T00:00:00Z" });
      vi.mocked(get).mockResolvedValue({
        statusCode: 200,
        stream: new Response(text).body!,
        headers: new Headers(),
        blob: {
          url: "",
          downloadUrl: "",
          pathname: "config",
          contentDisposition: "",
          cacheControl: "",
          uploadedAt: new Date(),
          etag: "v1",
          contentType: "application/json",
          size: Buffer.byteLength(text),
        },
      });
      await expect(readHostSettings()).rejects.toMatchObject({
        code: "SETTINGS_UNAVAILABLE",
        status: 503,
      });
    }
  });
  it("hides upstream errors and tokens", async () => {
    vi.mocked(get).mockRejectedValue(new Error("SECRET_STORAGE_TOKEN"));
    await expect(readHostSettings()).rejects.toMatchObject({
      code: "SETTINGS_UNAVAILABLE",
      status: 503,
    });
    try {
      await readHostSettings();
    } catch (error) {
      expect(String(error)).not.toContain("SECRET_STORAGE_TOKEN");
    }
  });
  it("saves private JSON with a conditional overwrite", async () => {
    vi.mocked(put).mockResolvedValue({
      url: "",
      downloadUrl: "",
      pathname: "",
      contentType: "application/json",
      contentDisposition: "",
      etag: "v2",
    });
    expect(await writeHostSettings(["example.com"], "v1")).toMatchObject({
      hosts: ["example.com"],
      revision: "v2",
    });
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: "v1",
      }),
    );
  });
  it("never overwrites an existing setting on first creation or concurrent edits", async () => {
    vi.mocked(put).mockRejectedValue(new BlobPreconditionFailedError());
    await expect(writeHostSettings(["example.com"], null)).rejects.toMatchObject({ status: 409 });
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ allowOverwrite: false }),
    );
  });
});
