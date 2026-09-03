import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemedToaster } from "@/components/providers/ThemedToaster";
import { THEME_INIT_SCRIPT } from "@/lib/theme/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OraMedha",
    template: "%s — OraMedha",
  },
  description: "AI-powered dental practice management",
  // SVG first: it carries a prefers-color-scheme rule, so the mark is near-black
  // on a light tab strip and near-white on a dark one. A single black PNG
  // disappeared on dark tabs. The PNG stays as a fallback for anything that will
  // not take an SVG favicon, and for the Apple touch icon, which must be raster.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

/**
 * Matches the mobile browser chrome to whichever theme is painted, so the
 * address bar does not sit as a bright white band above a dark app.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F8F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1412" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Issued per request by middleware.ts and carried here on a request header,
  // because a Server Component can read request headers but not the response's.
  // Undefined only where middleware does not run (it excludes /api and static
  // assets, neither of which renders this layout) — in that case the script is
  // emitted un-nonced and the CSP, not this file, decides what happens.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT below edits <html>'s class and
    // style before React hydrates, which is intentional and is the only thing
    // that prevents a flash of the wrong theme. Without this attribute React
    // would warn about the server/client difference it deliberately creates.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
          <ThemedToaster />
        </ThemeProvider>
        {/*
          NO PRODUCT ANALYTICS HERE, DELIBERATELY.

          <Analytics /> from @vercel/analytics used to be mounted at this point.
          The root layout wraps EVERY route in the product, so it ran on the
          patient portal and on every clinical screen — and those URLs carry
          record identifiers in the path (/portal/billing/{treatmentId},
          /dentist/patients/{id}, /dentist/treatments/{id}). That made page
          paths derived from patient and treatment records a third-party
          disclosure, with no notice, no consent and no processing agreement.

          There is no marketing surface in this repository to scope it to — the
          marketing site is a separate application (oramedha.com) and is free to
          carry its own analytics. So the correct scope inside the PMS is none.

          If product telemetry is wanted later, it must not be mounted here:
          instrument specific non-clinical events server-side with identifiers
          the vendor cannot resolve back to a patient, and record the vendor in
          docs/subprocessors.json first.
        */}
      </body>
    </html>
  );
}
