import "server-only";
import { InspectionError, validateTarget } from "@/lib/inspection/policy";
import { hasDnsProof, domainHost } from "./dns";
import { addDomain, consumeQuota, updateVisitor } from "./store";
import { CHALLENGE_TTL_MS } from "./types";

export async function changeDomain(userId: string, body: Record<string, unknown>) {
  const host = domainHost(body.host);
  if (!["add", "verify", "remove"].includes(String(body.action)))
    throw new InspectionError("INVALID_ACTION", "操作内容を確認してください。");
  if (body.action === "add" && body.authorized !== true)
    throw new InspectionError(
      "AUTHORIZATION_REQUIRED",
      "自社のドメインを管理する権限と診断の許可を確認してください。",
      403,
    );
  const reserved = await updateVisitor(userId, (data) => {
    consumeQuota(data, false);
    if (body.action === "add") addDomain(data, host);
    if (body.action === "remove") data.domains = data.domains.filter((d) => d.host !== host);
  });
  if (body.action !== "verify") return reserved;
  const domain = reserved.domains.find((d) => d.host === host);
  if (!domain)
    throw new InspectionError(
      "DOMAIN_NOT_FOUND",
      "このアカウントに登録されていないドメインです。",
      403,
    );
  if (domain.verifiedAt === null && Date.now() - domain.createdAt >= CHALLENGE_TTL_MS)
    throw new InspectionError(
      "CHALLENGE_EXPIRED",
      "確認コードの有効期限が切れました。ドメインを削除して登録し直してください。",
      403,
    );
  const verified = await hasDnsProof(domain);
  return updateVisitor(userId, (data) => {
    const current = data.domains.find((d) => d.host === host && d.token === domain.token);
    if (!current)
      throw new InspectionError(
        "DOMAIN_CHANGED",
        "設定が変更されました。再読み込みしてください。",
        409,
      );
    current.verifiedAt = verified ? Date.now() : null;
  });
}

export async function authorizeVisitorTarget(userId: string, input: unknown): Promise<URL> {
  const data = await updateVisitor(userId, (current) => {
    consumeQuota(current, true);
  });
  const hosts = data.domains.filter((d) => d.verifiedAt !== null).map((d) => d.host);
  if (!hosts.length)
    throw new InspectionError(
      "DOMAIN_UNVERIFIED",
      "先に自社ドメインのDNS確認を完了してください。",
      403,
    );
  const url = validateTarget(input, hosts);
  const domain = data.domains.find((d) => d.host === url.hostname)!;
  // A previous verified flag is never enough: recheck the exact TXT each scan.
  if (!(await hasDnsProof(domain))) {
    await updateVisitor(userId, (current) => {
      const match = current.domains.find((d) => d.host === domain.host && d.token === domain.token);
      if (match) match.verifiedAt = null;
    });
    throw new InspectionError(
      "DOMAIN_UNVERIFIED",
      "DNS確認用TXTレコードが見つかりません。再度ドメインを確認してください。診断先への通信は行っていません。",
      403,
    );
  }
  return url;
}
