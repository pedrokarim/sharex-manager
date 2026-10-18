import { getSecureFilesSync } from "@/lib/secure-files";

/**
 * Un fichier marqué privé reste privé même rangé dans un album public : ni
 * son nom, ni sa vignette, ni son compte ne sortent par l'album, le catalogue
 * ou l'aperçu partagé.
 */

/** Noms des fichiers sécurisés, lus une fois pour toute une réponse. */
export function securedFileNames(): Set<string> {
  return new Set(getSecureFilesSync());
}

/** Retire d'une liste les fichiers sécurisés. */
export function withoutSecuredFiles<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  secured: ReadonlySet<string> = securedFileNames()
): T[] {
  if (secured.size === 0) return [...items];
  return items.filter((item) => !secured.has(nameOf(item)));
}
