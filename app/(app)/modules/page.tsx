import { Metadata } from "next";
import { Puzzle } from "lucide-react";
import { ModuleList } from "@/components/modules/module-list";

export const metadata: Metadata = {
  title: "Gestion des modules",
  description: "Gérez les modules de votre application ShareX Manager",
};

export default function ModulesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Puzzle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Gestion des modules
          </h1>
          <p className="text-sm text-muted-foreground">
            Installez, activez, désactivez et supprimez des modules pour étendre
            les fonctionnalités de votre application.
          </p>
        </div>
      </header>

      <ModuleList />
    </div>
  );
}
