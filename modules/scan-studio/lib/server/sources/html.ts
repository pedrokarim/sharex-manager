/**
 * Lecture tolérante d'une page HTML, pour les adaptateurs dont le site n'a pas
 * d'API : les images et leurs attributs, les liens, le titre, les balises
 * `og:`, et ce qui dit qu'une page n'est pas celle qu'on attendait
 * (vérification du navigateur, page de connexion, page vide).
 *
 * Rien que des fonctions pures, sans dépendance et sans requête : elles
 * reçoivent le texte d'une page et rendent ce qu'elles y lisent. Ce n'est pas
 * un analyseur HTML complet, et il n'a pas à l'être : il lit des balises
 * isolées, telles que les sites les écrivent (guillemets simples ou doubles,
 * attributs sur plusieurs lignes, espaces en tête de valeur, entités dans les
 * adresses), et ne suppose rien de l'arbre du document.
 */

// ─── Texte ───────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  ugrave: "ù",
  icirc: "î",
  iuml: "ï",
};

/** Remplace les entités HTML courantes ; une entité inconnue reste telle quelle. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi, (whole, body: string) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const code = body[1].toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

/** Un texte lu chez un site : sans caractère de contrôle, espaces réunis, longueur bornée. */
export function cleanText(value: string | undefined, max = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value
    .replace(/[\u0000-\u001f\u007f\u00a0\u200b-\u200f\u2028\u2029\ufeff]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return clean || undefined;
}

/** Ce qui n'est jamais du contenu : commentaires, scripts, styles, gabarits. */
export function stripInert(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
}

/** Le texte d'un fragment, balises retirées. */
export function textOf(fragment: string, max = 300): string | undefined {
  return cleanText(decodeEntities(stripInert(fragment).replace(/<[^>]*>/g, " ")), max);
}

/** « the-quiet-harbor » devient « The Quiet Harbor » : le dernier recours pour nommer une série. */
export function humanizeSlug(slug: string): string | undefined {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // Un « % » isolé : le texte reste tel quel.
  }
  const words = (cleanText(decoded.replace(/[-_+]+/g, " "), 120) ?? "").split(" ").filter(Boolean);
  if (words.length === 0) return undefined;
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

// ─── Balises ─────────────────────────────────────────────────────

export interface HtmlTag {
  /** Attributs, noms en minuscules, valeurs décodées. Le premier d'un même nom l'emporte. */
  attributes: Record<string, string>;
}

export interface HtmlElement extends HtmlTag {
  /** Le texte que la balise entoure, sans ses balises internes. */
  text?: string;
  /** Ce que la balise entoure, tel quel. */
  inner: string;
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

/**
 * Les attributs d'une balise, à partir de ce qui suit son nom. Une valeur mal
 * fermée (une apostrophe dans un `alt` entre apostrophes) ne fait pas perdre
 * les attributs qui la précèdent.
 */
export function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;
  for (let match = ATTRIBUTE.exec(source); match; match = ATTRIBUTE.exec(source)) {
    const name = match[1].toLowerCase();
    if (name in attributes) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

const tagName = (name: string) => {
  if (!/^[a-z][a-z0-9]*$/i.test(name)) throw new Error("Nom de balise invalide.");
  return name;
};

/** Les balises ouvrantes d'un nom donné (`img`, `meta`, `link`…), dans l'ordre du document. */
export function findTags(html: string, name: string): HtmlTag[] {
  const pattern = new RegExp(`<${tagName(name)}(?=[\\s/>])([^>]*)>`, "gi");
  const tags: HtmlTag[] = [];
  const source = stripInert(html);
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    tags.push({ attributes: parseAttributes(match[1]) });
  }
  return tags;
}

/** Les éléments d'un nom donné avec ce qu'ils entourent (`a`, `h1`, `li`, `title`…). Sans imbrication du même nom. */
export function findElements(html: string, name: string): HtmlElement[] {
  const safe = tagName(name);
  const pattern = new RegExp(`<${safe}(?=[\\s/>])([^>]*)>([\\s\\S]*?)<\\/${safe}\\s*>`, "gi");
  const elements: HtmlElement[] = [];
  const source = stripInert(html);
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    elements.push({ attributes: parseAttributes(match[1]), inner: match[2], text: textOf(match[2]) });
  }
  return elements;
}

/** Une balise porte-t-elle cette classe ? */
export function hasClass(tag: HtmlTag, className: string): boolean {
  return (tag.attributes.class ?? "").split(/\s+/).includes(className);
}

// ─── Adresses ────────────────────────────────────────────────────

/**
 * Une adresse lue dans une page, rendue absolue : espaces et retours à la
 * ligne autour retirés, adresse relative résolue d'après celle de la page,
 * espaces internes encodés. Rend `undefined` pour ce qui n'est pas une adresse
 * http(s) (image en ligne `data:`, ancre, script) ou qui porte des identifiants.
 */
export function resolveAddress(raw: string | undefined, base: string | URL): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.replace(/[\u0000-\u001f\u007f]+/g, "").trim();
  if (!value || value.startsWith("#") || value.length > 2000) return undefined;
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return undefined;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return undefined;
  return url.toString();
}

/** Attributs où les sites rangent l'adresse d'une image, du plus sûr au moins sûr : une image paresseuse n'a dans `src` qu'un bouche-trou. */
export const IMAGE_ATTRIBUTES = ["data-src", "data-lazy-src", "data-original", "data-cfsrc", "src"] as const;

/** L'adresse d'une image, d'après le premier de ses attributs qui en donne une. */
export function imageAddress(tag: HtmlTag, base: string | URL, names: readonly string[] = IMAGE_ATTRIBUTES): string | undefined {
  for (const name of names) {
    const address = resolveAddress(tag.attributes[name], base);
    if (address) return address;
  }
  return undefined;
}

/**
 * Les adresses des images d'une page que `accept` retient, dans l'ordre du
 * document, chacune une seule fois (une image paresseuse est souvent doublée
 * dans un `<noscript>`).
 */
export function imageAddresses(html: string, base: string | URL, accept: (tag: HtmlTag, address: URL) => boolean, names: readonly string[] = IMAGE_ATTRIBUTES): string[] {
  const seen = new Set<string>();
  for (const tag of findTags(html, "img")) {
    const address = imageAddress(tag, base, names);
    if (address && !seen.has(address) && accept(tag, new URL(address))) seen.add(address);
  }
  return [...seen];
}

// ─── Ce que la page dit d'elle-même ──────────────────────────────

/** Le contenu de `<title>`. */
export function pageTitle(html: string): string | undefined {
  return findElements(html, "title")[0]?.text;
}

/** Le contenu d'une balise `<meta>`, désignée par `property`, `name` ou `itemprop` : « og:title », « description ». */
export function metaContent(html: string, key: string, max = 500): string | undefined {
  const wanted = key.toLowerCase();
  for (const tag of findTags(html, "meta")) {
    const name = (tag.attributes.property ?? tag.attributes.name ?? tag.attributes.itemprop ?? "").trim().toLowerCase();
    if (name !== wanted) continue;
    const content = cleanText(tag.attributes.content, max);
    if (content) return content;
  }
  return undefined;
}

/** `og:image`, rendue absolue. */
export function metaImage(html: string, base: string | URL): string | undefined {
  return resolveAddress(metaContent(html, "og:image", 2000), base);
}

/** La langue déclarée par `<html lang>`, en code court : « fr-FR » donne « fr ». */
export function pageLanguage(html: string): string | undefined {
  const lang = findTags(html, "html")[0]?.attributes.lang?.trim().toLowerCase() ?? "";
  return /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/.test(lang) ? lang.split(/[-_]/)[0] : undefined;
}

/** Les morceaux d'un titre de page, que les sites séparent par un tiret ou une barre entourés d'espaces. */
export function splitTitle(title: string | undefined): string[] {
  return (title ?? "")
    .split(/\s+[-|–—·»:]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// ─── Ce qui n'est pas la page attendue ───────────────────────────

/**
 * `challenge` : le site demande une vérification du navigateur (page
 * d'attente, captcha) ; `login` : il demande un compte ; `age-gate` : il demande
 * de confirmer son âge. Aucun de ces cas ne se contourne.
 */
export type Barrier = "challenge" | "login" | "age-gate";

const CHALLENGE_TITLE = /^\s*(?:just a moment|un instant|attention required|checking your browser|vérification (?:de sécurité|du navigateur)|security check|ddos-guard|access denied|please wait)/i;
/** Marques que seule une page de vérification porte. Le script de mesure que Cloudflare glisse dans les pages ordinaires n'en fait pas partie. */
const CHALLENGE_BODY = /_cf_chl_opt|cf_chl_(?:prog|rc_|seq_)|id\s*=\s*["']?challenge-(?:form|error-text|running|stage)|class\s*=\s*["'][^"']*\bcf-(?:browser-verification|im-under-attack|challenge-running)\b/i;

/**
 * Cette réponse est-elle une page de vérification du navigateur ? D'après
 * l'en-tête que Cloudflare pose (`cf-mitigated: challenge`), le titre de la
 * page ou les marques propres à ces pages. Sert aussi au client poli, pour ne
 * pas prendre une telle réponse (HTTP 503) pour une panne à retenter.
 */
export function isChallengeResponse(status: number, headers: Record<string, string>, body: Buffer | string): boolean {
  if ((headers["cf-mitigated"] ?? "").toLowerCase().includes("challenge")) return true;
  const type = (headers["content-type"] ?? "").toLowerCase();
  if (type && !type.includes("html")) return false;
  const html = typeof body === "string" ? body.slice(0, 200_000) : body.subarray(0, 200_000).toString("utf-8");
  if (CHALLENGE_BODY.test(html)) return true;
  // Un titre d'attente ne suffit que si la page n'a pas été servie normalement.
  return (status === 403 || status === 503 || status === 429) && CHALLENGE_TITLE.test(pageTitle(html) ?? "");
}

const LOGIN_PATH = /(?:^|\/)(?:wp-login\.php|login|log-in|signin|sign-in|connexion|se-connecter|auth)(?:\/|\.php|\.html|$)/i;
const LOGIN_TITLE = /^\s*(?:log ?in|sign ?in|connexion|se connecter|identification|members? only)\b/i;

/**
 * Ce qui, dès la réponse, dit que la page n'est pas servie à un visiteur
 * anonyme : vérification du navigateur, ou renvoi vers une page de connexion.
 * `url` est l'adresse finale, redirections suivies.
 */
export function detectBarrier(page: { status: number; headers: Record<string, string>; html: string; url: string | URL }): Barrier | null {
  if (isChallengeResponse(page.status, page.headers, page.html)) return "challenge";
  let path = "";
  try {
    path = new URL(page.url.toString()).pathname;
  } catch {
    // Adresse illisible : on s'en tient au reste.
  }
  if (page.status === 401 || LOGIN_PATH.test(path) || LOGIN_TITLE.test(pageTitle(page.html) ?? "")) return "login";
  return null;
}

const LOGIN_TEXT =
  /\b(?:you (?:must|need to|have to)|please) (?:be )?(?:log(?:ged)? ?in|sign(?:ed)? ?in|register)\b|\b(?:log ?in|sign ?in) to (?:read|view|continue|see)\b|\bmembers[- ]only\b|\bvous devez (?:être connecté|vous connecter|vous identifier)|\bconnectez-vous pour\b|\bréservé aux (?:membres|abonnés)\b/i;
const AGE_TEXT = /\bage verification\b|\bverify your age\b|\b(?:are you|you must be) (?:over |at least )?18\b|\bvérification de l['’]âge\b|\bavez-vous plus de 18 ans\b|\bréservé aux adultes\b/i;
const CAPTCHA_WIDGET = /class\s*=\s*["'][^"']*\b(?:cf-turnstile|g-recaptcha|h-captcha)\b/i;

/**
 * Ce qui, dans une page servie normalement mais SANS les images attendues,
 * explique leur absence : un texte qui demande un compte ou de confirmer son
 * âge, un captcha. À n'appeler que dans ce cas : bien des pages ordinaires
 * portent une fenêtre de connexion ou un captcha pour leurs commentaires.
 * `captcha: false` ne retient que les textes.
 */
export function detectWall(html: string, options: { captcha?: boolean } = {}): Barrier | null {
  const source = stripInert(html);
  const text = decodeEntities(source.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
  if (LOGIN_TEXT.test(text)) return "login";
  if (AGE_TEXT.test(text)) return "age-gate";
  if (options.captcha !== false && CAPTCHA_WIDGET.test(source)) return "challenge";
  return null;
}

/** Une page sans rien à lire : ni texte, ni image. */
export function isEmptyPage(html: string): boolean {
  const source = stripInert(html);
  if (/<img[\s/>]/i.test(source)) return false;
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(source)?.[1] ?? source.replace(/<head\b[\s\S]*?<\/head\s*>/i, " ");
  return (textOf(body, 400) ?? "").length < 20;
}
