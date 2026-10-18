import "server-only";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { readBodyAsText } from "guarded-fetch";
import { InspectionError } from "@/lib/inspection/policy";
import { normalizeHosts } from "./hosts";
import type { HostSettings } from "./types";

const PATH = "web-security-inspector/allowed-hosts-v1.json";
export function storageConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
}
function requireStorage() {
  if (!storageConfigured())
    throw new InspectionError(
      "STORAGE_NOT_CONFIGURED",
      "VercelのPrivate Blobストアをプロジェクトに接続してください。",
      503,
    );
}

export async function readHostSettings(): Promise<HostSettings> {
  requireStorage();
  try {
    const deadlineAt = Date.now() + 3000;
    const result = await get(PATH, {
      access: "private",
      useCache: false,
      abortSignal: AbortSignal.timeout(3000),
    });
    if (!result) return { hosts: [], revision: null, updatedAt: null };
    if (result.statusCode !== 200) throw new Error("invalid");
    if (result.blob.size > 16384) {
      void result.stream.cancel().catch(() => {});
      throw new Error("invalid");
    }
    const text = await readBodyAsText(new Response(result.stream), {
      maxResponseBytes: 16384,
      deadlineAt,
      opaqueErrors: true,
    });
    const data = JSON.parse(text);
    if (
      data.version !== 1 ||
      typeof data.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(data.updatedAt))
    )
      throw new Error("invalid");
    const hosts = normalizeHosts(data.hosts);
    // Stored data must be canonical. Corruption never silently broadens policy.
    if (JSON.stringify(hosts) !== JSON.stringify(data.hosts)) throw new Error("invalid");
    return { hosts, revision: result.blob.etag, updatedAt: data.updatedAt };
  } catch {
    throw new InspectionError(
      "SETTINGS_UNAVAILABLE",
      "許可ドメインの保存先を読み取れませんでした。安全のため実サイト診断を停止しています。Private Blobの接続設定をご確認ください。",
      503,
    );
  }
}

export async function writeHostSettings(
  hosts: string[],
  revision: string | null,
): Promise<HostSettings> {
  requireStorage();
  const normalized = normalizeHosts(hosts);
  const updatedAt = new Date().toISOString();
  try {
    const blob = await put(PATH, JSON.stringify({ version: 1, hosts: normalized, updatedAt }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: revision !== null,
      ...(revision ? { ifMatch: revision } : {}),
      contentType: "application/json",
      cacheControlMaxAge: 60,
      abortSignal: AbortSignal.timeout(3000),
    });
    return { hosts: normalized, revision: blob.etag, updatedAt };
  } catch (error) {
    if (
      error instanceof BlobPreconditionFailedError ||
      (error instanceof Error && error.message.includes("already exists"))
    ) {
      throw new InspectionError(
        "SETTINGS_CONFLICT",
        "ほかの画面で設定が変更されました。「設定を再読み込み」してから再実行してください。",
        409,
      );
    }
    throw new InspectionError(
      "SAVE_FAILED",
      "許可ドメインを保存できませんでした。保存先を確認し、設定を再読み込みしてから再実行してください。",
      503,
    );
  }
}
