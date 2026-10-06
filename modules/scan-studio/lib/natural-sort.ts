/**
 * Ordre naturel des noms de fichiers : « 2.png » avant « 10.png ».
 *
 * Les pages d'un chapitre arrivent nommées par leur numéro, rarement complété
 * par des zéros. Un tri alphabétique rangerait la page 10 avant la page 2.
 * Ce fichier ne dépend de rien et ne lit aucun réglage de langue : le même
 * jeu de noms donne le même ordre partout.
 */

/** Suites de chiffres d'un côté, tout le reste de l'autre. */
const CHUNKS = /\d+|\D+/g;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deux nombres écrits en chiffres, sans limite de longueur : pas de conversion, donc pas de perte. */
function compareDigits(a: string, b: string): number {
  const left = a.replace(/^0+(?=\d)/, "");
  const right = b.replace(/^0+(?=\d)/, "");
  if (left.length !== right.length) return left.length - right.length;
  return compareText(left, right);
}

/**
 * Compare deux noms sans tenir compte de la casse. Rend 0 pour deux noms
 * équivalents (« 01.png » et « 1.png », « A.png » et « a.png ») : le tri, stable,
 * les laisse alors dans leur ordre d'arrivée.
 */
export function compareNatural(a: string, b: string): number {
  const left = a.toLowerCase().match(CHUNKS) ?? [];
  const right = b.toLowerCase().match(CHUNKS) ?? [];
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index++) {
    const x = left[index];
    const y = right[index];
    const xIsNumber = x.charCodeAt(0) >= 48 && x.charCodeAt(0) <= 57;
    const yIsNumber = y.charCodeAt(0) >= 48 && y.charCodeAt(0) <= 57;
    // Un nombre passe avant du texte : « 1.png » avant « a.png ».
    if (xIsNumber !== yIsNumber) return xIsNumber ? -1 : 1;
    const order = xIsNumber ? compareDigits(x, y) : compareText(x, y);
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

/** Copie triée dans l'ordre naturel ; les éléments de même rang gardent leur ordre d'arrivée. */
export function sortNatural<T>(items: readonly T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareNatural(nameOf(a), nameOf(b)));
}
