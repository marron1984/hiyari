import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "AA-HUB",
  description: "申請・承認・勤怠・報告を一元管理する統合プラットフォーム",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AA-HUB",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased bg-gray-50">
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
