/**
 * Paramètres communs à toutes les requêtes de la galerie vers `/api/files` :
 * pages, frise des mois, rafraîchissement.
 */

/**
 * Le tri envoyé à `/api/files`. Une collection a son propre tri, que la route
 * applique tant qu'on ne lui en impose pas un (`searchParams.has("sort")`) :
 * la préférence de tri ne part donc qu'une fois choisie à la main dans la
 * barre d'outils.
 */
export function appendSort(
  params: URLSearchParams,
  sort: { sortBy: string; sortOrder: string },
  options: { collectionId: number | undefined; sortChosen: boolean },
) {
  if (options.collectionId !== undefined && !options.sortChosen) return;
  params.set("sort", sort.sortBy);
  params.set("order", sort.sortOrder);
}

/** Les filtres d'étendue (tags, collection), ajoutés à toutes les requêtes de la galerie. */
export function appendScope(params: URLSearchParams, tags: string[], collectionId: number | undefined) {
  for (const tag of tags) params.append("tag", tag);
  if (collectionId !== undefined) params.set("collection", String(collectionId));
}
