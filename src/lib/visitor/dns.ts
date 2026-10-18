import "server-only";
import { Resolver } from "node:dns/promises";
import { normalizeHosts } from "@/lib/admin/hosts";
import { InspectionError } from "@/lib/inspection/policy";
import type { VisitorDomain } from "./types";

export function domainHost(input: unknown): string {
  const [host] = normalizeHosts([input]);
  if (host.length > 248)
    throw new InspectionError("INVALID_HOSTS", "DNS確認用のホスト名が長すぎます。");
  return host;
}

export const recordName = (host: string) => `_wsi.${host}`;
export const recordValue = (token: string) => `wsi-verification=${token}`;

export async function hasDnsProof(domain: VisitorDomain): Promise<boolean> {
  if (domainHost(domain.host) !== domain.host || !/^[a-f0-9]{64}$/.test(domain.token))
    throw new InspectionError("INVALID_DOMAIN", "ドメイン設定を確認してください。", 403);
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      resolver.resolveTxt(recordName(domain.host)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          resolver.cancel();
          reject(new Error("timeout"));
        }, 2000);
      }),
    ]);
    // Only TXT is queried. Never resolve/fetch a user-provided verification URL.
    return records.slice(0, 64).some((parts) => parts.join("") === recordValue(domain.token));
  } catch (error) {
    if (["ENODATA", "ENOTFOUND"].includes((error as NodeJS.ErrnoException)?.code ?? ""))
      return false;
    throw new InspectionError(
      "DNS_UNAVAILABLE",
      "DNSを確認できませんでした。少し待ってから再実行してください。診断先への通信は行っていません。",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
