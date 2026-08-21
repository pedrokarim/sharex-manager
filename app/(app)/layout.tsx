import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    // h-svh + overflow-hidden : la fenêtre ne défile pas. Sans ça, dès que le
    // contenu dépasse, c'est le document entier qui scrolle et l'encart perd sa
    // forme — coins arrondis et marges sortent de l'écran.
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      {/* L'encart garde sa hauteur et rogne ce qui dépasse : c'est lui qui
          définit la boîte, l'en-tête y reste fixe. */}
      <SidebarInset className="min-h-0 overflow-hidden">
        <SidebarHeader />
        {/* Le défilement a lieu ici, à l'intérieur de la boîte. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
