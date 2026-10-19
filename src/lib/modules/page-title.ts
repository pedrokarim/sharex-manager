import type { ModuleConfig } from "@/types/modules";

/**
 * Nom du module tel que la barre latérale l'affiche (« Clip Studio »), à
 * défaut son identifiant rendu lisible (« hello-world » → « Hello world »).
 */
export function moduleDisplayName(config: Pick<ModuleConfig, "name" | "navItems">): string {
  const navTitle = config.navItems?.[0]?.title?.trim();
  if (navTitle) return navTitle;
  const words = config.name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Titre d'onglet d'une page de module : « Projets · Clip Studio ». La page
 * racine porte le nom du module seul, comme son entrée dans la barre latérale.
 * Le nom de l'application est ajouté par le gabarit racine.
 */
export function modulePageTitle(
  config: Pick<ModuleConfig, "name" | "navItems" | "pages">,
  pagePath: string,
): string {
  const name = moduleDisplayName(config);
  if (!pagePath) return name;
  const page = config.pages?.find((entry) => entry.path === pagePath);
  return page?.title ? `${page.title} · ${name}` : name;
}
