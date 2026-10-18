// A bounded, secondary process-local limit. Persistent scan quotas live in Blob.
const windows = new Map<string, { start: number; count: number }>();
export function visitorBurst(key: string, maximum = 60, now = Date.now()): boolean {
  for (const [id, entry] of windows) if (now - entry.start >= 60000) windows.delete(id);
  let entry = windows.get(key);
  if (!entry) {
    if (windows.size >= 1000) return false;
    entry = { start: now, count: 0 };
    windows.set(key, entry);
  }
  return ++entry.count <= maximum;
}
