import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { readHostSettings, writeHostSettings } from "@/lib/admin/storage";
import { normalizeHosts } from "@/lib/admin/hosts";
import { InspectionError } from "@/lib/inspection/policy";
import { takeRequest } from "@/lib/inspection/rate-limit";
import { assertSameOrigin, errorResponse, jsonResponse, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request);
    return jsonResponse(await readHostSettings());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    requireAdmin(request);
    if (!takeRequest())
      throw new InspectionError(
        "RATE_LIMITED",
        "操作の回数制限に達しました。1分ほど待ってください。",
        429,
      );
    const body = await readJsonObject(request);
    const hosts = normalizeHosts(body.hosts);
    if (!(
      body.revision === null ||
      (typeof body.revision === "string" && body.revision.length > 0 && body.revision.length <= 256)
    ))
      throw new InspectionError("INVALID_REVISION", "設定を再読み込みしてから再実行してください。");
    const current = await readHostSettings();
    if (current.revision !== body.revision)
      throw new InspectionError(
        "SETTINGS_CONFLICT",
        "ほかの画面で設定が変更されました。設定を再読み込みしてください。",
        409,
      );
    if (hosts.some((host) => !current.hosts.includes(host)) && body.authorized !== true)
      throw new InspectionError(
        "AUTHORIZATION_REQUIRED",
        "対象ドメインの所有権または診断の許可を確認してください。",
        403,
      );
    return jsonResponse(await writeHostSettings(hosts, current.revision));
  } catch (error) {
    return errorResponse(error);
  }
}
