import { NextRequest } from "next/server";
import { inspectTarget } from "@/lib/inspection/network";
import { InspectionError, validateTarget } from "@/lib/inspection/policy";
import { acquireInspection, takeRequest } from "@/lib/inspection/rate-limit";
import { requireAdmin } from "@/lib/admin/auth";
import { readHostSettings } from "@/lib/admin/storage";
import { assertSameOrigin, errorResponse, jsonResponse, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let release: (() => void) | null = null;
  try {
    assertSameOrigin(request);
    requireAdmin(request);
    if (!takeRequest())
      throw new InspectionError(
        "RATE_LIMITED",
        "診断の回数制限に達しました。1分ほど待ってから再試行してください。",
        429,
      );
    const input = await readJsonObject(request);
    if (input.authorized !== true)
      throw new InspectionError(
        "AUTHORIZATION_REQUIRED",
        "対象サイトの所有権または診断の許可を確認してください。",
        403,
      );
    release = acquireInspection();
    if (!release)
      throw new InspectionError(
        "BUSY",
        "現在ほかの診断を実行しています。少し待ってから再試行してください。",
        429,
      );
    // Fresh server-side configuration is authoritative on every request.
    // Never accept an allowlist from browser state or fall back on read failure.
    const { hosts } = await readHostSettings();
    const url = validateTarget(input.url, hosts);
    return jsonResponse(await inspectTarget(url, hosts, request.signal));
  } catch (error) {
    return errorResponse(error);
  } finally {
    release?.();
  }
}
