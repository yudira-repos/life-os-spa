import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";

// Self-hosted via the `geist` package (next/font/local under the hood) —
// same fonts as next/font/google's Geist/Geist_Mono, but bundled locally so
// the Docker build never needs to reach fonts.googleapis.com. Fragile build-time
// network fetches are exactly the kind of thing that breaks in CI/Docker.
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "LifeOS",
  description: "One account, one household, one LifeOS — many specialized modules.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
