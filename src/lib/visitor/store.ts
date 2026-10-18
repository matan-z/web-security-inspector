import "server-only";
import { randomBytes } from "node:crypto";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { readBodyAsText } from "guarded-fetch";
import { storageConfigured } from "@/lib/admin/storage";
import { InspectionError } from "@/lib/inspection/policy";
import { domainHost, recordName, recordValue } from "./dns";
import {
  CHALLENGE_TTL_MS,
  MAX_DAILY_SCANS,
  MAX_DOMAINS,
  MAX_OPERATIONS,
  MAX_SCANS,
  WINDOW_MS,
  type VisitorRecord,
  type VisitorDomains,
} from "./types";

function pathname(userId: string) {
  if (!/^[a-f0-9]{64}$/.test(userId)) throw new Error("invalid identity");
  return `web-security-inspector/visitors-v1/${userId}.json`;
}

export function emptyRecord(now = Date.now()): VisitorRecord {
  return {
    version: 1,
    domains: [],
    quota: {
      windowStart: now,
      operations: 0,
      scans: 0,
      day: new Date(now).toISOString().slice(0, 10),
      dailyScans: 0,
    },
  };
}

function validRecord(value: unknown): value is VisitorRecord {
  if (!value || typeof value !== "object") return false;
  const data = value as VisitorRecord;
  if (
    data.version !== 1 ||
    !Array.isArray(data.domains) ||
    data.domains.length > MAX_DOMAINS ||
    !data.quota
  )
    return false;
  const q = data.quota;
  if (
    ![q.windowStart, q.operations, q.scans, q.dailyScans].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(q.day)
  )
    return false;
  const hosts = new Set<string>();
  return data.domains.every((d) => {
    if (
      !d ||
      typeof d.host !== "string" ||
      typeof d.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(d.token) ||
      !Number.isSafeInteger(d.createdAt) ||
      d.createdAt < 0 ||
      !(
        d.verifiedAt === null ||
        (Number.isSafeInteger(d.verifiedAt) && d.verifiedAt >= d.createdAt)
      )
    )
      return false;
    if (hosts.has(d.host)) return false;
    hosts.add(d.host);
    return domainHost(d.host) === d.host;
  });
}

export async function readVisitor(
  userId: string,
): Promise<{ data: VisitorRecord; etag: string | null }> {
  const key = pathname(userId);
  if (!storageConfigured())
    throw new InspectionError(
      "STORAGE_NOT_CONFIGURED",
      "保存先の準備ができていません。デモをご利用ください。",
      503,
    );
  try {
    const deadlineAt = Date.now() + 3000;
    const result = await get(key, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(3000),
    });
    if (!result) return { data: emptyRecord(), etag: null };
    if (result.statusCode !== 200 || result.blob.size > 16384) {
      void result.stream?.cancel().catch(() => {});
      throw new Error("invalid");
    }
    const data: unknown = JSON.parse(
      await readBodyAsText(new Response(result.stream), {
        maxResponseBytes: 16384,
        deadlineAt,
        opaqueErrors: true,
      }),
    );
    if (!validRecord(data) || !result.blob.etag) throw new Error("invalid");
    return { data, etag: result.blob.etag };
  } catch {
    throw new InspectionError(
      "ACCOUNT_UNAVAILABLE",
      "ドメイン設定を読み取れませんでした。安全のため診断を停止しています。",
      503,
    );
  }
}

export function consumeQuota(data: VisitorRecord, scan: boolean, now = Date.now()) {
  const q = data.quota;
  if (now - q.windowStart >= WINDOW_MS) {
    q.windowStart = now;
    q.operations = 0;
    q.scans = 0;
  }
  const day = new Date(now).toISOString().slice(0, 10);
  if (q.day !== day) {
    q.day = day;
    q.dailyScans = 0;
  }
  if (
    q.operations >= MAX_OPERATIONS ||
    (scan && (q.scans >= MAX_SCANS || q.dailyScans >= MAX_DAILY_SCANS))
  )
    throw new InspectionError(
      "USER_RATE_LIMITED",
      "利用回数の上限です。診断は10分あたり5回・UTCの1日あたり30回、ドメイン操作を含め10分あたり20回まで利用できます。",
      429,
    );
  q.operations++;
  if (scan) {
    q.scans++;
    q.dailyScans++;
  }
}

// Conditional writes make the per-user quota authoritative across instances.
// Callbacks may be retried: no DNS/HTTP or other side effects are allowed here.
export async function updateVisitor(
  userId: string,
  change: (data: VisitorRecord) => void,
): Promise<VisitorRecord> {
  const key = pathname(userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, etag } = await readVisitor(userId);
    change(data);
    if (!validRecord(data)) throw new Error("invalid update");
    try {
      await put(key, JSON.stringify(data), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: etag !== null,
        ...(etag ? { ifMatch: etag } : {}),
        contentType: "application/json",
        cacheControlMaxAge: 60,
        abortSignal: AbortSignal.timeout(3000),
      });
      return data;
    } catch (error) {
      if (
        error instanceof BlobPreconditionFailedError ||
        (error instanceof Error && error.message.includes("already exists"))
      )
        continue;
      throw new InspectionError(
        "ACCOUNT_UNAVAILABLE",
        "設定を保存できませんでした。時間をおいて再実行してください。",
        503,
      );
    }
  }
  throw new InspectionError(
    "ACCOUNT_BUSY",
    "別の操作を処理中です。少し待ってから再実行してください。",
    409,
  );
}

export function addDomain(data: VisitorRecord, host: string, now = Date.now()) {
  if (data.domains.some((d) => d.host === host)) return;
  if (data.domains.length >= MAX_DOMAINS)
    throw new InspectionError("DOMAIN_LIMIT", "登録できるドメインは3件までです。");
  data.domains.push({
    host,
    token: randomBytes(32).toString("hex"),
    createdAt: now,
    verifiedAt: null,
  });
}

export function domainView(data: VisitorRecord, now = Date.now()): VisitorDomains {
  const q = data.quota;
  const expired = now - q.windowStart >= WINDOW_MS;
  return {
    domains: data.domains.map((d) => ({
      host: d.host,
      recordName: recordName(d.host),
      recordValue: recordValue(d.token),
      verifiedAt: d.verifiedAt === null ? null : new Date(d.verifiedAt).toISOString(),
      expiresAt:
        d.verifiedAt === null ? new Date(d.createdAt + CHALLENGE_TTL_MS).toISOString() : null,
    })),
    limits: {
      remainingScans: Math.max(0, MAX_SCANS - (expired ? 0 : q.scans)),
      dailyRemaining: Math.max(
        0,
        MAX_DAILY_SCANS - (q.day === new Date(now).toISOString().slice(0, 10) ? q.dailyScans : 0),
      ),
      resetsAt: new Date(expired ? now + WINDOW_MS : q.windowStart + WINDOW_MS).toISOString(),
    },
  };
}
