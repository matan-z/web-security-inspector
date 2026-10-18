import { NextRequest } from "next/server";
import {
  authConfigured,
  createSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  validSession,
  verifyPassword,
} from "@/lib/admin/auth";
import { storageConfigured } from "@/lib/admin/storage";
import { InspectionError } from "@/lib/inspection/policy";
import { assertSameOrigin, errorResponse, jsonResponse, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let windowStart = 0;
let attempts = 0;

export function GET(request: NextRequest) {
  return jsonResponse({
    authenticated: validSession(request.cookies.get(SESSION_COOKIE)?.value),
    authConfigured: authConfigured(),
    storageConfigured: storageConfigured(),
  });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!authConfigured())
      throw new InspectionError(
        "ADMIN_NOT_CONFIGURED",
        "Vercelで管理者パスワードの初期設定が必要です。",
        503,
      );
    const now = Date.now();
    if (now - windowStart >= 60000) {
      windowStart = now;
      attempts = 0;
    }
    if (++attempts > 5)
      throw new InspectionError(
        "RATE_LIMITED",
        "ログインの回数制限に達しました。1分ほど待ってください。",
        429,
      );
    const body = await readJsonObject(request);
    if (!verifyPassword(body.password))
      throw new InspectionError("INVALID_CREDENTIALS", "管理者パスワードを確認してください。", 401);
    const response = jsonResponse({ authenticated: true });
    response.cookies.set(SESSION_COOKIE, createSession(), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:" || !!process.env.VERCEL,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = jsonResponse({ authenticated: false });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:" || !!process.env.VERCEL,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
