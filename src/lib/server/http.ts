import { NextRequest, NextResponse } from "next/server";
import { InspectionError } from "@/lib/inspection/policy";

export function assertSameOrigin(request: NextRequest) {
  const expected = `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
  if (
    request.headers.get("origin") !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new InspectionError("ORIGIN_REJECTED", "このアプリの画面から操作してください。", 403);
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof InspectionError)
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
  return jsonResponse(
    {
      error: {
        code: "REQUEST_FAILED",
        message: "処理を完了できませんでした。時間をおいて再実行してください。",
      },
    },
    500,
  );
}

export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    throw new InspectionError("INVALID_BODY", "JSON形式のリクエストが必要です。", 415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096))
    throw new InspectionError("BODY_TOO_LARGE", "リクエストが大きすぎます。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InspectionError("INVALID_BODY", "入力内容を確認してください。");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096)
          throw new InspectionError("BODY_TOO_LARGE", "リクエストが大きすぎます。", 413);
        chunks.push(value);
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid");
      return parsed as Record<string, unknown>;
    };
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new InspectionError(
                "INVALID_BODY",
                "リクエストの受信に時間がかかりすぎています。",
                408,
              ),
            ),
          2000,
        );
      }),
    ]);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof InspectionError) throw error;
    throw new InspectionError("INVALID_BODY", "入力内容の形式を確認してください。");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
