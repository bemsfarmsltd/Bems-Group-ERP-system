import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./connect.css";
import { AppProvider } from "@/context/AppContext";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-serif-lux",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono-tech",
});

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
    <html lang="en" className={`${plusJakarta.variable} ${spaceGrotesk.variable} ${cormorant.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased min-h-screen">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
