"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  Minus,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { STATUS_LABELS, type CheckResult, type CheckStatus } from "@/lib/inspection/types";

export function StatusIcon({ status, size = 16 }: { status: CheckStatus; size?: number }) {
  const Icon =
    status === "pass"
      ? Check
      : status === "fail"
        ? ShieldAlert
        : status === "warn"
          ? CircleAlert
          : status === "na"
            ? Minus
            : CircleHelp;
  return <Icon size={size} aria-hidden="true" />;
}

export function CheckList({ checks }: { checks: CheckResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="check-list">
      {checks.map((check) => {
        const expanded = open === check.id;
        return (
          <article className={`check-row ${expanded ? "expanded" : ""}`} key={check.id}>
            <h3>
              <button
                type="button"
                className="check-trigger"
                aria-expanded={expanded}
                aria-controls={`detail-${check.id}`}
                onClick={() => setOpen(expanded ? null : check.id)}
              >
                <span className={`status-icon ${check.status}`}>
                  <StatusIcon status={check.status} size={17} />
                </span>
                <span className="check-title">
                  <strong>{check.name}</strong>
                  <span>{check.subtitle}</span>
                </span>
                <span className={`severity severity-${check.severity}`}>
                  重要度：
                  {check.severity === "high" ? "高" : check.severity === "medium" ? "中" : "低"}
                </span>
                <Badge className={`status-badge ${check.status}`}>
                  {STATUS_LABELS[check.status]}
                </Badge>
                <ChevronDown className="check-chevron" size={16} />
              </button>
            </h3>
            {expanded && (
              <div id={`detail-${check.id}`} className="check-detail">
                <p className="detail-summary">{check.summary}</p>
                <div className="observed">
                  <span className="eyebrow">確認した設定値</span>
                  <pre>{check.observed}</pre>
                </div>
                <div className="detail-grid">
                  <section>
                    <h4>この設定の意味</h4>
                    <p>{check.meaning}</p>
                  </section>
                  <section>
                    <h4>想定されるリスク</h4>
                    <p>{check.risk}</p>
                  </section>
                </div>
                <section className="recommendation">
                  <h4>
                    <Check size={15} />
                    推奨する改善方法
                  </h4>
                  <p>{check.recommendation}</p>
                  {check.example && <pre>{check.example}</pre>}
                  <span className="example-note">
                    設定例はサイトの構成・利用目的に合わせて調整してください。
                  </span>
                </section>
                <a className="text-link" href={check.reference} target="_blank" rel="noreferrer">
                  公式ドキュメントで詳しく読む <ExternalLink size={12} />
                </a>
              </div>
            )}
          </article>
        );
      })}
      {!checks.length && <p className="no-results">この条件に一致する検査項目はありません。</p>}
    </div>
  );
}
