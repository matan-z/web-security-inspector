"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  LogIn,
  Globe2,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { MAX_DOMAINS, type VisitorDomains, type VisitorStatus } from "@/lib/visitor/types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "処理を完了できませんでした。");
  return data as T;
}

function LoginSetupHelp({ status, origin }: { status: VisitorStatus; origin: string }) {
  const local = origin.startsWith("http://localhost:");
  return (
    <div className="visitor-pending" id="visitor-login-unavailable">
      <strong>運営者の初期設定が未完了のため、GitHubログインを利用できません。</strong>
      <ul className="setup-steps">
        {!status.loginConfigured && <li>GitHubログインの初期設定：未完了</li>}
        {!status.storageConfigured && <li>ドメイン情報の保存先：未接続</li>}
      </ul>
      <p>「デモを試す」は、ログインやDNS設定なしで利用できます。</p>
      <details className="setup-details">
        <summary>運営者向け：ログインを有効にする設定手順</summary>
        <ol className="setup-steps">
          <li>
            <strong>GitHubにログイン専用のOAuth Appを登録</strong>
            <p>GitHubへのpush用の連携とは別の設定です。</p>
            <a
              className="text-link"
              href="https://github.com/settings/applications/new"
              target="_blank"
              rel="noreferrer"
            >
              GitHubのOAuth App作成画面を開く
            </a>
            {origin && (
              <>
                <p>
                  Homepage URL：<code>{origin}</code>
                </p>
                <p>
                  Authorization callback URL：<code>{origin}/api/auth/github/callback</code>
                </p>
              </>
            )}
          </li>
          <li>
            <strong>
              {local ? "プロジェクト直下の.env.localに設定" : "VercelのEnvironment Variablesに設定"}
            </strong>
            <p>
              <code>GITHUB_CLIENT_ID</code>と<code>GITHUB_CLIENT_SECRET</code>にOAuth
              Appの値を設定します。<code>SESSION_SECRET</code>
              には32文字以上のランダムな値を設定してください。
            </p>
            {origin && (
              <p>
                <code>APP_ORIGIN={origin}</code>も設定します。
              </p>
            )}
          </li>
          <li>
            <strong>VercelでPrivate Blobを接続</strong>
            <p>
              {local
                ? "ローカルでは読み書きトークンを.env.localのBLOB_READ_WRITE_TOKENに設定します。"
                : "VercelのStorageでアクセスがPrivateのストアを接続します。"}
            </p>
          </li>
          <li>
            <strong>{local ? "開発サーバーを再起動" : "設定後に再デプロイ"}</strong>
            <p>
              {local
                ? "実行中のターミナルでCtrl+Cを押し、npm run devで起動し直して画面を再読み込みしてください。"
                : "Redeployが完了したら画面を再読み込みしてください。"}
            </p>
          </li>
        </ol>
        <p>
          Client
          Secret・SESSION_SECRET・保存用トークンはチャットやGitHubへ貼り付けず、サーバー設定だけに保存してください。
        </p>
      </details>
    </div>
  );
}

export function VisitorSetup({
  onAvailabilityChange,
  onLogout,
}: {
  onAvailabilityChange: (enabled: boolean) => void;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<VisitorStatus | null>(null);
  const [settings, setSettings] = useState<VisitorDomains | null>(null);
  const [domain, setDomain] = useState("");
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [appOrigin, setAppOrigin] = useState("");

  const apply = useCallback(
    (saved: VisitorDomains) => {
      setSettings(saved);
      onAvailabilityChange(saved.domains.some((d) => d.verifiedAt !== null));
    },
    [onAvailabilityChange],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    onAvailabilityChange(false);
    try {
      const next = await call<VisitorStatus>("/api/account/session");
      setStatus(next);
      setSettings(null);
      if (next.authenticated && next.storageConfigured)
        apply(await call<VisitorDomains>("/api/account/domains"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "設定を取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }, [onAvailabilityChange, apply]);

  useEffect(() => {
    setAppOrigin(window.location.origin);
    if (new URLSearchParams(window.location.search).get("login") === "failed") {
      setMessage("GitHubログインを完了できませんでした。もう一度お試しください。");
      window.history.replaceState(null, "", window.location.pathname);
    }
    void refresh();
  }, [refresh]);

  async function change(action: "add" | "verify" | "remove", host: string) {
    setBusy(true);
    setError("");
    setMessage("");
    onAvailabilityChange(false);
    try {
      const saved = await call<VisitorDomains>("/api/account/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, host, authorized: permission }),
      });
      apply(saved);
      if (action === "add") {
        setDomain("");
        setPermission(false);
        setMessage("確認コードを発行しました。自社のDNSにTXTレコードを追加してください。");
      }
      if (action === "verify") {
        if (saved.domains.find((d) => d.host === host)?.verifiedAt)
          setMessage("DNSレコードが一致しました。このドメインを診断できます。");
        else
          setError(
            "TXTレコードが一致しません。設定値とDNSへの反映を確認して、再実行してください。",
          );
      }
      if (action === "remove")
        setMessage("ドメインを削除しました。DNSの確認用TXTレコードも不要になりました。");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "設定を変更できませんでした。再読み込みしてください。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await call("/api/account/session", { method: "DELETE" });
      setSettings(null);
      setStatus((previous) => (previous ? { ...previous, authenticated: false } : previous));
      setDomain("");
      setPermission(false);
      setMessage("");
      onAvailabilityChange(false);
      onLogout();
    } catch {
      setError("ログアウトできませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await call<{ authorizationUrl: string }>("/api/auth/github", { method: "POST" });
      // Top-level navigation keeps form-action restricted to this application.
      const url = new URL(data.authorizationUrl);
      if (url.origin !== "https://github.com" || url.pathname !== "/login/oauth/authorize")
        throw new Error("ログイン先を確認できませんでした。");
      window.location.assign(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインを開始できませんでした。");
      setBusy(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("コピーしました。");
    } catch {
      setError("コピーできませんでした。表示された値を選択してコピーしてください。");
    }
  }

  const ready = status?.loginConfigured && status.storageConfigured;
  return (
    <section
      className={`inspection-setup visitor-setup ${status?.authenticated ? "setup-configured" : ""}`}
      aria-label="自社ドメインの確認"
    >
      <div className="setup-heading">
        <ShieldCheck size={20} aria-hidden="true" />
        <h3>自社ドメインを確認して診断する</h3>
        {status?.authenticated && (
          <span className="admin-session-label">
            <Check size={12} />
            ログイン済み
          </span>
        )}
      </div>
      <p id="inspection-setup-summary">
        GitHubでログインし、自社ドメインのDNSに確認用TXTレコードを追加します。確認済みのドメインだけを、このアカウントから診断できます。
      </p>
      <ol className="visitor-steps" aria-label="診断までの手順">
        <li>
          <span>01</span>GitHubログイン
        </li>
        <li>
          <span>02</span>DNSでドメイン確認
        </li>
        <li>
          <span>03</span>URLを診断
        </li>
      </ol>
      {!status && busy && (
        <p className="admin-loading">
          <LoaderCircle className="spin" size={15} />
          ログイン状態を確認しています…
        </p>
      )}
      {status && !status.authenticated && (
        <>
          <form onSubmit={login} className="visitor-login">
            <Button
              type="submit"
              disabled={busy || !ready}
              aria-describedby={!ready ? "visitor-login-unavailable" : undefined}
            >
              <LogIn size={17} />
              GitHubでログイン
            </Button>
            <p className="admin-helper">
              GitHubアカウントが必要です。このアプリにメールアドレスやパスワードを保存せず、リポジトリへのアクセス権限も要求しません。
            </p>
          </form>
          {!ready && <LoginSetupHelp status={status} origin={appOrigin} />}
        </>
      )}
      {status?.authenticated && (
        <>
          <div className="admin-toolbar">
            <span>
              自分のドメイン {settings?.domains.length ?? "—"} / {MAX_DOMAINS}件
            </span>
            <div>
              <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={busy}>
                <RefreshCw size={13} />
                再読み込み
              </Button>
              <Button variant="ghost" size="sm" onClick={logout} disabled={busy}>
                <LogOut size={13} />
                ログアウト
              </Button>
            </div>
          </div>
          {settings && (
            <>
              <div className="visitor-domains">
                {settings.domains.map((item) => (
                  <article className="visitor-domain" key={item.host}>
                    <div className="visitor-domain-heading">
                      <Globe2 size={15} />
                      <strong>{item.host}</strong>
                      <span className={`domain-status ${item.verifiedAt ? "verified" : "pending"}`}>
                        {item.verifiedAt ? "確認済み" : "未確認"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${item.host}を削除`}
                        onClick={() => void change("remove", item.host)}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <p className="admin-helper">
                      DNSの管理画面で次のTXTレコードを追加してください。サブドメインは個別に確認します。
                    </p>
                    <dl className="dns-record">
                      <div>
                        <dt>種類</dt>
                        <dd>TXT</dd>
                      </div>
                      <div>
                        <dt>ホスト名</dt>
                        <dd>
                          <code>{item.recordName}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${item.host}のホスト名をコピー`}
                            onClick={() => void copy(item.recordName)}
                          >
                            <Copy size={14} />
                          </Button>
                        </dd>
                      </div>
                      <div>
                        <dt>値</dt>
                        <dd>
                          <code>{item.recordValue}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${item.host}のTXT値をコピー`}
                            onClick={() => void copy(item.recordValue)}
                          >
                            <Copy size={14} />
                          </Button>
                        </dd>
                      </div>
                    </dl>
                    <p className="admin-helper">
                      DNSサービスによってホスト名は「_wsi」のみを入力します。表示した完全な名前になることを確認してください。反映には時間がかかる場合があります。
                    </p>
                    {item.expiresAt && (
                      <p className="admin-helper">
                        初回確認期限：{new Date(item.expiresAt).toLocaleString("ja-JP")}
                        。期限切れの場合は削除して登録し直してください。
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void change("verify", item.host)}
                    >
                      {busy ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      DNSを確認
                    </Button>
                  </article>
                ))}
              </div>
              {!settings.domains.length && (
                <p className="admin-empty">
                  まだドメインがありません。自社のドメインを登録すると確認コードを表示します。
                </p>
              )}
              <form
                className="admin-add"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void change("add", domain);
                }}
              >
                <label className="input-label" htmlFor="visitor-domain">
                  自社のドメインまたはURL
                </label>
                <div className="admin-input-row">
                  <div className="url-input-wrap">
                    <Globe2 size={17} />
                    <input
                      id="visitor-domain"
                      value={domain}
                      onChange={(event) => setDomain(event.target.value)}
                      placeholder="example.com または https://example.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      maxLength={2048}
                      disabled={busy}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !permission || settings.domains.length >= MAX_DOMAINS}
                  >
                    <Plus size={15} />
                    確認コードを発行
                  </Button>
                </div>
                <label className="consent admin-permission">
                  <input
                    type="checkbox"
                    checked={permission}
                    onChange={(event) => setPermission(event.target.checked)}
                    disabled={busy}
                  />
                  このドメインを管理する権限と、サイトを診断する許可があります
                </label>
              </form>
              <p className="visitor-quota">
                診断残り：10分枠 {settings.limits.remainingScans} / 5回・本日（UTC）
                {settings.limits.dailyRemaining} / 30回。接続失敗も回数に含みます。
              </p>
            </>
          )}
        </>
      )}
      {error && (
        <p className="admin-error" role="alert">
          <CircleAlert size={15} />
          {error}
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => void refresh()}
          >
            再読み込み
          </button>
        </p>
      )}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}
      <p className="setup-permission-note">
        DNS確認はドメインの管理権限を確認するものです。診断の許可を得たサイトだけをご利用ください。診断時にもTXTレコードを再確認するため、利用中は削除しないでください。確認済みでも内部IPへの接続は拒否します。
      </p>
    </section>
  );
}
