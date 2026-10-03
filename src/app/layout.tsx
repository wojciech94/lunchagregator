import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavHeader } from "@/components/NavHeader";
import { PostAuthMigrationWarning } from "@/components/auth/PostAuthMigrationWarning";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Lunch Agregator",
  description: "Agregator ofert lunchowych z pobliskich restauracji",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body
        className={`${inter.variable} font-sans antialiased overflow-x-hidden`}
      >
        <NavHeader />
        <PostAuthMigrationWarning />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
