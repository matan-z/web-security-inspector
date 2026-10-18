import { evaluateSnapshot } from "./evaluate";

/** Local, deterministic fixture. Importing or using this never makes a request. */
export function createDemoResult() {
  return evaluateSnapshot({
    mode: "demo",
    url: "https://demo.example.com/",
    inspectedAt: "2026-10-01T03:00:00.000Z",
    durationMs: 248,
    httpStatus: 200,
    tls: "verified",
    headers: new Headers({
      "content-security-policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
    }),
    cookies: [
      "session=DEMO_VALUE; Path=/; HttpOnly; SameSite=Lax",
      "preferences=DEMO_VALUE; Path=/; Secure; SameSite=Lax",
    ],
  });
}
