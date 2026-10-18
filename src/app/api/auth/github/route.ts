import { NextRequest } from "next/server";
import { OAUTH_COOKIE, assertVisitorHost, startOAuth } from "@/lib/visitor/auth";
import { storageConfigured } from "@/lib/admin/storage";
import { visitorBurst } from "@/lib/visitor/rate-limit";
import { InspectionError } from "@/lib/inspection/policy";
import { assertSameOrigin, errorResponse, jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertVisitorHost(request);
    if (!storageConfigured())
      throw new InspectionError("STORAGE_NOT_CONFIGURED", "訪問者向けの保存先は準備中です。", 503);
    if (!visitorBurst("oauth-start", 20))
      throw new InspectionError(
        "RATE_LIMITED",
        "ログインが混み合っています。1分ほど待ってください。",
        429,
      );
    const { url, cookie } = startOAuth();
    const response = jsonResponse({ authorizationUrl: url.toString() });
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
