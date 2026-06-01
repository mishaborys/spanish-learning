import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/spanish/ThemeToggle";
import Link from "next/link";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Іспанська",
  description: "Вчимо іспанську з нуля",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body className={`${geist.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="min-h-screen bg-background text-foreground">
            <header className="border-b">
              <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
                <nav className="flex items-center gap-6 text-sm font-medium">
                  <Link
                    href="/"
                    className="text-foreground hover:text-foreground/70 transition-colors"
                  >
                    Теми
                  </Link>
                  <Link
                    href="/review"
                    className="text-foreground hover:text-foreground/70 transition-colors"
                  >
                    Повторення
                  </Link>
                </nav>
                <ThemeToggle />
              </div>
            </header>
            <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
