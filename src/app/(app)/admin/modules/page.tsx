import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { Package } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ModuleList } from "@/components/modules/module-list";

export const metadata = {
  title: "Administration des modules",
  description: "Gérez les modules installés dans ShareX Manager",
};

export default async function ModulesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdmin(session)) redirect("/");
  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6">
      <AdminPageHeader
        icon={Package}
        title="Gestion des modules"
        description="Installez, activez, désactivez et supprimez des modules pour étendre les fonctionnalités de votre application."
      />
      <ModuleList />
    </div>
  );
}
