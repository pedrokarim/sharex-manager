import { moduleLogoUrl } from "@/lib/modules/branding";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

/** Entrée de la barre latérale fournie par un module. */
export interface ModuleNavEntry {
  moduleName: string;
  title: string;
  url: string;
  /** Nom d'icône Lucide. */
  icon: string;
  /** Logo du module, s'il en a un : il remplace l'icône. */
  logo?: string;
  subItems: { title: string; url: string }[];
}

/**
 * Entrées de navigation des modules chargés. Le gabarit de l'application les
 * lit côté serveur pour que la barre latérale arrive complète ; la route
 * `/api/modules/nav-items` les sert aussi.
 */
export async function readModuleNavEntries(): Promise<ModuleNavEntry[]> {
  await apiModuleManager.ensureInitialized();

  return apiModuleManager
    .getAllLoadedModules()
    .filter((module) => module.config.navItems && module.config.navItems.length > 0)
    .flatMap((module) =>
      module.config.navItems!.map((navItem) => ({
        moduleName: module.name,
        title: navItem.title,
        url: navItem.url || `/m/${module.name}`,
        icon: navItem.icon || "Puzzle",
        logo: moduleLogoUrl(module.config, "small"),
        // Une sous-entrée par page du module, hors page racine.
        subItems: (module.config.pages || [])
          .filter((page) => page.path !== "")
          .map((page) => ({ title: page.title, url: `/m/${module.name}/${page.path}` })),
      })),
    );
}
