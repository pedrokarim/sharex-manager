import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import Script from "next/script";
import "./global.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/lib/auth";
import { createThemeBootstrapScript } from "@/lib/theme/create-theme-bootstrap-script";
import { getResolvedThemePayload } from "@/lib/theme/get-resolved-theme-payload";
// import { ThemeWrapper } from "@/components/theme-wrapper"; // Disabled - themes now handled by Jotai

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const initialTheme = await getResolvedThemePayload(session?.user?.id ?? null);

  const themeBootstrapScript = createThemeBootstrapScript({
    initialTheme,
    isAuthenticated: !!session?.user,
  });

  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
        >
          Skip to main content
        </a>
        <Providers initialTheme={initialTheme} session={session}>
          {/* ThemeWrapper disabled - themes now handled by ThemeProvider in components/theme-provider.tsx */}
          <div className="relative min-h-screen">
            <main id="main-content">{children}</main>
            <Toaster />
          </div>
        </Providers>
      </body>
    </html>
  );
}
