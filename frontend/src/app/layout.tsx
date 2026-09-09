import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: { default: "Culinary Blog", template: "%s | Culinary Blog" },
  description: "Khám phá, chia sẻ và quản lý công thức nấu ăn.",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Culinary Blog",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="border-b">
            <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-base font-semibold">
                Culinary Blog
              </Link>
              <ul className="flex items-center gap-6 text-sm">
                <li>
                  <Link href="/recipes">Công thức</Link>
                </li>
                <li>
                  <Link href="/categories">Danh mục</Link>
                </li>
                <li>
                  <Link href="/search">Tìm kiếm</Link>
                </li>
                <li>
                  <Link href="/auth/login">Đăng nhập</Link>
                </li>
              </ul>
            </nav>
          </header>
          {children}
          <footer className="mt-auto border-t py-6 text-center text-sm text-zinc-500">
            Culinary Blog
          </footer>
        </Providers>
      </body>
    </html>
  );
}
