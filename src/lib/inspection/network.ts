import "server-only";
import { guardedFetch, readBodyAsText } from "guarded-fetch";
import { evaluateSnapshot } from "./evaluate";
import { InspectionError } from "./policy";

export const TIMEOUT_MS = 5000;
export const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function inspectTarget(url: URL, allowedHosts: string[], clientSignal?: AbortSignal) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new InspectionError(
      "TLS_CONFIGURATION_UNSAFE",
      "安全なTLS接続を検証できない環境のため、実サイト診断は無効です。",
      503,
    );
  }
  // Keep a separate deadline alive through DNS, connect, and body consumption.
  // guardedFetch's timeout alone ends once its Response is returned.
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  const deadlineAt = Date.now() + TIMEOUT_MS;
  const signal = clientSignal ? AbortSignal.any([deadline, clientSignal]) : deadline;
  const started = performance.now();
  try {
    const response = await guardedFetch(url.toString(), {
      allowedHosts,
      skipSsrfCheckForAllowedHosts: false,
      followRedirects: false,
      timeoutMs: TIMEOUT_MS,
      signal,
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "WebSecurityInspector/1.0",
        "Accept-Encoding": "identity",
      },
      sanitizeHeaders: true,
      opaqueErrors: true,
    });
    // The decoded body is bounded and immediately discarded. Never execute HTML.
    await readBodyAsText(response, {
      maxResponseBytes: MAX_RESPONSE_BYTES,
      deadlineAt,
      opaqueErrors: true,
    });
    return evaluateSnapshot({
      url: url.toString(),
      headers: response.headers,
      cookies: response.headers.getSetCookie(),
      httpStatus: response.status,
      tls: url.protocol === "https:" ? "verified" : "na",
      durationMs: Math.round(performance.now() - started),
    });
  } catch {
    // Deliberately avoid exposing DNS, IP, TLS stack, headers, and upstream body.
    // Never replace a failed live request with a demo fixture.
    throw new InspectionError(
      "CONNECTION_FAILED",
      "判定不可：診断先への接続または応答の取得を完了できませんでした。通信の安全性、証明書、5秒の制限、1MBの上限などをご確認ください。",
      502,
    );
  }
}
