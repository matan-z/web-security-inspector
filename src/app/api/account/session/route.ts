import { NextRequest } from "next/server";
import { storageConfigured } from "@/lib/admin/storage";
import { VISITOR_COOKIE, visitorConfigured, visitorIdentity } from "@/lib/visitor/auth";
import { OAUTH_COOKIE } from "@/lib/visitor/auth";
import { assertSameOrigin, errorResponse, jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return jsonResponse({
    authenticated: !!visitorIdentity(request.cookies.get(VISITOR_COOKIE)?.value),
    loginConfigured: visitorConfigured(),
    storageConfigured: storageConfigured(),
  });
}
export function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = jsonResponse({ authenticated: false });
    for (const name of [VISITOR_COOKIE, OAUTH_COOKIE])
      response.cookies.set(name, "", {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:" || !!process.env.VERCEL,
        sameSite: name === OAUTH_COOKIE ? "lax" : "strict",
        path: "/",
        maxAge: 0,
      });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
