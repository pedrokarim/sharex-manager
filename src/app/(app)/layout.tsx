import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { readModuleNavEntries } from "@/lib/modules/nav-items";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ModuleSettingsHost } from "@/components/gallery/module-settings-host";

/**
 * Tout l'espace applicatif est derrière authentification : aucune de ces pages
 * n'a de raison d'apparaître dans un moteur de recherche. Déclaré ici plutôt
 * que page par page – les enfants en héritent.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // La barre latérale reçoit ici ce qu'elle doit montrer : rien n'y apparaît
  // après coup. Des modules illisibles ne doivent pas empêcher la page.
  const moduleNavItems = await readModuleNavEntries().catch((error) => {
    console.error("Entrées de navigation des modules indisponibles:", error);
    return [];
  });

  return (
    // h-svh + overflow-hidden : la fenêtre ne défile pas. Sans ça, dès que le
    // contenu dépasse, c'est le document entier qui scrolle et l'encart perd sa
    // forme – coins arrondis et marges sortent de l'écran.
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        isAdmin={isAdmin(session)}
        moduleNavItems={moduleNavItems}
        user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      />
      {/* L'encart garde sa hauteur et rogne ce qui dépasse : c'est lui qui
          définit la boîte, l'en-tête y reste fixe. */}
      <SidebarInset className="min-h-0 overflow-hidden">
        <SidebarHeader />
        {/* Le défilement a lieu ici, à l'intérieur de la boîte. Une page qui
            veut occuper toute la hauteur prend `min-h-full shrink-0` : avec `h-full`,
            son contenu déborderait et perdrait la marge du bas. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
      {/* Réglages des modules ouverts depuis un menu contextuel. */}
      <ModuleSettingsHost />
    </SidebarProvider>
  );
}
