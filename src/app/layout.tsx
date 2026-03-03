import type { Metadata } from "next";
import { inter, jetbrainsMono } from "@/lib/fonts";
import { siteConfig } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: `${siteConfig.name} — One URL. Every Tool.`,
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
  },
  openGraph: {
    title: `${siteConfig.name} — One URL. Every Tool.`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — One URL. Every Tool.`,
    description: siteConfig.description,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
