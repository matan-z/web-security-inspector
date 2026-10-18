import type { CheckResult, CheckStatus, InspectionResult } from "./types";

interface Snapshot {
  url: string;
  headers: Headers;
  cookies: string[];
  httpStatus: number;
  tls: "verified" | "failed" | "unknown" | "na";
  durationMs: number;
  inspectedAt?: string;
  mode?: "demo" | "live";
}

const MDN = "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/";
const clipped = (value: string | null) => (value ? value.slice(0, 2048) : "ヘッダーなし");

export function evaluateSnapshot(snapshot: Snapshot): InspectionResult {
  const { headers, cookies, tls } = snapshot;
  const https = new URL(snapshot.url).protocol === "https:";
  const checks: CheckResult[] = [];
  const add = (check: CheckResult) => checks.push(check);
  add({
    id: "https",
    name: "HTTPS",
    subtitle: "通信の暗号化",
    category: "transport",
    severity: "high",
    status: https ? "pass" : "fail",
    summary: https ? "HTTPSで暗号化された接続です" : "HTTPのため通信が暗号化されていません",
    observed: new URL(snapshot.url).protocol,
    meaning: "ブラウザとサーバー間の通信を暗号化し、途中で内容を読み取られにくくします。",
    risk: "HTTPでは入力内容やCookieを第三者に盗み見られたり、通信を書き換えられたりする可能性があります。",
    recommendation:
      "有効な証明書を用意し、サイトをHTTPSで提供してください。HTTPからHTTPSへの転送設定は別途確認が必要です。",
    reference: "https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security",
  });
  add({
    id: "tls",
    name: "TLS証明書",
    subtitle: "証明書の信頼性",
    category: "transport",
    severity: "high",
    status: !https ? "na" : tls === "verified" ? "pass" : tls === "failed" ? "fail" : "unknown",
    summary: !https
      ? "HTTPのためTLS接続の対象外です"
      : tls === "verified"
        ? "接続時の証明書検証に成功しました"
        : tls === "failed"
          ? "接続時の証明書検証に失敗しました"
          : "証明書の検証結果を取得できませんでした",
    observed: !https
      ? "TLS接続なし"
      : tls === "verified"
        ? "Node.jsの標準検証：証明書チェーン・ホスト名・有効期間を検証"
        : "検証結果なし",
    meaning:
      "接続先がそのドメインの正規のサーバーであることを、信頼された認証局を通じて確認します。",
    risk: "無効な証明書やホスト名の不一致は、なりすましや利用者の接続エラーにつながります。",
    recommendation:
      "信頼された認証局の証明書を使用し、証明書チェーンと自動更新を設定してください。この項目では失効状態、暗号スイート、TLS全バージョンを検査しません。",
    reference: "https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert",
  });

  const csp = headers.get("content-security-policy");
  const directives = new Map<string, string[]>();
  let duplicateCsp = false;
  csp?.split(";").forEach((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) {
      if (directives.has(name.toLowerCase())) duplicateCsp = true;
      else directives.set(name.toLowerCase(), sources);
    }
  });
  const script = directives.get("script-src") ?? directives.get("default-src");
  const hasNonceOrHash = script?.some((s) =>
    /^'(nonce-[A-Za-z0-9+/_-]+={0,2}|sha(256|384|512)-[A-Za-z0-9+/_-]+={0,2})'$/.test(s),
  );
  const weakScript =
    script?.some(
      (s) =>
        ["*", "http:", "https:", "data:", "'unsafe-eval'"].includes(s) || s.startsWith("http://"),
    ) ||
    (script?.includes("'unsafe-inline'") && !hasNonceOrHash);
  const recognizedScript = script?.every(
    (s) =>
      ["'self'", "'none'", "'unsafe-inline'", "'strict-dynamic'", "'report-sample'"].includes(s) ||
      /^'(nonce-[A-Za-z0-9+/_-]+={0,2}|sha(256|384|512)-[A-Za-z0-9+/_-]+={0,2})'$/.test(s) ||
      /^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[a-z0-9_./%-]*)?$/i.test(s),
  );
  const object = directives.get("object-src") ?? directives.get("default-src");
  const base = directives.get("base-uri");
  const restrictiveBase = base?.length === 1 && ["'self'", "'none'"].includes(base[0]);
  // This is a conservative heuristic, not a browser CSP parser or a proof of XSS safety.
  const suspiciousCsp =
    !!csp &&
    (csp.includes(",") ||
      duplicateCsp ||
      directives.has("script-src-elem") ||
      directives.has("script-src-attr"));
  const cspStatus: CheckStatus = !csp
    ? "fail"
    : !script?.length ||
        !recognizedScript ||
        weakScript ||
        suspiciousCsp ||
        (script.includes("'none'") && script.length > 1) ||
        object?.join(" ") !== "'none'" ||
        !restrictiveBase
      ? "warn"
      : "pass";
  add({
    id: "csp",
    name: "Content-Security-Policy",
    subtitle: "読み込み元の制限",
    category: "headers",
    severity: "high",
    status: cspStatus,
    summary: !csp
      ? "コンテンツの読み込み制限が設定されていません"
      : cspStatus === "pass"
        ? "スクリプト・オブジェクト・ベースURLの基本制限を確認しました"
        : "読み込み元や実行許可を見直す必要があります",
    observed:
      clipped(csp) +
      (!csp && headers.has("content-security-policy-report-only")
        ? "（Report-Onlyのみ：強制力なし）"
        : ""),
    meaning: "スクリプトや画像などを読み込める場所を指定し、意図しないコードの実行を抑えます。",
    risk: "未設定や広すぎる許可は、クロスサイトスクリプティング（XSS）発生時の被害を拡大させます。",
    recommendation:
      "script-src（またはdefault-src）を限定し、object-src 'none' と base-uri 'self' を設定します。unsafe-evalや広い許可を避け、nonce/hashを検討してください。複数ポリシーや個別スクリプト指令は手動で確認してください。良好でもCSPの完全な妥当性は保証しません。",
    example:
      "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    reference: MDN + "Content-Security-Policy",
  });

  const hsts = headers.get("strict-transport-security");
  const ages =
    hsts
      ?.split(";")
      .map((s) => s.trim())
      .filter((s) => /^max-age\s*=/i.test(s)) ?? [];
  const ageMatch = ages[0]?.match(/^max-age\s*=\s*(?:"(\d+)"|(\d+))$/i);
  const age = ageMatch ? Number(ageMatch[1] ?? ageMatch[2]) : NaN;
  const hstsStatus: CheckStatus = !https
    ? "na"
    : !hsts || ages.length !== 1 || !Number.isSafeInteger(age) || age <= 0
      ? "fail"
      : age < 15_552_000
        ? "warn"
        : "pass";
  add({
    id: "hsts",
    name: "Strict-Transport-Security",
    subtitle: "HTTPS接続の強制",
    category: "headers",
    severity: "high",
    status: hstsStatus,
    summary: !https
      ? "HTTP上のHSTSはブラウザに無視されます"
      : hstsStatus === "pass"
        ? "180日以上のHTTPS接続強制を確認しました"
        : hstsStatus === "warn"
          ? "HTTPS接続を強制する有効期間が短めです"
          : "有効なHTTPS接続の強制設定がありません",
    observed: clipped(hsts),
    meaning: "一度アクセスしたブラウザに、一定期間HTTPSだけで接続するよう伝えます。",
    risk: "HTTPへ誘導されることで、暗号化されていない通信に切り替わる可能性があります。",
    recommendation:
      "HTTPSが安定稼働した後、max-ageを15552000秒（180日）以上に設定します。includeSubDomainsやpreloadは、すべてのサブドメインへの影響を確認してから追加してください。",
    example: "Strict-Transport-Security: max-age=31536000",
    reference: MDN + "Strict-Transport-Security",
  });

  const nosniff = headers.get("x-content-type-options");
  add({
    id: "nosniff",
    name: "X-Content-Type-Options",
    subtitle: "ファイル形式の誤認防止",
    category: "headers",
    severity: "medium",
    status: nosniff?.trim().toLowerCase() === "nosniff" ? "pass" : "fail",
    summary:
      nosniff?.trim().toLowerCase() === "nosniff"
        ? "ブラウザによるファイル形式の推測を禁止しています"
        : "有効なnosniff設定がありません",
    observed: clipped(nosniff),
    meaning: "サーバーが指定したファイル形式をブラウザに守らせる設定です。",
    risk: "テキストやアップロードされたファイルがスクリプトとして誤って実行される可能性があります。",
    recommendation: "nosniffを設定し、レスポンスのContent-Typeも正しく指定してください。",
    example: "X-Content-Type-Options: nosniff",
    reference: MDN + "X-Content-Type-Options",
  });

  const xfo = headers.get("x-frame-options");
  const ancestors = directives.get("frame-ancestors");
  const safeAncestors =
    !!ancestors?.length &&
    !csp?.includes(",") &&
    ((ancestors.length === 1 && ["'none'", "'self'"].includes(ancestors[0])) ||
      ancestors.every((s) => s === "'self'" || /^https:\/\/[a-z0-9.-]+(?::443)?\/?$/i.test(s)));
  const safeXfo = /^(deny|sameorigin)$/i.test(xfo?.trim() ?? "");
  // An invalid or broad frame-ancestors can override XFO in modern browsers.
  const framingStatus: CheckStatus = ancestors
    ? safeAncestors
      ? "pass"
      : "warn"
    : safeXfo
      ? "pass"
      : "fail";
  add({
    id: "framing",
    name: "フレーム埋め込み制御",
    subtitle: "X-Frame-Options / frame-ancestors",
    category: "headers",
    severity: "medium",
    status: framingStatus,
    summary:
      framingStatus === "pass"
        ? "他サイトからの埋め込みを制限しています"
        : framingStatus === "warn"
          ? "frame-ancestorsの許可範囲を確認してください"
          : "他サイトからの埋め込みを制限する設定がありません",
    observed: `X-Frame-Options: ${clipped(xfo)}\nframe-ancestors: ${ancestors?.join(" ") || "なし"}`,
    meaning:
      "自分のページを別サイトのフレーム内に表示できるか制御します。frame-ancestorsはCSPの一部です。",
    risk: "透明な画面を重ね、利用者に意図しない操作をさせるクリックジャッキングにつながります。",
    recommendation:
      "埋め込みが不要ならCSPのframe-ancestors 'none'を設定します。同一サイト内で必要なら'self'を使い、必要に応じてX-Frame-Optionsも設定します。frame-ancestorsはdefault-srcを継承しません。",
    example: "Content-Security-Policy: frame-ancestors 'none'\nX-Frame-Options: DENY",
    reference: MDN + "Content-Security-Policy/frame-ancestors",
  });

  const referrer = headers.get("referrer-policy");
  const referrerValues = [
    "no-referrer",
    "no-referrer-when-downgrade",
    "origin",
    "origin-when-cross-origin",
    "same-origin",
    "strict-origin",
    "strict-origin-when-cross-origin",
    "unsafe-url",
  ];
  const effective = referrer
    ?.toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => referrerValues.includes(s))
    .at(-1);
  const refStatus: CheckStatus =
    effective &&
    ["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"].includes(
      effective,
    )
      ? "pass"
      : effective === "unsafe-url"
        ? "fail"
        : "warn";
  add({
    id: "referrer",
    name: "Referrer-Policy",
    subtitle: "参照元情報の保護",
    category: "headers",
    severity: "low",
    status: refStatus,
    summary:
      refStatus === "pass"
        ? "外部へ送る参照元情報を制限しています"
        : effective === "unsafe-url"
          ? "外部に完全なURLを送信する設定です"
          : "参照元情報の明示的な制限を確認してください",
    observed: clipped(referrer),
    meaning: "リンク先に送信される、元ページのURL情報の範囲を指定します。",
    risk: "URLに含まれる検索語や識別子が、外部サイトに伝わる可能性があります。未設定時はブラウザの既定値に依存します。",
    recommendation:
      "用途に応じてstrict-origin-when-cross-originまたはno-referrerを明示してください。",
    example: "Referrer-Policy: strict-origin-when-cross-origin",
    reference: MDN + "Referrer-Policy",
  });

  const permissions = headers.get("permissions-policy");
  const sensitive = ["camera", "microphone", "geolocation"];
  const restrictedPermissions = sensitive.every((feature) => {
    const entries =
      permissions
        ?.split(",")
        .filter((part) => new RegExp(`^\\s*${feature}\\s*=`, "i").test(part)) ?? [];
    return (
      entries.length === 1 &&
      new RegExp(`^\\s*${feature}=\\(\\s*(?:self\\s*)?\\)\\s*$`, "i").test(entries[0])
    );
  });
  add({
    id: "permissions",
    name: "Permissions-Policy",
    subtitle: "ブラウザ機能へのアクセス制御",
    category: "headers",
    severity: "low",
    status: restrictedPermissions ? "pass" : "warn",
    summary: restrictedPermissions
      ? "カメラ・マイク・位置情報へのアクセスを制限しています"
      : "カメラ・マイク・位置情報の利用範囲を確認してください",
    observed: clipped(permissions),
    meaning: "カメラやマイクなどのブラウザ機能を、どのページや埋め込み先が使えるか制御します。",
    risk: "不要な機能を許可すると、埋め込まれたコンテンツなどが機能を利用できる範囲が広がります。利用者への権限確認とは別の制御です。",
    recommendation:
      "利用しない機能は空の許可リストで無効化し、必要な機能だけselfなどに限定してください。ここでは主要3機能のみ簡易評価します。",
    example: "Permissions-Policy: camera=(), microphone=(), geolocation=()",
    reference: MDN + "Permissions-Policy",
  });

  // Never retain cookie values. All cookie checks concern only this response.
  const cookieAttributes = cookies.map((cookie) =>
    cookie
      .split(";")
      .slice(1)
      .map((s) => s.trim().toLowerCase()),
  );
  const cookieDefinitions = [
    {
      id: "cookie-secure",
      name: "Cookie / Secure",
      subtitle: "暗号化された通信に限定",
      severity: "high" as const,
      valid: (attrs: string[]) => attrs.includes("secure"),
      meaning: "Secure属性が付いたCookieは、原則HTTPS接続でのみ送信されます。",
      risk: "Secure属性がないと、HTTP接続を経由したときにCookieを盗まれる可能性があります。",
      recommendation: "HTTPSで発行するCookieにSecureを付与してください。",
      example: "Set-Cookie: session=<value>; Secure; HttpOnly; SameSite=Lax",
    },
    {
      id: "cookie-httponly",
      name: "Cookie / HttpOnly",
      subtitle: "JavaScriptからの読み取り制限",
      severity: "medium" as const,
      valid: (attrs: string[]) => attrs.includes("httponly"),
      meaning: "HttpOnly属性は、ブラウザ内のJavaScriptからCookieの値を読み取れないようにします。",
      risk: "XSSが発生した場合、セッションCookieが読み取られる可能性があります。ただしJavaScriptから使うCookieには付けられない場合があります。",
      recommendation:
        "認証・セッションCookieにはHttpOnlyを設定します。用途によってJavaScriptでの読み取りが必要か手動で確認してください。",
      example: "Set-Cookie: session=<value>; Secure; HttpOnly; SameSite=Lax",
    },
    {
      id: "cookie-samesite",
      name: "Cookie / SameSite",
      subtitle: "別サイトからの送信制限",
      severity: "medium" as const,
      valid: (attrs: string[]) => {
        const values = attrs.filter((a) => a.startsWith("samesite="));
        return values.length === 1 && /^samesite=(lax|strict)$/.test(values[0]);
      },
      meaning: "別サイトからのリクエストにCookieを添付する条件を制御します。",
      risk: "意図しない外部サイトからCookie付きリクエストが届き、CSRFのリスクが高まる可能性があります。SameSiteだけでCSRFを完全に防げるわけではありません。",
      recommendation:
        "原則LaxまたはStrictを明示します。外部連携などでNoneが必要ならSecureを必須にし、CSRFトークンなども併用してください。",
      example: "Set-Cookie: session=<value>; Secure; HttpOnly; SameSite=Lax",
    },
  ];
  cookieDefinitions.forEach(({ valid, ...definition }) => {
    const validCount = cookieAttributes.filter(valid).length;
    const invalidNone =
      definition.id === "cookie-samesite" &&
      cookieAttributes.some((a) => a.includes("samesite=none") && !a.includes("secure"));
    const status: CheckStatus = !cookies.length
      ? "na"
      : validCount === cookies.length
        ? "pass"
        : definition.id === "cookie-httponly" ||
            (definition.id === "cookie-samesite" && !invalidNone)
          ? "warn"
          : "fail";
    add({
      ...definition,
      category: "cookies",
      status,
      summary: !cookies.length
        ? "このレスポンスでCookieは発行されていません"
        : status === "pass"
          ? `全${cookies.length}件のCookieで推奨属性を確認しました`
          : `${cookies.length - validCount}件のCookieの属性を確認してください`,
      observed: !cookies.length
        ? "Set-Cookieなし"
        : `${cookies.length}件中${validCount}件が推奨設定（Cookieの値は保存・表示しません）`,
      reference: MDN + "Set-Cookie",
    });
  });

  return {
    version: 1,
    mode: snapshot.mode ?? "live",
    url: snapshot.url,
    inspectedAt: snapshot.inspectedAt ?? new Date().toISOString(),
    durationMs: snapshot.durationMs,
    httpStatus: snapshot.httpStatus,
    redirected: snapshot.httpStatus >= 300 && snapshot.httpStatus < 400,
    checks,
  };
}
