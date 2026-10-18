import { isIP } from "node:net";

export class InspectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "InspectionError";
  }
}

const HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseAllowedHosts(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const hosts = value.split(",").map((s) => s.trim().toLowerCase());
  // One malformed entry invalidates the entire configuration (fail closed).
  if (
    hosts.some((host) => !HOST.test(host) || host.endsWith(".local") || host.endsWith(".localhost"))
  ) {
    throw new InspectionError(
      "NOT_CONFIGURED",
      "実サイト診断の許可設定を確認してください。デモは引き続き利用できます。",
      503,
    );
  }
  return [...new Set(hosts)];
}

export function validateTarget(input: unknown, allowedHosts: string[]): URL {
  if (!allowedHosts.length)
    throw new InspectionError(
      "NOT_CONFIGURED",
      "この環境では実サイト診断が無効です。管理者が許可ドメインを設定するまで、デモをご利用ください。",
      503,
    );
  if (
    typeof input !== "string" ||
    input.length > 2048 ||
    !/^https?:\/\//i.test(input) ||
    /[\u0000-\u0020\\]/.test(input)
  ) {
    throw new InspectionError(
      "INVALID_URL",
      "http:// または https:// から始まるURLを入力してください。",
    );
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InspectionError("INVALID_URL", "有効なURLを入力してください。");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new InspectionError(
      "INVALID_URL",
      "HTTP/HTTPSの標準ポートのみ利用できます。認証情報・クエリ・フラグメントを含まないURLを入力してください。",
    );
  }
  if (
    !HOST.test(url.hostname) ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !allowedHosts.includes(url.hostname)
  ) {
    throw new InspectionError(
      "HOST_NOT_ALLOWED",
      "このドメインは診断を許可されていません。所有または明示的な許可のあるドメインを、管理者が登録してください。",
      403,
    );
  }
  return url;
}
