import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemedToaster } from "@/components/providers/ThemedToaster";
import { THEME_INIT_SCRIPT } from "@/lib/theme/script";
import { Analytics } from "@vercel/analytics/next";
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
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
          <ThemedToaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
