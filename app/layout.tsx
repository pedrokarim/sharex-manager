import type { Metadata } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./global.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/lib/auth";
import { createThemeBootstrapScript } from "@/lib/theme/create-theme-bootstrap-script";
import { getResolvedThemePayload } from "@/lib/theme/get-resolved-theme-payload";
import { getThemeFontStylesheets } from "@/lib/theme/theme-font-families";
// import { ThemeWrapper } from "@/components/theme-wrapper"; // Disabled - themes now handled by Jotai

// Polices auto-hébergées par next/font : aucune requête vers Google au runtime,
// et aucun décalage de mise en page au premier rendu.
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
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

  // Un thème enregistré depuis l'éditeur référence des familles Google par leur
  // nom (« Plus Jakarta Sans, sans-serif ») : sans cette feuille de style, le
  // navigateur retombe sur la police système.
  const themeFontStylesheets = getThemeFontStylesheets(initialTheme.styles);

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {themeFontStylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body
        className={`${plusJakartaSans.variable} ${jetBrainsMono.variable} antialiased`}
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
