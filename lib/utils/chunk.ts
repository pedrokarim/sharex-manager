/**
 * Découpe une liste en lots de taille fixe.
 *
 * Les routes en lot plafonnent le nombre d'éléments par requête (Zod `.max()`).
 * Côté client, envoyer une sélection entière dans un seul appel échoue dès que
 * ce plafond est dépassé – et échoue en bloc, sans rien traiter.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk: la taille doit être supérieure à 0");

  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** Plafond de `POST /api/albums/[id]/files` et `POST /api/files/batch`. */
export const FILES_BATCH_LIMIT = 50;

/** Plafond de `POST /api/files/albums/batch`. */
export const FILE_ALBUMS_BATCH_LIMIT = 100;

/**
 * Message d'erreur renvoyé par une route de l'API, ou un repli si la réponse
 * n'est pas exploitable. Sans ça, l'interface affiche un message générique là
 * où le serveur explique précisément ce qui ne va pas.
 */
export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // Réponse vide ou non JSON : on garde le repli.
  }
  return fallback;
}
