import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "WorkGrid",
  description: "A Jira-like work management platform with explicit workflows, permissions, and automation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--bg)] text-[var(--fg)]">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
