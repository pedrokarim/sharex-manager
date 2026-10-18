/**
 * Origines admises par l'application, lues dans l'environnement : un seul
 * endroit pour le proxy (`src/proxy.ts`), `next.config.mjs` et la
 * vérification d'origine des routes (`lib/api-guard.ts` via `lib/auth.ts`).
 *
 * En JavaScript (JSDoc) plutôt qu'en TypeScript : `next.config.mjs` l'importe
 * tel quel, avant toute compilation. Les types sont repris par `cors.ts`.
 *
 * Variables lues :
 * - `NEXT_PUBLIC_APP_DOMAIN` : domaine de l'application (« sxm.exemple.fr »,
 *   ou une adresse complète) ;
 * - `NEXT_PUBLIC_IMAGE_DOMAIN` : domaine des images, s'il est distinct ;
 * - `AUTH_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` : adresses
 *   publiques de l'application ;
 * - `CORS_EXTRA_ORIGINS` : origines supplémentaires, séparées par des
 *   virgules (un site vitrine qui appelle l'API publique, par exemple).
 */

/** @typedef {Record<string, string | undefined>} Environment */

/**
 * Origine (`https://hôte[:port]`) d'un domaine nu ou d'une adresse complète.
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function toOrigin(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * @param {(string | null | undefined | false)[]} values
 * @returns {string[]}
 */
function unique(values) {
  return [...new Set(values.filter(/** @returns {value is string} */ (value) => Boolean(value)))];
}

/**
 * Origine principale de l'application : celle des réponses CORS par défaut.
 * @param {Environment} env
 * @returns {string | null}
 */
export function primaryAppOrigin(env) {
  return toOrigin(env.NEXT_PUBLIC_APP_DOMAIN) ?? toOrigin(env.AUTH_URL) ?? toOrigin(env.NEXT_PUBLIC_SITE_URL);
}

/**
 * Origines de l'application elle-même : seules admises pour les requêtes qui
 * modifient (contrôle CSRF) et par better-auth.
 * @param {Environment} env
 * @returns {string[]}
 */
export function appOrigins(env) {
  return unique([
    primaryAppOrigin(env),
    toOrigin(env.AUTH_URL),
    toOrigin(env.NEXT_PUBLIC_API_URL),
    toOrigin(env.NEXT_PUBLIC_SITE_URL),
    env.NODE_ENV === "development" && `http://localhost:${env.PORT || 3000}`,
  ]);
}

/**
 * Origine du domaine d'images, si un domaine distinct est configuré.
 * @param {Environment} env
 * @returns {string | null}
 */
export function imageOrigin(env) {
  return toOrigin(env.NEXT_PUBLIC_IMAGE_DOMAIN);
}

/**
 * Nom d'hôte du domaine d'images (pour la réécriture vers `/img-handler`).
 * @param {Environment} env
 * @returns {string | null}
 */
export function imageHost(env) {
  const origin = imageOrigin(env);
  return origin ? new URL(origin).host : null;
}

/**
 * Origines supplémentaires de `CORS_EXTRA_ORIGINS`.
 * @param {Environment} env
 * @returns {string[]}
 */
export function extraOrigins(env) {
  return unique((env.CORS_EXTRA_ORIGINS ?? "").split(",").map((value) => toOrigin(value)));
}

/**
 * Toutes les origines admises par CORS : l'application, le domaine
 * d'images et les origines supplémentaires.
 * @param {Environment} env
 * @returns {string[]}
 */
export function allowedCorsOrigins(env) {
  return unique([...appOrigins(env), imageOrigin(env), ...extraOrigins(env)]);
}

/**
 * Valeur d'`Access-Control-Allow-Origin` pour une requête : l'origine elle-même
 * si elle est admise, sinon l'origine principale (le navigateur refuse alors
 * la lecture). En développement, tout `http://localhost:*` est admis.
 * @param {string | null | undefined} origin
 * @param {Environment} env
 * @returns {string | null}
 */
export function resolveCorsOrigin(origin, env) {
  if (origin) {
    if (allowedCorsOrigins(env).includes(origin)) return origin;
    if (env.NODE_ENV === "development" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  }
  return primaryAppOrigin(env);
}
