"use client";
import { ArrowRight, FileCheck2, Fingerprint, LockKeyhole, Play, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

export function Guide({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="content-page">
      <span className="eyebrow">SECURITY HANDBOOK</span>
      <h1>
        設定を知ることから、
        <br />
        <span>安全なWebへ。</span>
      </h1>
      <p className="page-lead">診断の見方と、改善に取り組む順番をまとめました。</p>
      <div className="guide-grid">
        {[
          {
            icon: LockKeyhole,
            title: "1. まず、接続を保護する",
            text: "HTTPSと有効なTLS証明書が基本です。HTTPで提供している場合は、ホスティングサービスで証明書を有効にしてください。HTTPSが安定したら、HSTSによる接続強制を検討します。",
          },
          {
            icon: ShieldCheck,
            title: "2. ブラウザにルールを伝える",
            text: "CSPはスクリプトなどの読み込み先を制限します。frame-ancestorsは他サイトへの埋め込みを防ぎ、nosniffはファイル形式の誤認を防ぎます。設定はページを壊すこともあるため、検証環境で確認してから反映しましょう。",
          },
          {
            icon: Fingerprint,
            title: "3. Cookieの用途を確認する",
            text: "セッションCookieにはSecure・HttpOnly・SameSiteが基本です。ただしJavaScriptで読むCookieや外部認証との連携では要件が異なります。要確認という結果は、その用途を確認するきっかけです。",
          },
          {
            icon: FileCheck2,
            title: "4. 結果は、次のアクションに",
            text: "問題ありは優先して見直し、要確認は用途や設定の妥当性を調べます。該当なしは対象の機能がない場合、判定不可は情報を取得できない場合です。良好でもサイト全体が安全という意味ではありません。",
          },
        ].map((item) => (
          <article className="panel guide-card" key={item.title}>
            <item.icon size={25} />
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <div className="guide-cta">
        <span>実際の表示を見ながら学んでみましょう。</span>
        <Button onClick={onDemo}>
          <Play size={14} />
          デモを試す
          <ArrowRight size={15} />
        </Button>
      </div>
      <div className="panel guide-card">
        <h2>設定例を使うときの注意</h2>
        <p>
          診断詳細の設定例は出発点です。CSPの読み込み元、HSTSのサブドメインへの影響、Cookieを使う外部サービスとの互換性を確認し、テスト環境で動作を確かめてください。各項目から公式ドキュメントも参照できます。
        </p>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section className="content-page">
      <span className="eyebrow">ABOUT THE INSPECTOR</span>
      <h1>
        セキュリティの第一歩を、
        <br />
        <span>誰にでも。</span>
      </h1>
      <p className="page-lead">
        Web Security Inspectorは、公開設定をわかりやすく読み解く学習・確認ツールです。
      </p>
      <div className="panel about-panel">
        <h2>
          <ShieldCheck size={22} />
          安全に確認するための設計
        </h2>
        <ul>
          <li>訪問者はGitHubでログインし、自分のアカウントのドメインだけを管理できます。</li>
          <li>
            自社のDNSにTXTレコードを追加して管理権限を確認します。診断時にもDNSを再確認します。
          </li>
          <li>運営者は、従来の管理者ログインと許可ドメイン設定も利用できます。</li>
          <li>登録内容はVercel Private Blobに保存し、診断ごとに最新の設定を確認します。</li>
          <li>未ログインの利用者は、実サイト診断や許可設定の変更を行えません。</li>
          <li>
            未確認のドメイン、他ユーザーのドメイン、未登録のサブドメインへの診断通信は拒否します。
          </li>
          <li>
            訪問者の診断は10分あたり5回・UTCの1日あたり30回までです。回数は保存先で共有します。
          </li>
          <li>プライベートIPや内部ネットワークへの接続を防ぎます。</li>
          <li>単一URLへのGETのみを行い、リダイレクトを追跡しません。</li>
          <li>対象サイトへCookieや認証情報を送信しません。</li>
          <li>通信は5秒、応答本文は1MBを上限に制限します。</li>
          <li>デモはローカルの固定データを使用し、外部サイトに接続しません。</li>
        </ul>
        <h2>検査の範囲と限界</h2>
        <p>
          静的な公開設定を確認するツールであり、包括的な侵入テストではありません。脆弱性への攻撃、ポートスキャン、総当たり、サイト内の巡回は行いません。XSSやSQLインジェクションなどの脆弱性の有無、ログイン後の状態、証明書の失効や暗号方式の網羅的な検証は対象外です。
        </p>
        <h2>データの取り扱い</h2>
        <p>
          GitHubの利用者IDをハッシュ化した識別子と、自分のドメイン・DNS確認コード・利用回数をPrivate
          Blobに保存します。メールアドレス、GitHubのアクセストークン、診断結果は保存しません。Cookieの値や応答本文は結果に含めません。ログアウトすると画面上の入力URLと診断結果を消去します。診断対象のサーバーには接続元IPとリクエストが伝わり、ホスティング基盤がアクセス記録を扱う場合があります。秘密情報をURLやパスに含めないでください。
        </p>
        <p>
          PDFは表示中の診断結果からブラウザ内で作成します。PDF・JSONをダウンロードしたファイルは、お使いの端末に残り、ログアウトしても消去されません。
        </p>
        <div className="stack-tags">
          <Badge>Next.js</Badge>
          <Badge>TypeScript</Badge>
          <Badge>Tailwind CSS</Badge>
          <Badge>shadcn/ui</Badge>
          <Badge>guarded-fetch</Badge>
        </div>
      </div>
    </section>
  );
}
