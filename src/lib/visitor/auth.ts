import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { readBodyAsText } from "guarded-fetch";
import { InspectionError } from "@/lib/inspection/policy";

export const VISITOR_COOKIE = "wsi_visitor";
export const OAUTH_COOKIE = "wsi_oauth";
export const VISITOR_SESSION_SECONDS = 8 * 60 * 60;
export const CALLBACK_PATH = "/api/auth/github/callback";

function config() {
  const secret = process.env.SESSION_SECRET;
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  try {
    const url = new URL(process.env.APP_ORIGIN ?? "");
    const local = !process.env.VERCEL && url.protocol === "http:" && url.hostname === "localhost";
    if (
      !secret ||
      secret.trim().length < 32 ||
      secret.length > 512 ||
      !clientId ||
      !clientSecret ||
      (!local && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return { secret, clientId, clientSecret, origin: url.origin };
  } catch {
    return null;
  }
}

export const visitorConfigured = () => config() !== null;

export function visitorConfig() {
  const value = config();
  if (!value)
    throw new InspectionError(
      "VISITOR_NOT_CONFIGURED",
      "訪問者向けのログインは準備中です。デモはそのまま利用できます。",
      503,
    );
  return value;
}

export function assertVisitorHost(request: NextRequest) {
  const { origin } = visitorConfig();
  const actual = `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
  if (actual !== origin)
    throw new InspectionError("ORIGIN_REJECTED", "公開アプリの正規URLから操作してください。", 403);
}

function signature(payload: string, purpose: string) {
  const { secret, origin } = visitorConfig();
  return createHmac("sha256", secret)
    .update(`wsi-visitor-v1:${origin}:${purpose}:${payload}`)
    .digest();
}
function pack(data: object, purpose: string) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signature(payload, purpose).toString("base64url")}`;
}
function unpack(token: string | undefined, purpose: string): Record<string, unknown> | null {
  if (!token || token.length > 2048 || !config()) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;
    const actual = Buffer.from(parts[1], "base64url");
    const expected = signature(parts[0], purpose);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
function notExpired(exp: unknown, maximum: number, now: number): boolean {
  return (
    typeof exp === "number" &&
    Number.isSafeInteger(exp) &&
    exp > Math.floor(now / 1000) &&
    exp <= Math.floor(now / 1000) + maximum
  );
}

export function createVisitorSession(githubId: number, now = Date.now()) {
  if (!Number.isSafeInteger(githubId) || githubId <= 0) throw new Error("invalid GitHub identity");
  const userId = createHash("sha256").update(`github:${githubId}`).digest("hex");
  return pack(
    {
      userId,
      exp: Math.floor(now / 1000) + VISITOR_SESSION_SECONDS,
      nonce: randomBytes(16).toString("hex"),
    },
    "session",
  );
}

export function visitorIdentity(token: string | undefined, now = Date.now()): string | null {
  const data = unpack(token, "session");
  return data &&
    typeof data.userId === "string" &&
    /^[a-f0-9]{64}$/.test(data.userId) &&
    typeof data.nonce === "string" &&
    /^[a-f0-9]{32}$/.test(data.nonce) &&
    notExpired(data.exp, VISITOR_SESSION_SECONDS, now)
    ? data.userId
    : null;
}

export function requireVisitor(request: NextRequest): string {
  assertVisitorHost(request);
  const id = visitorIdentity(request.cookies.get(VISITOR_COOKIE)?.value);
  if (!id)
    throw new InspectionError(
      "VISITOR_REQUIRED",
      "GitHubでログインしてから操作してください。",
      401,
    );
  return id;
}

export function startOAuth(now = Date.now()) {
  const { clientId, origin } = visitorConfig();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const cookie = pack({ state, verifier, exp: Math.floor(now / 1000) + 600 }, "oauth");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin + CALLBACK_PATH,
    state,
    scope: "",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url, cookie };
}

export function oauthVerifier(
  cookie: string | undefined,
  state: string | null,
  now = Date.now(),
): string {
  const data = unpack(cookie, "oauth");
  if (
    !data ||
    typeof data.state !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.state) ||
    !state ||
    !/^[a-f0-9]{64}$/.test(state) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(data.state)) ||
    typeof data.verifier !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.verifier) ||
    !notExpired(data.exp, 600, now)
  )
    throw new InspectionError(
      "OAUTH_REJECTED",
      "ログインの確認に失敗しました。もう一度GitHubでログインしてください。",
      400,
    );
  return data.verifier;
}

async function oauthJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const deadlineAt = Date.now() + 5000;
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const text = await readBodyAsText(response, {
    maxResponseBytes: 16384,
    deadlineAt,
    opaqueErrors: true,
  });
  if (!response.ok) throw new Error("OAuth failed");
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("invalid OAuth response");
  return data as Record<string, unknown>;
}

export async function completeOAuth(code: string, verifier: string): Promise<string> {
  const { clientId, clientSecret, origin } = visitorConfig();
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(code)) throw new Error("invalid code");
    const token = await oauthJson("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: origin + CALLBACK_PATH,
        code_verifier: verifier,
      }),
    });
    if (
      typeof token.access_token !== "string" ||
      !/^[A-Za-z0-9_]{1,512}$/.test(token.access_token) ||
      token.token_type !== "bearer" ||
      (token.scope !== undefined && token.scope !== "")
    )
      throw new Error("invalid token");
    const user = await oauthJson("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.access_token}`,
        "User-Agent": "WebSecurityInspector/1.0",
      },
    });
    if (typeof user.id !== "number") throw new Error("invalid identity");
    // No email, profile, access token or refresh token is persisted or returned.
    return createVisitorSession(user.id);
  } catch {
    throw new InspectionError(
      "OAUTH_FAILED",
      "GitHubログインを完了できませんでした。もう一度お試しください。",
      502,
    );
  }
}
