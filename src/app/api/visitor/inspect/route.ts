import { NextRequest } from "next/server";
import { requireVisitor } from "@/lib/visitor/auth";
import { authorizeVisitorTarget } from "@/lib/visitor/service";
import { visitorBurst } from "@/lib/visitor/rate-limit";
import { inspectTarget } from "@/lib/inspection/network";
import { InspectionError } from "@/lib/inspection/policy";
import { acquireInspection } from "@/lib/inspection/rate-limit";
import { assertSameOrigin, errorResponse, jsonResponse, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let release: (() => void) | null = null;
  try {
    assertSameOrigin(request);
    const id = requireVisitor(request);
    if (!visitorBurst(`scan:${id}`, 10))
      throw new InspectionError("RATE_LIMITED", "診断が多すぎます。少し待ってください。", 429);
    const body = await readJsonObject(request);
    if (body.authorized !== true)
      throw new InspectionError(
        "AUTHORIZATION_REQUIRED",
        "このサイトの診断を行う許可を確認してください。",
        403,
      );
    release = acquireInspection();
    if (!release)
      throw new InspectionError("BUSY", "ほかの診断を実行中です。少し待ってください。", 429);
    const url = await authorizeVisitorTarget(id, body.url);
    return jsonResponse(await inspectTarget(url, [url.hostname], request.signal));
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
