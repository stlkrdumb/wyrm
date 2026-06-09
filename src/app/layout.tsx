import type { Metadata } from "next";
import "./globals.css";

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
      className="h-full antialiased dark"
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 matrix-grid">{children}</body>
    </html>
  );
}
