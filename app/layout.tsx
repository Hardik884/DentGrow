import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DentGrow",
  description: "AI-powered dental practice management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
