import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_COOKIE,
  VISITOR_COOKIE,
  VISITOR_SESSION_SECONDS,
  assertVisitorHost,
  visitorConfig,
  oauthVerifier,
  completeOAuth,
} from "@/lib/visitor/auth";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  let origin: string;
  try {
    origin = visitorConfig().origin;
  } catch (error) {
    return errorResponse(error);
  }
  const options = {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax" as const,
    path: "/",
  };
  let session: string | null = null;
  try {
    assertVisitorHost(request);
    const verifier = oauthVerifier(
      request.cookies.get(OAUTH_COOKIE)?.value,
      request.nextUrl.searchParams.get("state"),
    );
    const code = request.nextUrl.searchParams.get("code");
    if (!code || request.nextUrl.searchParams.has("error")) throw new Error("cancelled");
    session = await completeOAuth(code, verifier);
  } catch {
    /* Never include OAuth errors, codes, or tokens in redirects. */
  }
  const response = NextResponse.redirect(new URL(session ? "/" : "/?login=failed", origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(OAUTH_COOKIE, "", { ...options, maxAge: 0 });
  if (session)
    response.cookies.set(VISITOR_COOKIE, session, {
      ...options,
      sameSite: "strict",
      maxAge: VISITOR_SESSION_SECONDS,
    });
  return response;
}
