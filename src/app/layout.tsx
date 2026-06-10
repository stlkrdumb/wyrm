import type { Metadata } from "next";
import { Azeret_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const azeretMono = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WYRM Trader — Autonomous Trading Agent",
  description: "Autonomous trading agent with sim execution, multi-signal analysis, and real-time dashboard powered by Bitget Agent Hub.",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased dark ${azeretMono.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 matrix-grid">{children}</body>
    </html>
  );
}
