import { InspectionError, parseAllowedHosts } from "@/lib/inspection/policy";
import { MAX_ALLOWED_HOSTS } from "./types";

export function normalizeHosts(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ALLOWED_HOSTS ||
    value.some((s) => typeof s !== "string" || s.length > 2048)
  ) {
    throw new InspectionError(
      "INVALID_HOSTS",
      `許可ドメインは最大${MAX_ALLOWED_HOSTS}件まで登録できます。`,
    );
  }
  return [
    ...new Set(
      value.map((input: string) => {
        try {
          const text = input.trim();
          if (!text || /[\u0000-\u0020\\,]/.test(text)) throw new Error("invalid");
          const url = new URL(text.includes("://") ? text : `https://${text}`);
          if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.port
          )
            throw new Error("invalid");
          const [host] = parseAllowedHosts(url.hostname);
          if (!host) throw new Error("invalid");
          return host;
        } catch {
          throw new InspectionError(
            "INVALID_HOSTS",
            "有効な公開ドメインまたはHTTP/HTTPSのURLを入力してください。IPアドレス・内部ホスト・認証情報・独自ポート・ワイルドカードは登録できません。",
          );
        }
      }),
    ),
  ];
}
