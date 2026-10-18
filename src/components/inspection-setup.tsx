"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import type { AdminStatus, HostSettings } from "@/lib/admin/types";
import { MAX_ALLOWED_HOSTS } from "@/lib/admin/types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? "設定を取得できませんでした。再実行してください。");
  return data as T;
}

export function InspectionSetup({
  onAvailabilityChange,
  onLogout,
}: {
  onAvailabilityChange: (enabled: boolean) => void;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [settings, setSettings] = useState<HostSettings | null>(null);
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState("");
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    onAvailabilityChange(false);
    try {
      const next = await call<AdminStatus>("/api/admin/session");
      setStatus(next);
      setSettings(null);
      if (next.authenticated && next.storageConfigured) {
        const saved = await call<HostSettings>("/api/admin/hosts");
        setSettings(saved);
        onAvailabilityChange(saved.hosts.length > 0);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "設定を取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }, [onAvailabilityChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await call("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await refresh();
    } catch (caught) {
      setPassword("");
      setError(caught instanceof Error ? caught.message : "ログインできませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await call("/api/admin/session", { method: "DELETE" });
      setStatus((previous) => (previous ? { ...previous, authenticated: false } : previous));
      setSettings(null);
      setDomain("");
      setPermission(false);
      onAvailabilityChange(false);
      onLogout();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログアウトできませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function save(hosts: string[], adding: boolean) {
    if (!settings) return;
    setBusy(true);
    setError("");
    setMessage("");
    onAvailabilityChange(false);
    try {
      const saved = await call<HostSettings>("/api/admin/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hosts,
          revision: settings.revision,
          authorized: adding && permission,
        }),
      });
      setSettings(saved);
      onAvailabilityChange(saved.hosts.length > 0);
      setDomain("");
      setPermission(false);
      setMessage(
        adding
          ? "許可ドメインを保存しました。すぐに診断できます。"
          : "許可ドメインを削除しました。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const ready = status?.authConfigured && status.storageConfigured;
  return (
    <section
      className={`inspection-setup ${status?.authenticated ? "setup-configured" : ""}`}
      aria-label="許可ドメインの管理"
    >
      <div className="setup-heading">
        <ShieldCheck size={20} aria-hidden="true" />
        <h3>ブラウザで許可ドメインを管理</h3>
        {status?.authenticated && (
          <span className="admin-session-label">
            <Check size={12} />
            管理者
          </span>
        )}
      </div>
      <p id="inspection-setup-summary">
        自社または明示的な診断許可のあるドメインを登録してください。保存後すぐに反映され、ドメインの変更にファイル編集・再デプロイは不要です。
      </p>
      {!status && busy && (
        <p className="admin-loading">
          <LoaderCircle className="spin" size={15} />
          管理者設定を確認しています…
        </p>
      )}
      {status && !ready && (
        <details className="setup-details" open>
          <summary>初回だけ：Vercelダッシュボードで準備する</summary>
          <ol className="setup-steps">
            <li>
              <strong>Private Blobを接続</strong>
              <p>
                Vercelのプロジェクト →
                StorageでBlobストアを作成し、アクセスをPrivateにしてプロジェクトに接続します。OIDC接続情報、または読み書きトークンを利用します。
              </p>
            </li>
            <li>
              <strong>管理者パスワードを設定</strong>
              <p>
                Settings → Environment
                VariablesにADMIN_PASSWORDを追加します。32文字以上のランダムで推測されにくい値を設定し、初回の再デプロイを行ってください。
              </p>
            </li>
            <li>
              <strong>この画面でログインしてドメインを登録</strong>
              <p>
                以後は、この管理画面だけで追加・削除できます。ローカルでの作業は必要ありません。
              </p>
            </li>
          </ol>
          <a
            className="text-link"
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Vercelダッシュボードを開く
            <ExternalLink size={12} />
          </a>
          <p className="setup-hosting">
            初期設定の状態：管理者認証 {status.authConfigured ? "設定済み" : "未設定（32文字以上）"}{" "}
            / 保存先 {status.storageConfigured ? "接続情報あり" : "未接続"}
          </p>
        </details>
      )}
      {status && !status.authenticated && (
        <form className="admin-login" onSubmit={login}>
          <label className="input-label" htmlFor="admin-password">
            管理者パスワード
          </label>
          <div className="admin-input-row">
            <div className="url-input-wrap">
              <LockKeyhole size={17} />
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                placeholder="Vercelで設定した管理者パスワード"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={32}
                maxLength={512}
                disabled={busy || !ready}
              />
            </div>
            <Button size="sm" type="submit" disabled={busy || !ready}>
              {busy ? <LoaderCircle className="spin" size={14} /> : <LockKeyhole size={14} />}
              管理者ログイン
            </Button>
          </div>
          <p className="admin-helper">
            この運営者用の設定変更には管理者パスワードが必要です。訪問者は「自分のドメインを診断」からGitHubでログインしてください。
          </p>
        </form>
      )}
      {status?.authenticated && (
        <>
          <div className="admin-toolbar">
            <span>
              許可ドメイン {settings?.hosts.length ?? "—"} / {MAX_ALLOWED_HOSTS}件
            </span>
            <div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setMessage("");
                  void refresh();
                }}
                disabled={busy}
              >
                <RefreshCw size={13} />
                設定を再読み込み
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={logout} disabled={busy}>
                <LogOut size={13} />
                ログアウト
              </Button>
            </div>
          </div>
          {settings && (
            <>
              <ul className="allowed-host-list" aria-label="登録済みの許可ドメイン">
                {settings.hosts.map((host) => (
                  <li key={host}>
                    <Globe2 size={15} />
                    <code>{host}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={`${host}を削除`}
                      onClick={() =>
                        void save(
                          settings.hosts.filter((item) => item !== host),
                          false,
                        )
                      }
                      disabled={busy}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
              {settings.hosts.length === 0 && (
                <p className="admin-empty">
                  まだドメインが登録されていません。下のフォームから追加してください。
                </p>
              )}
              <form
                className="admin-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save([...settings.hosts, domain], true);
                }}
              >
                <label className="input-label" htmlFor="allowed-domain">
                  許可するドメインまたはURL
                </label>
                <div className="admin-input-row">
                  <div className="url-input-wrap">
                    <Globe2 size={17} />
                    <input
                      id="allowed-domain"
                      value={domain}
                      onChange={(event) => setDomain(event.target.value)}
                      placeholder="example.com または https://example.com"
                      required
                      maxLength={2048}
                      autoCapitalize="none"
                      autoCorrect="off"
                      disabled={busy}
                    />
                  </div>
                  <Button
                    size="sm"
                    type="submit"
                    disabled={busy || !permission || settings.hosts.length >= MAX_ALLOWED_HOSTS}
                  >
                    <Plus size={15} />
                    追加して保存
                  </Button>
                </div>
                <p className="admin-helper">
                  URLを入力した場合はドメイン名のみを登録します。サブドメインは個別に登録してください。
                </p>
                <label className="consent admin-permission">
                  <input
                    type="checkbox"
                    checked={permission}
                    onChange={(event) => setPermission(event.target.checked)}
                    disabled={busy}
                  />
                  追加するドメインを所有している、または診断の許可を得ています
                </label>
              </form>
            </>
          )}
        </>
      )}
      {error && (
        <p className="admin-error" role="alert">
          <CircleAlert size={15} />
          {error}
          <button
            className="text-link"
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
          >
            再読み込み
          </button>
        </p>
      )}
      {message && (
        <p className="admin-success" role="status">
          <Check size={15} />
          {message}
        </p>
      )}
      <p className="setup-permission-note">
        登録は所有権や相手の承諾を自動証明するものではありません。許可のないサイトは登録しないでください。ドメイン登録自体は診断対象に通信せず、診断開始時にGETを1回送ります。
      </p>
    </section>
  );
}
