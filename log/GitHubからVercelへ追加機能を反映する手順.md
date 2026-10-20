# GitHubからVercelへ追加機能を反映する手順

更新日：2026年10月20日

Web Security Inspectorの機能をローカルで実装・保存した後、GitHubへ変更を送り、Vercelの公開サイトへ反映する手順です。PDFダウンロード機能を追加した場合を例に説明します。

## 1. 全体の流れ

```text
ローカルで機能を実装・保存
  → 動作確認
  → git commitで変更を記録
  → git pushでGitHubへ送信
  → Vercelが自動でビルド・デプロイ
  → 公開URLで追加機能を確認
```

**ファイルをローカルに保存しただけ、またはcommitしただけでは、公開サイトには反映されません。** GitHubへpushし、Vercelの本番デプロイが成功する必要があります。

GitHubとVercelの連携が設定されている場合、本番用ブランチへのpushやマージで自動デプロイが始まります。通常のコード更新では、毎回手動でRedeployする必要はありません。[Vercel公式：Git連携](https://vercel.com/docs/git)

この手順書の作成時点では、ローカルのブランチは`main`、追跡先は`origin/main`でした。以下の基本手順は、Vercelの本番用ブランチも`main`で、そこへ直接pushして公開する場合を想定しています。作業ブランチやプルリクエストを使う場合は「8」を参照してください。

## 2. Vercelの連携先を確認する

1. [Vercelダッシュボード](https://vercel.com/dashboard)を開きます。
2. Web Security Inspectorを公開しているプロジェクトを選びます。
3. プロジェクトの「Settings」→「Git」で、更新するGitHubリポジトリが接続されているか確認します。
4. 「Settings」→「Environments」→「Production」の「Branch Tracking」で、本番用ブランチを確認します。以下では`main`とします。
5. 本番ドメインへの自動割り当てが有効になっているかも確認します。自動割り当てを無効にしている場合は、デプロイ後に手動の本番昇格が必要です。

GitHubのリポジトリ設定と、Vercelのプロジェクト設定は別の画面です。Environment VariablesやDeploymentsは、Vercel側で開いてください。画面の配置・名称が異なる場合は、プロジェクトの「Git」「Environments」「Production」を探します。[本番ブランチの公式説明](https://vercel.com/docs/git#production-branch)、[本番環境の公式説明](https://vercel.com/docs/deployments/environments)

## 3. ローカルで更新内容を確認する

プロジェクトのターミナルで、次のフォルダへ移動します。

```sh
cd "/home/lala/Dropbox/0000_Portfolio/0004_Web Security Inspector"
```

現在のブランチと変更内容を確認します。

```sh
git branch --show-current
git status --short
git diff
```

`git diff`は主に追跡済みファイルの差分を表示します。`git status --short`で`??`になっている新規ファイルは、エディターで内容も確認してください。

この後の基本手順では、現在のブランチが`main`であることを確認します。別のブランチで作業している場合は、無理に切り替えず「8」へ進んでください。

### 動作確認

このプロジェクトのNode.js指定は22.xです。別環境で取得した直後や依存パッケージを更新した後は、必要に応じて`npm ci`でロックファイルに合わせて依存関係をインストールします。

次のコマンドを1つずつ実行し、成功したことを確認してから次へ進みます。

```sh
npm test
npm run typecheck
npm run build
```

エラーが出た場合は修正し、関係する確認をやり直してください。PDF保存など画面操作を伴う変更では、デモで実際に追加機能を操作し、必要に応じて次も実行します。Playwrightの準備は[READMEのテスト手順](../README.md#テスト)を参照してください。

```sh
npm run test:e2e
```

PDF機能なら、ボタン表示だけでなく、ダウンロード、ファイル名、日本語、全項目の掲載、長い設定値の折り返しまで確認します。

## 4. 更新ファイルをcommitする

### 4-1. 今回公開するファイルをステージする

変更したファイルやフォルダを指定して、commit対象に追加します。以下は、アプリのコード・テスト・依存関係・Next.js設定をまとめて選択する例です。今回の変更に関係するパスだけを指定してください。

```sh
git add -- src tests package.json package-lock.json next.config.ts
```

PDF用フォントなどを新しく`public`フォルダに追加した場合は、そのファイルも対象に含めます。実際にそのフォルダを追加・変更した場合だけ実行してください。

```sh
git add -- public
```

ライブラリを追加した場合は、`package.json`と`package-lock.json`をセットでcommitします。新しい画像・フォント・設定ファイルなども、漏れがないか確認してください。

この手順書もGitHubに保存したい場合は、次を追加します。

```sh
git add -- "log/GitHubからVercelへ追加機能を反映する手順.md"
```

### 4-2. commit対象を確認する

```sh
git diff --cached --stat
git diff --cached
```

今回の機能追加に必要な変更が含まれていることを確認します。`.env.local`、Client Secret、SESSION_SECRET、保存用トークンなどの秘密値を含めないでください。診断結果のPDFなど、動作確認でダウンロードしたファイルも、公開する意図がなければ追加しません。

### 4-3. commitする

メッセージは、実際の更新内容に合わせます。

```sh
git commit -m "feat: 診断結果のPDFダウンロード機能を追加"
```

記録されたcommitを確認し、短いIDを控えます。このIDは、GitHubとVercelに同じ更新が届いたかを確認するために使います。

```sh
git log -1 --oneline
```

## 5. GitHubへpushする

**この操作以降は、本番用ブランチへのpushに連動して公開サイトの更新が進みます。** 公開する内容であることを確認してから実行します。

```sh
git push origin main
```

pushが成功したら、ブラウザでGitHubの対象リポジトリを開きます。「Code」で`main`ブランチを選択し、最新commitのメッセージ・ID・変更ファイルが、先ほどの更新と一致するかを確認してください。[GitHub公式：pushの説明](https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository)

`Everything up-to-date`と表示されたのに更新が見えない場合は、ローカルの変更がまだcommitされていない、別のブランチに記録した、または別の送信先を見ている可能性があります。`git status`と`git log -1 --oneline`を確認します。

## 6. Vercelのデプロイ完了を確認する

1. Vercelダッシュボードで、対象プロジェクトの「Deployments」を開きます。
2. 今回のpushに対応する新しいデプロイを選びます。
3. ソースのブランチが`main`、環境が「Production」であることを確認します。
4. ソースのcommit IDが、GitHubの最新commitと一致することを確認します。
5. ビルド・デプロイが完了し、成功状態（「Ready」など）になるまで待ちます。
6. そのデプロイが本番ドメインに割り当てられていることを確認します。

標準設定では、本番デプロイが成功すると本番ドメインが新しいデプロイを指すようになります。手動昇格を使う設定では、確認後に「Promote to Production」などの本番昇格操作を行います。「Ready」になっていても、Preview環境や本番ドメイン未割り当てのデプロイでは、通常の公開URLは更新されません。[Vercel公式：環境と本番反映](https://vercel.com/docs/deployments/environments)

## 7. 公開サイトで追加機能を確認する

1. [公開サイト](https://web-security-inspector-sepia.vercel.app)を開きます。
2. すでに開いていた場合は、再読み込みします。古い画面が残る場合は、スーパーリロードやプライベートウィンドウでも確認します。
3. デモを実行し、追加した機能を操作します。
4. PCとスマートフォン相当の画面で、表示崩れや操作できない箇所がないか確認します。

### PDFダウンロード機能を追加した場合の確認例

- 診断結果に「PDFをダウンロード」が表示される。
- ボタンを押すとPDFが保存され、開ける。
- ファイル名が`yyyy-mmdd-hhmm_サイト名_診断結果.pdf`になる。
- 例：`2026-1020-1430_example.com_診断結果.pdf`。
- ファイル名の日時が、PDF内の診断日時の日本時間と一致する。
- デモでは日時がサンプルであることと、実サイトへの通信がないことが明記される。
- 日本語の文字化け、長文のはみ出し、改ページによる読みにくさがない。
- 画面で閉じた項目や絞り込み対象外の項目も、PDFには収録される。
- 既存のJSONダウンロードも利用できる。

ログインや実サイト診断に関係する変更をした場合は、正規の公開URLでGitHubログインも確認します。実サイト診断は、許可を得た検証用ドメインで実施してください。

## 8. Previewで確認してから本番へ反映する場合

作業ブランチを使う場合は、そのブランチで変更をcommitしてGitHubへpushします。例としてブランチ名が`feature/pdf-download`なら、次のようになります。ブランチ名は実際に作業しているものを指定してください。

```sh
git push -u origin feature/pdf-download
```

1. GitHubで作業ブランチから`main`へのプルリクエストを作成します。
2. Vercelが作成したPreview URLを、プルリクエストのチェックやVercelのDeploymentsから開きます。
3. デモなどで機能を確認します。
4. 確認が終わったら、GitHubでプルリクエストを`main`へマージします。
5. 本番デプロイの完了と公開URLでの動作を「6」「7」に沿って確認します。

Previewにpushしただけでは、通常の公開URLは更新されません。また、このアプリではPreviewに本番の秘密値やストレージを共有しない運用です。PreviewでGitHubログインが無効でも、それだけで本番の不具合とは判断できません。認証まで検証する場合は、Preview専用のOAuth App・APP_ORIGIN・SESSION_SECRET・保存先を用意します。[Previewの公式説明](https://vercel.com/docs/deployments/environments#preview-environment-pre-production)、[このプロジェクトの環境設定](../README.md#vercelへのデプロイと初期設定)

## 9. 環境変数も変更した場合

1. Vercelの対象プロジェクトで「Settings」→「Environment Variables」を開きます。
2. 本番で必要な変数を「Production」に設定します。
3. 設定保存後に新しくデプロイします。push前ならその後のpushで反映し、すでにpush・デプロイ済みなら対象commitのデプロイをRedeployします。

環境変数の変更は、既存のデプロイには反映されません。ローカルの`.env.local`を変更しても、Vercel側の設定は更新されません。[Vercel公式：環境変数](https://vercel.com/docs/environment-variables)

提案したブラウザ内生成のPDF機能では、通常は新しいサーバー用環境変数は不要です。実装した機能が新しい変数を必要とする場合だけ、この操作を行います。

## 10. 反映されない場合の確認

### GitHubに最新コードがない

ファイル保存、ステージ、commit、pushのどこまで完了したか確認します。GitHubの対象ブランチに、更新したファイルと最新commitが存在することを先に確認してください。

pushが`non-fast-forward`などで拒否された場合は、GitHub側に手元にない変更がある可能性があります。リモートの変更を取り込み、競合があれば解消してから再確認・再pushします。強制pushで上書きせず、エラーの原因を確認します。[GitHub公式：push拒否の説明](https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository#dealing-with-non-fast-forward-errors)

### Vercelでデプロイが始まらない

「Settings」→「Git」の接続リポジトリ、本番用ブランチ、GitHub連携の権限、デプロイのスキップ設定を確認します。GitHub側にVercelの失敗・承認待ち表示がないかも確認します。

自動デプロイが始まらない場合は、「Deployments」の「Create Deployment」から、最新の`main`または対象commitを指定して作成する方法もあります。作成時には対象ブランチと環境を確認してください。[Git参照から作成する公式手順](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)

### Vercelのビルドが失敗する

失敗したデプロイのBuild Logsを開き、最初の具体的なエラーを確認します。依存パッケージ追加時は、`package-lock.json`の更新漏れ、新しいフォント・画像のcommit漏れ、ローカルとVercelのNode.jsバージョンの違いも確認します。修正後は、新しいcommitをpushします。

### デプロイは成功したが、公開サイトが古い

次の順に確認します。

1. 成功したデプロイのcommit IDが、今回の更新と一致しているか。
2. その環境がProductionで、本番ドメインが割り当てられているか。
3. 開いているURLが、古いデプロイ固有URLやPreview URLではなく、正規の公開URLか。
4. スーパーリロードや別ウィンドウでも同じか。

**古いデプロイの「Redeploy」を押しても、新しいcommitへ切り替わるわけではありません。** 最新コードの反映には、最新commitのデプロイを選ぶか、最新のブランチ・commitからデプロイを作成します。

設定変更などで同じcommitを再ビルドする場合は、対象デプロイの「…」→「Redeploy」を使います。通常は既存のBuild Cacheを使用し、キャッシュが原因と考えられる場合に限り、キャッシュを使わず再ビルドします。[Redeployの公式手順](https://vercel.com/docs/deployments/managing-deployments#redeploy-a-project)

### 公開後に重大な不具合が見つかった

VercelのRollback機能で直前の正常な本番デプロイへ戻す方法があります。GitHubのコードは別途修正し、再度デプロイしてください。ストレージ内のデータや設定がアプリのコードと同時に巻き戻るとは限りません。利用条件や操作は[本番ロールバックの公式手順](https://vercel.com/docs/deployments/rollback-production-deployment)を確認します。

## 参照先と確認範囲

操作説明は2026年10月20日に確認した公式資料と、このプロジェクトの設定に基づきます。Vercelの画面配置は更新される場合があります。手順書作成時に、GitHubへのcommit・pushやVercelへの公開操作は実施していません。

- [GitHub：リモートリポジトリへのpush](https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository)
- [Vercel：Gitリポジトリのデプロイ](https://vercel.com/docs/git)
- [Vercel：PreviewとProduction](https://vercel.com/docs/deployments/environments)
- [Vercel：デプロイの管理・Redeploy](https://vercel.com/docs/deployments/managing-deployments)
- [Vercel：環境変数](https://vercel.com/docs/environment-variables)
- [このプロジェクトのREADME](../README.md)
