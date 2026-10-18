"use client";
import { Check, CircleAlert, Download, Globe2, Info, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { CheckList } from "./check-list";
import {
  CATEGORY_LABELS,
  summarize,
  type Category,
  type InspectionResult,
} from "@/lib/inspection/types";
export type Filter = "all" | "attention" | "pass";

export function InspectionReport({
  result,
  filter,
  setFilter,
  category,
  setCategory,
  download,
  resultsRef,
}: {
  result: InspectionResult;
  filter: Filter;
  setFilter: (value: Filter) => void;
  category: "all" | Category;
  setCategory: (value: "all" | Category) => void;
  download: () => void;
  resultsRef: React.RefObject<HTMLElement | null>;
}) {
  const { counts, score, evaluated } = summarize(result.checks);
  const attention = counts.fail + counts.warn;
  const filtered = result.checks.filter(
    (check) =>
      (category === "all" || check.category === category) &&
      (filter === "all" ||
        (filter === "attention" && ["fail", "warn"].includes(check.status)) ||
        (filter === "pass" && check.status === "pass")),
  );
  return (
    <section className="results-section" ref={resultsRef} aria-label="診断結果" aria-live="polite">
      <div className="results-title">
        <div>
          <span className="eyebrow">INSPECTION REPORT</span>
          <h2>
            診断結果
            <Badge className={result.mode === "demo" ? "mode-demo" : "mode-live"}>
              {result.mode === "demo" ? "デモデータ" : "実サイト診断"}
            </Badge>
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={download}>
          <Download size={14} />
          JSONをダウンロード
        </Button>
      </div>
      {result.mode === "demo" && (
        <div className="demo-notice">
          <Info size={16} />
          <p>
            これは学習用のサンプルです。<strong>外部サイトへの通信は行っていません。</strong>
            表示されたURL・日時・応答時間は架空の診断条件です。
          </p>
        </div>
      )}
      <div className="summary-grid">
        <article className="score-card panel">
          <div className="score-ring" style={{ "--score": score ?? 0 } as React.CSSProperties}>
            <div>
              <strong>{score ?? "—"}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <div>
            <span className="eyebrow">CONFIGURATION SCORE</span>
            <h3>
              {score === null
                ? "評価できる項目がありません"
                : attention
                  ? "改善できる設定があります"
                  : "基本設定は良好です"}
            </h3>
            <p>判定できた{evaluated}項目の参考スコア</p>
            <span className="score-disclaimer">サイト全体の安全性を保証するものではありません</span>
          </div>
        </article>
        <div className="status-cards">
          <article className="metric-card pass">
            <span>
              <Check size={15} />
              良好
            </span>
            <strong>
              {counts.pass}
              <small>項目</small>
            </strong>
          </article>
          <article className="metric-card warn">
            <span>
              <CircleAlert size={15} />
              要確認
            </span>
            <strong>
              {counts.warn}
              <small>項目</small>
            </strong>
          </article>
          <article className="metric-card fail">
            <span>
              <Shield size={15} />
              問題あり
            </span>
            <strong>
              {counts.fail}
              <small>項目</small>
            </strong>
          </article>
        </div>
      </div>
      <div className="report-meta">
        <span>
          <Globe2 size={13} />
          <strong>{result.url}</strong>
        </span>
        <span>
          {result.mode === "demo" ? "サンプル日時" : "診断日時"}：
          {new Date(result.inspectedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST
        </span>
        <span>HTTP {result.httpStatus}</span>
        <span>{result.durationMs} ms</span>
        {(counts.na > 0 || counts.unknown > 0) && (
          <span>
            該当なし {counts.na} / 判定不可 {counts.unknown}
          </span>
        )}
      </div>
      {result.redirected && (
        <div className="demo-notice">
          <Info size={16} />
          <p>
            リダイレクト応答のみを評価しました。転送先には接続していません。転送先ページの設定は判定できません。
          </p>
        </div>
      )}
      {(result.httpStatus < 200 || result.httpStatus >= 400) && (
        <div className="demo-notice">
          <Info size={16} />
          <p>
            HTTP {result.httpStatus}{" "}
            の応答に含まれる設定を評価しています。通常ページやログイン後の設定とは異なる場合があります。
          </p>
        </div>
      )}
      <div className="panel findings-panel">
        <div className="findings-heading">
          <div>
            <h3>
              検査項目<span>{result.checks.length}</span>
            </h3>
            <p>各項目をクリックして、設定の意味と改善方法を確認できます。</p>
          </div>
          <label className="category-select">
            <span className="sr-only">カテゴリで絞り込む</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as "all" | Category)}
            >
              <option value="all">すべてのカテゴリ</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-tabs" role="group" aria-label="結果の絞り込み">
          {[
            { key: "all" as const, title: "すべて", count: result.checks.length },
            { key: "attention" as const, title: "改善が必要", count: attention },
            { key: "pass" as const, title: "良好", count: counts.pass },
          ].map((item) => (
            <button
              key={item.key}
              aria-pressed={filter === item.key}
              className={filter === item.key ? "selected" : ""}
              onClick={() => setFilter(item.key)}
            >
              {item.title}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <CheckList checks={filtered} />
      </div>
      <div className="report-note">
        <Info size={15} />
        <p>
          このURLの単一レスポンスのみを評価します。認証後のページ、HTML内のmeta設定、JavaScriptで発行されたCookieは対象外です。参考スコアは重要度で加重し、良好100%・要確認50%・問題あり0%で計算します。該当なし・判定不可は除外します。
        </p>
      </div>
    </section>
  );
}
