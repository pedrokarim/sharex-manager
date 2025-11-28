import type { Metadata } from "next";
import localFont from "next/font/local";
import "./global.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { ThemeWrapper } from "@/components/theme-wrapper";
import { initModules } from "@/lib/modules/init";

// Initialiser les modules au démarrage de l'application
// Utiliser setTimeout pour éviter de bloquer le rendu
setTimeout(() => {
  initModules().catch(console.error);
}, 1000);

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ShareX Manager",
  description: "Gérez vos uploads ShareX facilement et en toute sécurité",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ThemeWrapper>
            <div className="relative min-h-screen">
              <main>{children}</main>
              <Toaster />
            </div>
          </ThemeWrapper>
        </Providers>
      </body>
    </html>
  );
}
