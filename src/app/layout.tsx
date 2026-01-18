import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ヒヤリハット報告システム",
  description: "介護現場のヒヤリハット報告を管理し、安全性向上に貢献するシステム",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased bg-gray-50">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
