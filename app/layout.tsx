import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/spanish/ThemeToggle";
import { BottomNav } from "@/components/spanish/BottomNav";
import Link from "next/link";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Іспанська",
  description: "Вчимо іспанську з нуля",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Іспанська",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body className={`${geist.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="min-h-screen bg-background text-foreground flex flex-col">

            {/* Top header */}
            <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
                <Link href="/" className="font-semibold text-base tracking-tight">
                  🇪🇸 Іспанська
                </Link>
                <ThemeToggle />
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-24">
              {children}
            </main>

            {/* Bottom navigation */}
            <BottomNav />

          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
