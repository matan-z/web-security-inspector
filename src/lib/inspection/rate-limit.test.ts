import { expect, it } from "vitest";
import { acquireInspection, takeRequest } from "./rate-limit";

it("limits traffic in a process-wide time window", () => {
  const now = Date.now();
  for (let i = 0; i < 10; i++) expect(takeRequest(now)).toBe(true);
  expect(takeRequest(now)).toBe(false);
  expect(takeRequest(now + 60_000)).toBe(true);
});

it("bounds concurrency and releases slots only once", () => {
  const first = acquireInspection();
  const second = acquireInspection();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(acquireInspection()).toBeNull();
  first?.();
  first?.();
  const third = acquireInspection();
  expect(third).not.toBeNull();
  expect(acquireInspection()).toBeNull();
  second?.();
  third?.();
});
