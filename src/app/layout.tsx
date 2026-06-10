import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WYRM TRADER — Autonomous Trading Terminal",
  description: "Autonomous trading agent with sim execution, multi-signal analysis, and real-time terminal powered by Bitget Agent Hub.",
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
      className={`h-full antialiased dark ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-[#080808] text-amber-100/90 crt-bg scanlines crt-flicker font-mono">
        {children}
      </body>
    </html>
  );
}
