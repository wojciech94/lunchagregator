import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { NavHeader } from "@/components/NavHeader";
import { PostAuthMigrationWarning } from "@/components/auth/PostAuthMigrationWarning";
import { LocationProvider } from "@/components/location/LocationProvider";
import { readStoredLocationCookie } from "@/lib/location";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read once here: the cookie is httpOnly, so this is the only place the
  // server can turn it into something a client component can use.
  const initialLocation = await readStoredLocationCookie();
  const dark = (await cookies()).get("lunch-theme")?.value === "dark";

  return (
    <html lang="pl" className={dark ? "dark" : undefined}>
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <LocationProvider initialLocation={initialLocation}>
          <NavHeader />
          <PostAuthMigrationWarning />
          <main>
            {children}
          </main>
        </LocationProvider>
      </body>
    </html>
  );
}
