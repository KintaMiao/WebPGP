import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WebPGP - 网页端PGP加密工具",
  description: "基于浏览器的PGP加密解密工具，保护您的数据安全与隐私",
  keywords: ["PGP", "加密", "隐私", "安全", "OpenPGP", "Web加密"],
  authors: [{ name: "WebPGP Team" }],
  creator: "WebPGP Project",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
