/**
 * Règles de la barre latérale, sans React : quel lien correspond à la page
 * courante, quelles sections doivent s'ouvrir d'elles-mêmes.
 */

/** Un lien de la barre, avec ses sous-liens éventuels. */
export interface NavLink {
  url: string;
  items?: { url: string }[];
}

/** Section repliable : un lien à sous-liens, ou un groupe entier (Administration). */
export interface NavSection {
  id: string;
  links: NavLink[];
}

/** Identifiant de la section formée par un lien et ses sous-liens. */
export function linkSectionId(url: string): string {
  return `link:${url}`;
}

/**
 * Score d'un lien pour la page courante, `-1` s'il ne la couvre pas.
 *
 * Le chemin du lien doit être celui de la page ou l'un de ses parents
 * (`/m/clip-studio` couvre `/m/clip-studio/exports`, pas `/m/clip-studio-2`).
 * Un lien qui porte des paramètres (`/gallery?sort=recent`) ne couvre la page
 * que si elle porte les mêmes ; à chemin égal, il l'emporte sur le lien nu.
 */
export function matchScore(href: string, pathname: string, search: string | URLSearchParams = ""): number {
  const [rawPath, query = ""] = href.split("?");
  const path = trimSlash(rawPath);
  const current = trimSlash(pathname);

  const covers = path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`);
  if (!covers) return -1;

  const required = new URLSearchParams(query);
  const present = typeof search === "string" ? new URLSearchParams(search) : search;
  let paramCount = 0;
  for (const [key, value] of required) {
    if (present.get(key) !== value) return -1;
    paramCount += 1;
  }

  // Le chemin compte d'abord ; les paramètres ne départagent qu'à chemin égal.
  return path.length * 100 + paramCount;
}

/** Le lien qui correspond le mieux à la page : préfixe le plus long, `null` si aucun. */
export function findActiveHref(
  hrefs: Iterable<string>,
  pathname: string,
  search: string | URLSearchParams = "",
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const href of hrefs) {
    const score = matchScore(href, pathname, search);
    if (score > bestScore) {
      best = href;
      bestScore = score;
    }
  }
  return best;
}

/** Toutes les adresses d'une liste de liens, sous-liens compris. */
export function collectHrefs(links: NavLink[]): string[] {
  return links.flatMap((link) => [link.url, ...(link.items ?? []).map((item) => item.url)]);
}

/**
 * Un lien est actif s'il mène à la page courante, ou si l'un de ses sous-liens
 * y mène : le module d'une sous-page `/m/<module>/…` reste marqué.
 */
export function isLinkActive(link: NavLink, activeHref: string | null): boolean {
  if (!activeHref) return false;
  return link.url === activeHref || (link.items ?? []).some((item) => item.url === activeHref);
}

/** Sections qui contiennent le lien actif : celles à ouvrir à l'arrivée. */
export function activeSectionIds(sections: NavSection[], activeHref: string | null): string[] {
  if (!activeHref) return [];
  return sections
    .filter((section) => section.links.some((link) => isLinkActive(link, activeHref)))
    .map((section) => section.id);
}

/**
 * Ouvre les sections données sans toucher aux autres : une section que
 * l'utilisateur a refermée ou ouverte reste comme il l'a laissée. Renvoie le
 * même objet quand rien ne change.
 */
export function openSections(state: Record<string, boolean>, ids: string[]): Record<string, boolean> {
  if (ids.every((id) => state[id])) return state;
  const next = { ...state };
  for (const id of ids) next[id] = true;
  return next;
}

function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path || "/";
}
