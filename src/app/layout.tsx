import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/app/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WhatsApp API Service",
  description: "Next.js WhatsApp messaging API powered by whatsapp-web.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInitScript = `(() => {
    try {
      const key = "wappapi-theme";
      const saved = localStorage.getItem(key);
      const mode = saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
      const theme = mode === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : mode;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
    } catch {}
  })();`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased transition-colors duration-300`}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
