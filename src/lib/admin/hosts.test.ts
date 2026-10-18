import { describe, expect, it } from "vitest";
import { normalizeHosts } from "./hosts";

describe("browser-configured domains", () => {
  it("normalizes URLs and exact hostnames without broadening subdomains", () => {
    expect(normalizeHosts(["Example.com", "https://example.com/path", "www.example.com"])).toEqual([
      "example.com",
      "www.example.com",
    ]);
    expect(normalizeHosts([])).toEqual([]);
  });
  it.each([
    "127.0.0.1",
    "2130706433",
    "http://169.254.169.254",
    "https://[::1]",
    "localhost",
    "test.local",
    "*.example.com",
    "example.com:8443",
    "https://user:pass@example.com",
    "file:///etc/passwd",
    "https://example.com\\@evil.com",
    "example.com,evil.com",
  ])("rejects unsupported target %s", (host) => expect(() => normalizeHosts([host])).toThrow());
  it("rejects excessive host lists and non-string input", () => {
    expect(() => normalizeHosts(Array(11).fill("example.com"))).toThrow();
    expect(() => normalizeHosts([null])).toThrow();
    expect(() => normalizeHosts("example.com")).toThrow();
  });
});
