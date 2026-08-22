import type { Metadata } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./global.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/lib/auth";
import { createThemeBootstrapScript } from "@/lib/theme/create-theme-bootstrap-script";
import { getResolvedThemePayload } from "@/lib/theme/get-resolved-theme-payload";
import { getThemeFontStylesheets } from "@/lib/theme/theme-font-families";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import {
  buildThemeStylesheet,
  resolveThemeHtmlClass,
} from "@/lib/theme/theme-stylesheet";

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

const SITE_DESCRIPTION =
  "Gestionnaire d'images auto-hébergé pour ShareX, Flameshot et mobile : upload en un raccourci, galerie, albums publics, clés d'API et statistiques.";

export const metadata: Metadata = {
  // Sans `metadataBase`, toute image Open Graph déclarée en chemin relatif ne
  // se résout pas et les aperçus partagés restent vides.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "fr_FR",
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
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

  // Le thème est décidé ici, pas après l'hydratation : la classe part dans le
  // HTML et les variables dans une feuille de style du <head>. C'est ce qui
  // supprime le flash — le navigateur peint directement les bonnes couleurs.
  const themeClass = resolveThemeHtmlClass(initialTheme, !!session?.user);
  const themeStylesheet = buildThemeStylesheet(initialTheme.styles);

  return (
    // Les variables de police vivent sur <html>, pas sur <body> : les jetons du
    // thème sont déclarés sur `:root`, et un `var(--font-plus-jakarta)` écrit là
    // ne résout que si la variable y est visible. Posées plus bas, elles
    // rendaient la déclaration invalide et toute l'application retombait sur la
    // police système.
    <html
      lang="fr"
      className={`${plusJakartaSans.variable} ${jetBrainsMono.variable} ${themeClass}`}
      suppressHydrationWarning
    >
      <head>
        {/* Avant toute autre feuille : le style du thème doit être connu du
            navigateur au moment où il calcule le premier rendu. */}
        <style
          id="theme-tokens"
          dangerouslySetInnerHTML={{ __html: themeStylesheet }}
        />
        {/* Script bloquant, volontairement placé dans le <head> : il ne corrige
            que ce que le serveur ne pouvait pas savoir (préférence anonyme en
            localStorage, mode horaire dans le fuseau du visiteur). */}
        <script
          id="theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
        {themeFontStylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
        >
          Skip to main content
        </a>
        <Providers initialTheme={initialTheme} session={session}>
          <div className="relative min-h-screen">
            <main id="main-content">{children}</main>
            <Toaster />
          </div>
        </Providers>
      </body>
    </html>
  );
}
