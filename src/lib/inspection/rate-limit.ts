// Best-effort, bounded, process-local abuse protection. No user data is stored.
// Vercel instances do not share this state; use WAF for a deployment-wide limit.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_CONCURRENT = 2;
let windowStart = 0;
let count = 0;
let active = 0;

export function takeRequest(now = Date.now()): boolean {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  if (count >= MAX_REQUESTS) return false;
  count++;
  return true;
}

export function acquireInspection(): (() => void) | null {
  if (active >= MAX_CONCURRENT) return null;
  active++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active--;
    }
  };
}
