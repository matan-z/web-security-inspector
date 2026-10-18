import { describe, expect, it, vi } from "vitest";
import {
  assertUrlIsSafeToFetch,
  isSafeIpAddress,
  readBodyAsText,
  createGuardedLookup,
} from "guarded-fetch";
import dns from "node:dns";

describe("installed SSRF protection", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "2002:7f00:1::",
  ])("blocks dangerous address %s", (ip) => expect(isSafeIpAddress(ip)).toBe(false));
  it("accepts public addresses", () => {
    expect(isSafeIpAddress("8.8.8.8")).toBe(true);
    expect(isSafeIpAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects loopback and metadata IP literals before connecting", async () => {
    for (const url of ["http://127.0.0.1", "http://169.254.169.254", "http://[::ffff:127.0.0.1]"])
      await expect(assertUrlIsSafeToFetch(url)).rejects.toThrow();
  });
  it("rejects a private IP at connection-time lookup (rebinding defense)", async () => {
    const spy = vi
      .spyOn(dns, "lookup")
      .mockImplementation(((
        _hostname: string,
        _options: unknown,
        callback: (err: Error | null, address: string, family: number) => void,
      ) => callback(null, "127.0.0.1", 4)) as typeof dns.lookup);
    try {
      const lookup = createGuardedLookup();
      await new Promise<void>((resolve, reject) => {
        lookup("example.com", {}, (err) => {
          try {
            expect(err).toBeTruthy();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    } finally {
      spy.mockRestore();
    }
  });
  it("enforces the body byte limit, including multibyte content", async () => {
    await expect(
      readBodyAsText(new Response("a".repeat(1024 * 1024 + 1)), { maxResponseBytes: 1024 * 1024 }),
    ).rejects.toThrow();
    await expect(
      readBodyAsText(new Response("あ".repeat(4)), { maxResponseBytes: 10 }),
    ).rejects.toThrow();
    await expect(readBodyAsText(new Response("valid"), { maxResponseBytes: 5 })).resolves.toBe(
      "valid",
    );
  });
  it("cancels a stalled body at the deadline", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start() {}, cancel });
    await expect(
      readBodyAsText(new Response(stream), { deadlineAt: Date.now() + 20 }),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});
