import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WYRM Trader — Autonomous Trading Agent",
  description: "Autonomous trading agent with sim execution, multi-signal analysis, and real-time dashboard powered by Bitget Agent Hub.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-black text-zinc-300 matrix-grid">{children}</body>
    </html>
  );
}
