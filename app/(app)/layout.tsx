import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="[--header-height:calc(theme(spacing.14))]">
      <SidebarProvider className="flex flex-col">
        <div className="flex h-screen">
          <AppSidebar />

          <div className="flex-1 relative min-w-0">
            <SidebarInset className="h-full overflow-hidden">
              <SidebarHeader />
              <div className="h-[calc(100vh-var(--header-height))] overflow-y-auto">
                {children}
              </div>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
