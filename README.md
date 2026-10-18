# Web Security Inspector

**Webサイトの安全を、もっと身近に。**

自社WebサイトのHTTPS、TLS証明書、セキュリティヘッダー、Cookieの公開設定を確認し、リスクと改善方法を日本語で表示するWebアプリです。登録不要のデモを用意しているため、環境変数を設定しなくても機能を体験できます。

> 静的な公開設定を確認するツールであり、包括的な侵入テストではありません。参考スコアや「良好」の結果は、サイト全体の安全性を保証しません。

> **許可ドメインはブラウザの管理画面で設定します。** 管理者ログイン → ドメインまたはURLを入力 → 所有権・診断許可を確認 → 「追加して保存」。変更はすぐに反映され、ローカルファイルの編集・ドメイン変更時の再デプロイは不要です。初回のみ、VercelダッシュボードでPrivate Blobと管理者パスワードを設定してください。[Vercelの初期設定](#vercelへのデプロイと初期設定)

![ダッシュボード](docs/screenshots/dashboard-desktop.png)

<details>
<summary>デモの診断結果・スマートフォン表示</summary>

![診断結果と改善方法](docs/screenshots/demo-desktop.png)

<img src="docs/screenshots/dashboard-mobile.png" alt="スマートフォンのダッシュボード" width="390" />

</details>

## 主な機能

- 日本語UI、ダークテーマ、PC・スマートフォンに対応
- 外部サイトと通信しない固定データのデモ（登録不要）
- HTTPS・TLS・ヘッダー・Cookieの11項目の診断
- 良好・要確認・問題あり・該当なし・判定不可を区別
- 重要度、設定値、技術的な意味、リスク、推奨対策、公式資料へのリンク
- 結果・カテゴリでの絞り込みと、詳細の展開
- デモ／実サイトの区別を含むJSONダウンロード
- セキュリティガイドとデータ取り扱いの説明

## 技術スタック

- Next.js 16（App Router / Node.js Route Handler）
- React 19 / TypeScript（strict）
- Tailwind CSS 4
- shadcn/ui方式のローカルコンポーネント（Radix Slot / class-variance-authority）
- lucide-react
- Vercel Labs `guarded-fetch` / undici
- Vitest / Playwright

依存関係の正確なバージョンは`package-lock.json`に固定しています。Node.js 22で動作確認しました。開発・本番ともNext.js公式のWebpack方式を使用し、この実行環境で発生したTurbopackの内部ポート制約を回避しています。データベースやPythonは使いません。

## Ubuntuでのローカル起動

Node.js 22.xとnpmを用意してください。nvmを使う場合は`.nvmrc`を利用できます。

```bash
# このREADMEのあるディレクトリで実行
nvm install
nvm use
npm ci
npm run dev
```

`http://localhost:3000`を開き、「デモを試す」をクリックします。nvm以外でNode.jsを導入済みなら、最初の2行は不要です。未ログイン、または許可ドメインが未登録の状態では、実サイト診断ボタンが無効になり、APIも通信を拒否します。デモの利用に環境変数は不要です。

本番モードをローカルで確認する場合：

```bash
npm run build
npm start
```

## ブラウザからの実サイト診断設定

初回のVercel設定が済んだら、アプリの「ブラウザで許可ドメインを管理」から操作します。

1. Vercelで設定した管理者パスワードでログインします。
2. 所有または明示的な許可のあるドメイン、またはURLを入力します。
3. 所有権・診断許可の確認にチェックを入れ、「追加して保存」を押します。
4. 診断対象URLを入力し、診断の許可確認にチェックを入れて「診断を開始」を押します。
5. 不要なドメインは登録一覧の削除ボタンで削除できます。

URLを貼り付けるとドメイン名のみを登録します。最大10件、完全一致のホスト名だけを許可し、サブドメインは個別に登録します。IPアドレス、内部ホスト、ワイルドカード、認証情報、独自ポートは登録できません。許可ドメインでもDNSが危険なIPを返す場合は診断できません。

登録内容はVercel **Private Blob**の非公開JSONファイルに保存します。データベースは使いません。診断ごとに最新の設定を読み、空の一覧・認証切れ・保存先の障害時は通信を拒否します。ドメインの変更には再デプロイ不要です。削除前にすでに開始していた診断は、その実行を完了する場合があります。

管理者セッションは8時間で失効します。管理者パスワードを変更して再デプロイすると既存セッションも無効になります。パスワードや保存用トークンはクライアントへ配布せず、ログイン状態は署名付きHttpOnly Cookieで管理します。

ログアウトすると、入力URL・診断結果・許可確認を画面から消去し、実行中の診断取得も中止します。ダウンロード済みのJSONファイルは消去しません。署名付きセッションはサーバーに保存しないため、コピー・窃取されたCookieはログアウトだけでは失効しません。漏えいが疑われる場合は管理者パスワードを変更し、再デプロイしてください。

**旧版からの変更：** ALLOWED_HOSTS環境変数は読み込みません。既存の許可ドメインは管理画面から登録し直してください。ブラウザのlocalStorageやサーバーの一時メモリに許可リストを置く実装ではありません。ログアウト後も設定は保存先に残り、次回の管理者ログインで読み込めます。

![ブラウザの管理画面（自動テスト用のサンプルドメイン）](docs/screenshots/admin-settings-desktop.png)

デモ用のdemo.example.comと管理画面の画像のowned.exampleは架空の表示対象です。デモ操作・管理画面のテストでそれらのサイトへ通信することはありません。

### 許可のないサイトを登録・診断するリスク

許可ドメイン一覧はアプリ管理者が決める通信先リストです。ドメインの所有権や相手の承諾を自動検証する仕組みではなく、チェックボックスも自己申告です。許可のないサイトを追記しても、診断の許可を得たことにはなりません。

管理画面でドメインを登録するだけでは対象サイトに通信しません。実際に診断を開始すると、サーバーから対象URLへGETを1回送ります。アクセス元IP、User-Agent、時刻などが相手のログに残る可能性があります。運用上のリスクとして、監視による検知、アクセス遮断、規約上の問題や問い合わせにつながることが考えられます。繰り返し実行やGETで処理が走るURLでは、負荷や意図しない動作のリスクもあります。HTTP上のGETは読み取りを想定していますが、実装上の副作用まで保証するものではありません。[RFC 9110 §9.2.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1)

公開ページの通常のGETやヘッダー確認だけを、一律に不正アクセス罪と断定することはできません。一方で、他人の認証情報の利用やアクセス制御の回避などは別の問題です。違法性や責任は実際の行為、影響、適用される法律・契約によって異なります。[警察庁の解説](https://www.npa.go.jp/bureau/cyber/pdf/1_kaisetsu.pdf)、[不正アクセス禁止法](https://laws.e-gov.go.jp/law/411AC0000000128)

診断する場合は、対象ドメイン・URL、GETによる公開設定確認という方法、実施日時・回数の範囲を所有者と事前に確認してください。自社サイトでも、業務上の権限やホスティング事業者のルールを確認します。学習や動作確認には、外部通信しないデモを利用できます。

## 検査内容

1. **HTTPS**：入力URLの暗号化スキームを確認。HTTPからの自動転送は調査しません。
2. **TLS証明書**：HTTPS接続時にNode.jsの標準検証でチェーン・ホスト名・有効期間を確認。検証を無効にして接続することはありません。
3. **Content-Security-Policy**：強制ポリシーのスクリプト読み込み制限、広すぎる許可、unsafe-inline / unsafe-eval、object-src、base-uriを簡易評価。Report-Onlyだけでは合格にしません。
4. **Strict-Transport-Security**：HTTPS上でmax-ageが有効か確認。0・不正値・重複は問題あり、180日未満は要確認。HTTPでは適用対象外です。
5. **X-Content-Type-Options**：有効なnosniff値を確認。
6. **フレーム埋め込み制御**：CSPのframe-ancestorsまたは有効なX-Frame-Optionsを確認。default-srcをframe-ancestorsの代わりには扱いません。
7. **Referrer-Policy**：有効な値を解析。複数候補がある場合は最後の認識可能な値を評価します。
8. **Permissions-Policy**：カメラ・マイク・位置情報の許可範囲を確認。未設定や広い許可は要確認です。
9. **Cookie / Secure**：応答で発行された全CookieのSecure属性を確認。
10. **Cookie / HttpOnly**：全CookieのHttpOnly属性を確認。JavaScript利用など用途の確認が必要なため、欠落は要確認です。
11. **Cookie / SameSite**：Lax/Strictの明示を推奨。Noneは用途の確認対象、NoneとSecure欠落の併用は問題ありとします。

Cookieが発行されない応答は「該当なし」です。Cookieの値は結果に保存・表示しません。評価器は取得不能な項目の「判定不可」にも対応しますが、実際の接続や本文取得そのものが失敗した場合は結果を生成せず、エラーを表示します。

### スコア

重要度の重みを高=3・中=2・低=1とし、良好=100%・要確認=50%・問題あり=0%で加重平均します。「該当なし」「判定不可」は分母から除外し、有効な評価項目がなければスコアを表示しません。この計算は本ツール独自の参考指標で、外部認証や業界標準の採点ではありません。

### 検査できないこと

- XSS、SQLインジェクション、認証不備など実際の脆弱性の有無
- ログイン後のページ、サイト内巡回、他URL・他ホストの設定
- HTML内meta要素でのポリシー、JavaScriptで発行されるCookie
- CSPの完全な構文検証やサイト固有の実効性、全Permissions-Policy機能
- 証明書失効、暗号スイート、TLS全バージョンの網羅的な検証
- リダイレクト先の設定、HTTPからHTTPSへの強制転送

3xxの場合は転送応答の設定のみを表示します。4xx/5xxも取得した応答として評価し、通常ページとは異なる可能性を画面に表示します。

## セキュリティ設計

実サイト診断の処理順は、同一オリジン確認 → 管理者認証 → 回数制限 → 最大4KBのJSON読み取り → 所有権／許可の確認 → 接続数制限 → Private Blobから最新設定を取得 → 許可ホスト完全一致 → 安全なGET → 設定評価です。

- `guarded-fetch`のDNS事前検査と接続時の検査・IP固定を利用します。単なるDNS検査後の通常fetchにはしません。
- プライベート、ループバック、リンクローカル、CGNAT、危険なIPv6埋め込みアドレスなどを拒否します。
- 許可ホストでもSSRFチェックを省略しません。安全な標準dispatcherを使用します。
- `followRedirects: false`で、転送先には接続しません。
- リクエストはGETのみ。対象サイトにCookieやAuthorizationは送信しません。
- DNS・接続・本文読み取りを含めて5秒、復号後の本文を最大1MiBに制限します。本文は実行せず、結果にも含めません。
- 接続失敗や証明書検証失敗の詳細、内部IP、スタックトレースを画面に返しません。失敗をデモで代用しません。
- `NODE_TLS_REJECT_UNAUTHORIZED=0`の環境では実サイト診断を拒否します。
- APIは同一オリジンのJSON POSTのみ受け付けます。対象への通信はGETです。Origin確認は認証の代わりではありません。
- 1プロセスあたり10リクエスト/60秒、診断の同時実行は2件に制限します。過剰な利用には429とRetry-Afterを返します。
- 診断結果はブラウザのメモリ上で表示し、アプリのDBやlocalStorageには保存しません。ホスティング基盤・診断先サーバーにアクセスログが残る可能性はあります。
- アプリ自体にもnosniff、埋め込み制限、Referrer-Policy、Permissions-Policy、CSPを設定します。Vercel環境ではHSTSも設定します。

**サーバーレスの制限：** 回数制限・同時実行制限はメモリ上の簡易対策です。複数インスタンス間では共有されず、再起動でリセットされます。ログインは1プロセスあたり5回/60秒、認証後の設定保存・診断は合計10回/60秒に制限します。公開運用ではVercel Firewall/WAFでインスタンス横断の制限を追加してください。ポートフォリオの公開デモは管理者未設定でも利用できます。

アプリのCSPはNext.jsのインラインスクリプトとスタイルに対応するためunsafe-inlineを許可しています。nonceを用いた厳格なCSPは今後の改善対象です。

実装時に参照した公式資料：[guarded-fetch](https://github.com/vercel-labs/guarded-fetch)、[MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)、[MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)。

## テスト

```bash
npm test
npm run typecheck
npm run build

# 初回のみChromiumをインストール
npx playwright install chromium
npm run test:e2e
```

Ubuntuでブラウザのシステム依存が不足する場合は、Playwright公式の依存関係導入手順を利用してください。既存のChromeを使う場合は次のように指定できます。

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/google/chrome/chrome npm run test:e2e
```

単体テストではヘッダーの不正値・弱い値、Cookieの複数発行、許可ドメインの完全一致、危険IP、接続時DNS検査、応答サイズ、タイムアウト、転送非追跡、資格情報非送信、APIの拒否処理を確認します。外部サイトへ実際の診断通信は行わず、許可ドメインの応答はモックで検証します。

E2Eサーバーにはテスト専用の管理者パスワードを設定します。本番のパスワードとして使用しないでください。管理画面のE2Eでは実際のログインAPIを使用し、リモート保存先の境界のみをモックします。Private Blobの実接続はこのテストには含みません。PCとスマートフォン相当のChromiumで、デモ、詳細、フィルタ、JSON保存、ナビゲーション、設定なしAPIの拒否、横方向のはみ出しを確認し、`docs/screenshots/`に実画面を保存します。

## Vercelへのデプロイと初期設定

**この初期設定はすべてブラウザで行えます。ローカルの.env.local編集やCLIは不要です。GitHub push・外部公開はユーザーの確認後に行ってください。**

1. GitHubリポジトリをVercelの「Add New → Project」からImportします。Root DirectoryはこのREADMEのあるディレクトリ、Node.jsは22.x、Install Commandはnpm ci、Build Commandはnpm run buildです。
2. VercelプロジェクトのStorageタブでBlobストアを作成し、アクセスを**Private**にしてプロジェクトへ接続します。BLOB_READ_WRITE_TOKENが自動追加されます。専用のストアを利用してください。
3. Settings → Environment Variablesに**ADMIN_PASSWORD**を追加します。32文字以上のランダムで推測されにくいパスワードを設定し、パスワードマネージャーなどで管理してください。PreviewとProductionの両方で管理機能を使う場合は、それぞれに異なるパスワードと専用のPrivate Blobストアを設定してください。同じストアを接続すると許可ドメインが共有されます。管理機能を使わないPreviewには認証情報を設定しません。NEXT_PUBLIC_は付けません。
4. DeployまたはRedeployを行い、初回の保存先・認証設定を反映します。
5. 公開URLを開き、アプリの管理画面でログインしてドメインを登録します。以後のドメイン追加・削除に再デプロイは不要です。

デモだけを公開する場合は、管理者パスワードもBlobも不要です。実サイト診断は無効のまま動作します。管理者ログイン前の利用者には登録ドメインを返しません。保存先の接続が失敗した場合も、旧環境変数やデモ結果で代用しません。

設定ファイルはweb-security-inspector/allowed-hosts-v1.jsonに保存します。読み取りはget(..., { access: 'private', useCache: false })でキャッシュを迂回し、最新の設定を使用します。更新はETagとifMatchで競合を検出し、別画面の変更を無条件に上書きしません。

Private BlobはVercelの利用枠・料金が適用されます。保存データは小さなJSONですが、認証後の設定読み取り・診断・保存でストレージ操作が発生します。必要な利用枠をVercelダッシュボードで確認してください。参考：[Private Blobの作成](https://vercel.com/docs/vercel-blob/private-storage)、[最新設定を取得する方法](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage)。

Route Handlerの最大実行時間は15秒、対象サイトへの診断通信は5秒・1MiBです。Edge Runtimeや静的exportには対応しません。

開発者がローカルで管理機能も確認したい場合だけ、.env.exampleを参考にADMIN_PASSWORDとBLOB_READ_WRITE_TOKENを設定してください。デモには不要です。

## 主なファイル

```text
src/app/                      ページ、全体スタイル、API
src/app/api/inspect/route.ts  入力・許可・悪用防止
src/components/               ダッシュボード、結果詳細、UI部品
src/lib/inspection/evaluate.ts 設定値の評価（ネットワークから独立）
src/lib/inspection/network.ts  安全な外部GETと応答制限
src/lib/inspection/policy.ts   URLと許可ホストの検証
src/lib/admin/                管理者セッションとPrivate Blobへの設定保存
src/app/api/admin/            ログイン・ログアウト・設定API
src/lib/inspection/demo.ts     外部通信のないデモデータ
tests/e2e/                    ブラウザ操作テスト
docs/screenshots/             実画面のスクリーンショット
```

## 今後の改善予定

- nonceによるアプリ自体の厳格なCSP
- CSPの詳細な構文解析と複数ポリシーの実効性評価
- Vercel WAFなどによるインスタンス横断の悪用防止
- Cookieの用途ごとのルールと、より詳しい説明
- 所有者の許可がある検証環境での実接続確認
- アクセシビリティと各ブラウザでの検証の拡充

## GitHub公開前の確認

- 初回コミットの前に、作者名を公開してよい名前にし、作者メールにはGitHubのSettings → Emailsに表示されるnoreplyアドレスを設定してください。プロジェクト内で`git config user.email "自分のnoreplyアドレス"`を実行すると、そのリポジトリだけに適用されます。Web画面でメールを非公開にするだけでは、ローカルGitの作者メールは変わりません。[GitHub公式の設定方法](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
- .env.local、.env.production、.vercel、.awsなどは.gitignoreで除外しています。`git add -f`で除外を解除せず、コミット対象を確認してください。.env.exampleには実際の値を入れません。
- テスト内のパスワード・トークン文字列は架空の検証用です。本番の管理者パスワードとして使用しないでください。
- READMEの画像はサンプルデータです。実際の診断結果・入力URL・ダウンロード済みJSONには組織名や公開したくないパスが含まれる可能性があるため、無確認で追加しないでください。
- リポジトリ名、使用するライセンス、実サイト診断を有効にするかどうかをご確認ください。GitHubへのpushとVercelでの公開は、所有者の確認後に実施します。
