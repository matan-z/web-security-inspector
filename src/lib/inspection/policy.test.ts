import { describe, expect, it } from "vitest";
import { parseAllowedHosts, validateTarget } from "./policy";

describe("deny-by-default host policy", () => {
  it("denies all network targets if the configuration is absent", () => {
    for (const value of [undefined, "", "   "]) {
      expect(parseAllowedHosts(value)).toEqual([]);
      expect(() => validateTarget("https://example.com", parseAllowedHosts(value))).toThrow();
    }
  });
  it("uses exact matching with no implicit subdomain access", () => {
    const hosts = parseAllowedHosts("example.com, www.example.com");
    expect(validateTarget("https://example.com/path", hosts).hostname).toBe("example.com");
    for (const target of [
      "https://evil-example.com",
      "https://sub.example.com",
      "https://example.com.evil.com",
      "https://example.com.",
    ]) {
      expect(() => validateTarget(target, hosts)).toThrow();
    }
  });
  it.each([
    "*.example.com",
    "https://example.com",
    "localhost",
    "127.0.0.1",
    "example.com,",
    "example.local",
    "example.com:443",
  ])("rejects invalid configuration %s", (value) =>
    expect(() => parseAllowedHosts(value)).toThrow(),
  );
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "https://[::1]",
    "http://169.254.169.254",
    "https://example.com?secret=x",
    "https://example.com/#test",
    "https://example.com\\@evil.com",
    "https://example.com\n",
  ])("rejects unsafe or unsupported URL %s", (url) =>
    expect(() => validateTarget(url, ["example.com"])).toThrow(),
  );
});
