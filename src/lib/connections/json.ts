/**
 * Lecture JSON des réponses de service, sans perte sur les grands
 * identifiants.
 *
 * Certains services rendent des identifiants de 17 chiffres ou plus sous
 * forme de nombres : `JSON.parse` les arrondit (au-delà de 2^53), et
 * l'identifiant ne désigne plus le bon compte. Ici, tout entier de 16
 * chiffres ou plus est lu comme une chaîne. Un identifiant se range et se
 * transporte toujours en chaîne dans le cœur (`externalId`, `data`).
 */

/** Entier JSON de 16 chiffres ou plus, en position de valeur (après `:`, `[` ou `,`). */
const BIG_INTEGER = /([:[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g;

/** Comme `JSON.parse`, mais les entiers de 16 chiffres ou plus deviennent des chaînes. */
export function parseJsonKeepingIds(text: string): unknown {
  // Les chaînes JSON sont recopiées telles quelles : seul le texte hors guillemets est touché.
  let result = "";
  let index = 0;
  const stringPattern = /"(?:[^"\\]|\\.)*"/g;
  for (let match = stringPattern.exec(text); match; match = stringPattern.exec(text)) {
    result += text.slice(index, match.index).replace(BIG_INTEGER, '$1"$2"') + match[0];
    index = match.index + match[0].length;
  }
  result += text.slice(index).replace(BIG_INTEGER, '$1"$2"');
  return JSON.parse(result);
}

/** Corps JSON d'une réponse, identifiants gardés en chaînes ; `null` si le corps n'est pas du JSON. */
export async function readJsonKeepingIds(response: Response): Promise<unknown> {
  try {
    return parseJsonKeepingIds(await response.text());
  } catch {
    return null;
  }
}
