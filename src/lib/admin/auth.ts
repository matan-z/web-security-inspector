import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { InspectionError } from "@/lib/inspection/policy";

export const SESSION_COOKIE = "wsi_admin";
export const SESSION_SECONDS = 8 * 60 * 60;

function password() {
  const value = process.env.ADMIN_PASSWORD;
  return value && value.trim().length >= 32 && value.length <= 512 ? value : null;
}

export function authConfigured() {
  return password() !== null;
}
const digest = (value: string) => createHash("sha256").update(value).digest();

export function verifyPassword(value: unknown) {
  const secret = password();
  return (
    !!secret &&
    typeof value === "string" &&
    value.length <= 512 &&
    timingSafeEqual(digest(value), digest(secret))
  );
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`wsi-admin-v1:${payload}`).digest();
}

export function createSession(now = Date.now()) {
  const secret = password();
  if (!secret)
    throw new InspectionError("ADMIN_NOT_CONFIGURED", "管理者認証の初期設定が必要です。", 503);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      exp: Math.floor(now / 1000) + SESSION_SECONDS,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

export function validSession(token: string | undefined, now = Date.now()): boolean {
  const secret = password();
  if (!secret || !token || token.length > 1024) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
    const [payload, signature] = parts;
    const actual = Buffer.from(signature, "base64url");
    const expected = sign(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const seconds = Math.floor(now / 1000);
    return (
      data.v === 1 &&
      Number.isSafeInteger(data.exp) &&
      data.exp > seconds &&
      data.exp <= seconds + SESSION_SECONDS &&
      typeof data.nonce === "string" &&
      /^[a-f0-9]{32}$/.test(data.nonce)
    );
  } catch {
    return false;
  }
}

export function requireAdmin(request: NextRequest) {
  if (!authConfigured())
    throw new InspectionError(
      "ADMIN_NOT_CONFIGURED",
      "Vercelで管理者認証の初期設定が必要です。デモはログイン不要で利用できます。",
      503,
    );
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
    throw new InspectionError(
      "ADMIN_REQUIRED",
      "管理者ログインが必要です。ログインしてから再実行してください。",
      401,
    );
}
