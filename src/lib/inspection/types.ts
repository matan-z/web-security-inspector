export type CheckStatus = "pass" | "warn" | "fail" | "na" | "unknown";
export type Severity = "high" | "medium" | "low";
export type Category = "transport" | "headers" | "cookies";

export interface CheckResult {
  id: string;
  name: string;
  subtitle: string;
  category: Category;
  severity: Severity;
  status: CheckStatus;
  summary: string;
  observed: string;
  meaning: string;
  risk: string;
  recommendation: string;
  example?: string;
  reference: string;
}

export interface InspectionResult {
  version: 1;
  mode: "demo" | "live";
  url: string;
  inspectedAt: string;
  durationMs: number;
  httpStatus: number;
  redirected: boolean;
  checks: CheckResult[];
}

export const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: "良好",
  warn: "要確認",
  fail: "問題あり",
  na: "該当なし",
  unknown: "判定不可",
};
export const CATEGORY_LABELS: Record<Category, string> = {
  transport: "通信の保護",
  headers: "セキュリティヘッダー",
  cookies: "Cookieの保護",
};

export function summarize(checks: CheckResult[]) {
  const counts = { pass: 0, warn: 0, fail: 0, na: 0, unknown: 0 };
  const weights = { high: 3, medium: 2, low: 1 };
  let earned = 0;
  let total = 0;
  checks.forEach((check) => {
    counts[check.status]++;
    if (check.status === "na" || check.status === "unknown") return;
    const weight = weights[check.severity];
    total += weight;
    earned += weight * (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0);
  });
  return {
    counts,
    score: total ? Math.round((earned / total) * 100) : null,
    evaluated: counts.pass + counts.warn + counts.fail,
  };
}
