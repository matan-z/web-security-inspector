import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Security Inspector — Webサイトの安全を、もっと身近に。",
  description:
    "HTTPS・セキュリティヘッダー・Cookieの公開設定を、わかりやすく可視化。登録不要のデモでWebセキュリティを学べます。",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
