import { NextRequest } from "next/server";
import { requireVisitor } from "@/lib/visitor/auth";
import { readVisitor, domainView } from "@/lib/visitor/store";
import { changeDomain } from "@/lib/visitor/service";
import { visitorBurst } from "@/lib/visitor/rate-limit";
import { InspectionError } from "@/lib/inspection/policy";
import { assertSameOrigin, errorResponse, jsonResponse, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const id = requireVisitor(request);
    if (!visitorBurst(`read:${id}`))
      throw new InspectionError(
        "RATE_LIMITED",
        "読み込みが多すぎます。1分ほど待ってください。",
        429,
      );
    return jsonResponse(domainView((await readVisitor(id)).data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const id = requireVisitor(request);
    if (!visitorBurst(`write:${id}`, 20))
      throw new InspectionError("RATE_LIMITED", "操作が多すぎます。1分ほど待ってください。", 429);
    const body = await readJsonObject(request);
    return jsonResponse(domainView(await changeDomain(id, body)));
  } catch (error) {
    return errorResponse(error);
  }
}
