import type { ModuleConfig } from "@/types/modules";

/**
 * Identité visuelle d'un module. Elle vit dans son dossier (`branding/`) et se
 * déclare dans son `module.json` : un module emporte son logo avec lui, rien
 * n'est à déposer dans `public/`.
 */

type Branded = Pick<ModuleConfig, "name" | "version" | "branding">;

/**
 * Adresse du logo d'un module, ou `undefined` s'il n'en déclare pas. `small`
 * demande la petite version, pour une barre latérale ou une liste. La version
 * du module passe dans l'adresse : un logo redessiné n'attend pas l'expiration
 * du cache.
 */
export function moduleLogoUrl(module: Branded, size: "full" | "small" = "full"): string | undefined {
  if (!module.branding?.logo) return undefined;
  const params = new URLSearchParams({ v: module.version });
  if (size === "small") params.set("size", "small");
  return `/api/modules/${encodeURIComponent(module.name)}/logo?${params}`;
}
