import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/spanish/ThemeToggle";
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
  icons: {
    apple: "/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function HomeworkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

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
            <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="max-w-lg mx-auto flex">
                <Link
                  href="/"
                  className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <BookIcon />
                  <span className="text-[11px] font-medium">Теми</span>
                </Link>
                <Link
                  href="/review"
                  className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RepeatIcon />
                  <span className="text-[11px] font-medium">Повторення</span>
                </Link>
                <Link
                  href="/homework"
                  className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HomeworkIcon />
                  <span className="text-[11px] font-medium">ДЗ</span>
                </Link>
              </div>
            </nav>

          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
