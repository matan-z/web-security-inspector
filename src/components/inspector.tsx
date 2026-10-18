"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  Fingerprint,
  Globe2,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Play,
  ScanLine,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { InspectionReport, type Filter } from "./inspection-report";
import { Guide, About } from "./info-pages";
import { InspectionSetup } from "./inspection-setup";
import { createDemoResult } from "@/lib/inspection/demo";
import { type Category, type InspectionResult } from "@/lib/inspection/types";

type View = "dashboard" | "guide" | "about";

export function Inspector() {
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [view, setView] = useState<View>("dashboard");
  const [url, setUrl] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<"all" | Category>("all");
  const resultsRef = useRef<HTMLElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!result) return;
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [result]);

  function showDemo() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
    setError("");
    setResult(createDemoResult());
    setFilter("all");
    setCategory("all");
    setView("dashboard");
  }

  function clearPrivateData() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
    setResult(null);
    setUrl("");
    setAuthorized(false);
    setError("");
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authorized) {
      setError("対象サイトの所有権または診断の許可を確認してください。");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), authorized }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (response.status === 401) {
        setLiveEnabled(false);
        setSettingsVersion((value) => value + 1);
      }
      if (!response.ok) throw new Error(data.error?.message ?? "診断を完了できませんでした。");
      if (controllerRef.current !== controller) return;
      setResult(data as InspectionResult);
      setFilter("all");
      setCategory("all");
    } catch (caught) {
      if (controllerRef.current !== controller) return;
      setError(
        controller.signal.aborted
          ? "診断がタイムアウトしました。時間をおいて再試行してください。"
          : caught instanceof Error
            ? caught.message
            : "通信に失敗しました。接続環境をご確認ください。",
      );
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) {
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }

  function download() {
    if (!result) return;
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `security-inspection-${result.mode}-${result.inspectedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        メインコンテンツへ移動
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            setView("dashboard");
          }}
          aria-label="Web Security Inspector ホーム"
        >
          <span className="brand-mark">
            <ShieldCheck size={23} strokeWidth={1.6} />
          </span>
          <span>
            Web Security
            <span>
              Inspector<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">W</span>
          <span>
            Personal workspace<small>セキュリティを、日常に。</small>
          </span>
          <span className="workspace-indicator" />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="メインナビゲーション">
          <button
            className={`nav-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard size={17} />
            ダッシュボード
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-item ${view === "guide" ? "active" : ""}`}
            onClick={() => setView("guide")}
          >
            <BookOpen size={17} />
            セキュリティガイド
          </button>
          <button
            className={`nav-item ${view === "about" ? "active" : ""}`}
            onClick={() => setView("about")}
          >
            <Info size={17} />
            このツールについて
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-demo">
            <span className="mini-icon">
              <Sparkles size={17} />
            </span>
            <strong>まずは、試してみませんか。</strong>
            <p>
              登録も設定も不要。
              <br />
              サンプル結果で機能を体験できます。
            </p>
            <button onClick={showDemo}>
              デモを試す <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-version">
            <span>
              <span className="online-dot" />
              v1.0.0
            </span>
            <span>Made for a safer web</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Shield size={15} />
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {view === "dashboard"
                ? "ダッシュボード"
                : view === "guide"
                  ? "セキュリティガイド"
                  : "このツールについて"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="privacy-tag">
              <LockKeyhole size={12} />
              プライバシーを優先
            </span>
            <span className="avatar">WS</span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {view === "dashboard" ? (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow hero-eyebrow">
                    <span className="online-dot" />
                    WEB SECURITY, MADE SIMPLE
                  </span>
                  <h1>
                    Webサイトの安全を、
                    <br />
                    <span>もっと身近に。</span>
                  </h1>
                  <p>
                    公開設定をチェックして、リスクと次のアクションを可視化。
                    <br className="desktop-br" />
                    専門知識がなくても、セキュリティの第一歩を踏み出せます。
                  </p>
                  <div className="hero-features">
                    <span>
                      <Check size={13} />
                      登録不要のデモ
                    </span>
                    <span>
                      <Check size={13} />
                      11項目をチェック
                    </span>
                    <span>
                      <Check size={13} />
                      具体的な改善提案
                    </span>
                  </div>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="radar-grid" />
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <span className="orbit-node node-one" />
                  <span className="orbit-node node-two" />
                  <div className="shield-glow" />
                  <div className="hero-shield">
                    <ShieldCheck size={89} strokeWidth={1.1} />
                  </div>
                  <span className="visual-label">
                    <span className="online-dot" />
                    SECURITY INSPECTOR
                  </span>
                  <span className="visual-coordinate">35.68° N / 139.76° E</span>
                </div>
              </section>

              <section className="scan-panel panel" aria-labelledby="scan-heading">
                <div className="panel-heading">
                  <div className="section-icon">
                    <ScanLine size={19} />
                  </div>
                  <div>
                    <h2 id="scan-heading">サイトを診断する</h2>
                    <p>所有または診断の許可があるWebサイトのURLを入力してください。</p>
                  </div>
                  <Badge className={liveEnabled ? "mode-live" : "mode-demo"}>
                    <span className="badge-dot" />
                    {liveEnabled ? "許可ドメインのみ" : "デモを利用できます"}
                  </Badge>
                </div>
                <InspectionSetup
                  key={settingsVersion}
                  onAvailabilityChange={setLiveEnabled}
                  onLogout={clearPrivateData}
                />
                <form onSubmit={inspect}>
                  <label htmlFor="target-url" className="input-label">
                    診断対象のURL
                  </label>
                  <div className="url-row">
                    <div className="url-input-wrap">
                      <Globe2 size={19} />
                      <input
                        id="target-url"
                        type="url"
                        placeholder="https://your-website.com"
                        autoComplete="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        required
                        maxLength={2048}
                        disabled={loading}
                        aria-describedby="inspection-setup-summary url-hint"
                      />
                    </div>
                    <Button type="submit" disabled={loading || !liveEnabled || !authorized}>
                      {loading ? (
                        <>
                          <LoaderCircle className="spin" size={17} />
                          診断中…
                        </>
                      ) : (
                        <>
                          <ScanLine size={17} />
                          診断を開始 <ArrowRight size={16} />
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="form-bottom">
                    <label className="consent">
                      <input
                        type="checkbox"
                        checked={authorized}
                        onChange={(event) => setAuthorized(event.target.checked)}
                        disabled={loading}
                      />
                      <span>このサイトの所有者、または診断の許可を得ています</span>
                    </label>
                    <span id="url-hint" className="limit-hint">
                      <Clock3 size={12} />
                      最大5秒 / GETのみ
                    </span>
                  </div>
                  {!loading && (
                    <p className="start-requirement" role="status">
                      {!liveEnabled
                        ? "実サイト診断には、上の管理画面でのログインと許可ドメインの登録が必要です。"
                        : !authorized
                          ? "開始するには、所有権・診断許可の確認にチェックを入れてください。"
                          : "許可ドメインのURLを入力して診断を開始できます。"}
                    </p>
                  )}
                </form>
                {error && (
                  <div className="error-message" role="alert">
                    <CircleAlert size={17} />
                    <span>{error}</span>
                    <button onClick={() => setError("")} aria-label="エラーを閉じる">
                      <X size={16} />
                    </button>
                  </div>
                )}
                {loading && (
                  <div className="loading-state" role="status">
                    <div className="loading-track">
                      <span />
                    </div>
                    <span>安全な接続を確認し、公開設定を読み取っています…</span>
                  </div>
                )}
                <div className="demo-strip">
                  <div>
                    <span className="demo-spark">
                      <Sparkles size={17} />
                    </span>
                    <p>
                      <strong>まずはサンプルで体験</strong>
                      <span>
                        {liveEnabled
                          ? "実サイトへの通信なしで、診断結果と改善方法を確認できます。"
                          : "実サイト診断は許可設定後に利用できます。デモは今すぐお試しいただけます。"}
                      </span>
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={showDemo}>
                    <Play size={13} fill="currentColor" />
                    デモを試す
                    <ArrowUpRight size={14} />
                  </Button>
                </div>
              </section>

              {result ? (
                <InspectionReport
                  result={result}
                  filter={filter}
                  setFilter={setFilter}
                  category={category}
                  setCategory={setCategory}
                  download={download}
                  resultsRef={resultsRef}
                />
              ) : (
                <section className="ready-section">
                  <div className="ready-heading">
                    <div>
                      <h2>小さな設定が、大きな安心に。</h2>
                      <p>サイトの基本を、3つの視点から確認します。</p>
                    </div>
                    <span className="subtle-label">
                      WHAT WE INSPECT <ArrowDown size={12} />
                    </span>
                  </div>
                  <div className="feature-cards">
                    {[
                      {
                        icon: LockKeyhole,
                        number: "01",
                        title: "通信を守る",
                        en: "TRANSPORT SECURITY",
                        text: "HTTPSとTLS証明書を確認。サイトとの接続が保護されているか調べます。",
                        count: "2つのチェック",
                      },
                      {
                        icon: ShieldCheck,
                        number: "02",
                        title: "ブラウザを守る",
                        en: "SECURITY HEADERS",
                        text: "CSPやHSTSなどの設定値を確認。意図しない実行や情報漏えいのリスクを探ります。",
                        count: "6つのチェック",
                      },
                      {
                        icon: Fingerprint,
                        number: "03",
                        title: "データを守る",
                        en: "COOKIE PROTECTION",
                        text: "Cookieの3つの保護属性を確認。利用者の情報を守るための設定を調べます。",
                        count: "3つのチェック",
                      },
                    ].map((feature) => (
                      <article key={feature.number} className="feature-card">
                        <div className="feature-top">
                          <feature.icon size={23} strokeWidth={1.4} />
                          <span>{feature.number}</span>
                        </div>
                        <span className="feature-en">{feature.en}</span>
                        <h3>{feature.title}</h3>
                        <p>{feature.text}</p>
                        <span className="feature-count">
                          {feature.count}
                          <ArrowUpRight size={14} />
                        </span>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : view === "guide" ? (
            <Guide onDemo={showDemo} />
          ) : (
            <About />
          )}
          <footer className="footer">
            <p>
              <Shield size={14} />
              静的な公開設定を確認するツールであり、包括的な侵入テストではありません。
            </p>
            <span>
              Web Security Inspector <span className="footer-slash">/</span> Build a safer web.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
