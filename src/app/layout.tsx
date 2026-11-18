import type { Metadata } from "next";
import "./globals.css";
import "./connect.css";
import { AppProvider } from "@/context/AppContext";
import { QueryProvider } from "@/context/QueryProvider";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: "BEMS ERP | Enterprise Suite",
  description: "BEMS Group multi-subsidiary enterprise resource planning, financial operations, HR, projects, and governance system",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/bems-group-logo.png?v=20261024", type: "image/png" },
      { url: "/favicon.ico?v=20261024" },
    ],
    shortcut: "/bems-group-logo.png?v=20261024",
    apple: "/bems-group-logo.png?v=20261024",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      style={
        {
          "--font-jakarta": "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          "--font-space": "'Space Grotesk', sans-serif",
          "--font-serif-lux": "'Cormorant Garamond', Georgia, serif",
          "--font-mono-tech": "'JetBrains Mono', monospace",
        } as React.CSSProperties
      }
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body className="antialiased min-h-screen">
        <QueryProvider>
          <AppProvider>
            {children}
          </AppProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
