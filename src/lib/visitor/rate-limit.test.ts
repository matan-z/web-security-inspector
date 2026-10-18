import { describe, expect, it } from "vitest";
import { visitorBurst } from "./rate-limit";

describe("secondary visitor abuse limit", () => {
  it("separates callers, rejects excess attempts, and expires windows", () => {
    for (let i = 0; i < 3; i++) expect(visitorBurst("one", 3, 1000)).toBe(true);
    expect(visitorBurst("one", 3, 1000)).toBe(false);
    expect(visitorBurst("two", 3, 1000)).toBe(true);
    expect(visitorBurst("one", 3, 61000)).toBe(true);
  });
});
