export const DEMO_NOTICE =
  "これは学習用のサンプルです。外部サイトへの通信は行っていません。表示されたURL・日時・応答時間は架空の診断条件です。";
export const REDIRECT_NOTICE =
  "リダイレクト応答のみを評価しました。転送先には接続していません。転送先ページの設定は判定できません。";
export const httpStatusNotice = (status: number) =>
  `HTTP ${status} の応答に含まれる設定を評価しています。通常ページやログイン後の設定とは異なる場合があります。`;
export const SCORE_DISCLAIMER = "サイト全体の安全性を保証するものではありません";
export const REPORT_SCOPE_NOTE =
  "このURLの単一レスポンスのみを評価します。認証後のページ、HTML内のmeta設定、JavaScriptで発行されたCookieは対象外です。参考スコアは重要度で加重し、良好100%・要確認50%・問題あり0%で計算します。該当なし・判定不可は除外します。";
export const EXAMPLE_NOTE = "設定例はサイトの構成・利用目的に合わせて調整してください。";
