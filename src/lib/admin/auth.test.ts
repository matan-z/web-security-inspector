import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  authConfigured,
  createSession,
  SESSION_SECONDS,
  validSession,
  verifyPassword,
} from "./auth";

const password = "a-test-password-with-more-than-32-characters";
beforeEach(() => vi.stubEnv("ADMIN_PASSWORD", password));
afterEach(() => vi.unstubAllEnvs());

describe("administrator authentication", () => {
  it("requires an explicitly configured password of at least 32 characters", () => {
    for (const value of ["", "short", " ".repeat(32)]) {
      vi.stubEnv("ADMIN_PASSWORD", value);
      expect(authConfigured()).toBe(false);
      expect(verifyPassword(value)).toBe(false);
      expect(() => createSession()).toThrow();
    }
  });
  it("accepts the configured password and rejects other types or values", () => {
    expect(verifyPassword(password)).toBe(true);
    for (const value of ["wrong", null, {}, 123, "a".repeat(513)])
      expect(verifyPassword(value)).toBe(false);
  });
  it("validates signed sessions and rejects forged and expired cookies", () => {
    const now = Date.now();
    const token = createSession(now);
    expect(validSession(token, now)).toBe(true);
    expect(validSession(token, now + SESSION_SECONDS * 1000)).toBe(false);
    expect(validSession(`x${token}`, now)).toBe(false);
    expect(validSession(`${token}.extra`, now)).toBe(false);
    expect(validSession(undefined, now)).toBe(false);
  });
  it("invalidates sessions when the administrator password rotates", () => {
    const token = createSession();
    vi.stubEnv("ADMIN_PASSWORD", "another-new-admin-password-32-characters-minimum");
    expect(validSession(token)).toBe(false);
  });
});
