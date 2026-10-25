/**
 * Logos officiels en SVG (dossier 01, « illustrations animées », étape I4).
 *
 * La plupart des logos officiels n'existent qu'en SVG. Un SVG est un
 * document, pas des pixels : il peut contenir des scripts, des gestionnaires
 * d'évènements, du HTML (`foreignObject`), des liens vers d'autres fichiers
 * ou d'autres sites, et des références imbriquées qui font exploser le rendu.
 * Il n'est donc jamais servi ni dessiné tel quel :
 *
 * 1. **Nettoyage** (`sanitizeSvg`) : le fichier est lu par un analyseur XML
 *    strict (saxes, conforme à la norme XML 1.0 et aux espaces de noms), puis
 *    **réécrit** à partir d'une liste fermée d'éléments et d'attributs. Ce qui
 *    n'est pas sur la liste disparaît ; rien n'est recopié tel qu'il est
 *    arrivé, sauf les valeurs contrôlées une à une.
 * 2. **Rastérisation** (`rasterizeSvg`) : le SVG nettoyé est dessiné en PNG
 *    transparent par sharp (librsvg), 512 px sur le grand côté. Le rendu du
 *    canevas, l'export et tous les consommateurs reçoivent donc une image
 *    ordinaire, contrôlée ensuite comme les autres (`checkImage`).
 *
 * Pourquoi sharp et pas `@napi-rs/canvas` : les deux savent dessiner un SVG,
 * mais le moteur SVG du canevas ignore les feuilles de style (`<style>` et
 * classes), très fréquentes dans les logos exportés par les logiciels de
 * dessin ; librsvg les applique. sharp est déjà la bibliothèque d'images de
 * cette recherche.
 */

import { SaxesParser, type SaxesTagNS } from "saxes";
import sharp, { type OutputInfo } from "sharp";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

export const SVG_LIMITS = {
  /** Poids du fichier reçu : un logo pèse rarement plus de quelques centaines de Ko. */
  maxBytes: 1_500_000,
  /** Éléments lus, gardés ou non. */
  maxElements: 5_000,
  /** Profondeur d'imbrication. */
  maxDepth: 48,
  /** Éléments dessinés une fois les références (`use`, `url(#…)`) développées. */
  maxExpandedElements: 20_000,
  /** Image matricielle incorporée (`data:`), en caractères. */
  maxDataUriLength: 1_000_000,
  /** Valeur d'attribut, en caractères (un tracé `d` peut être long). */
  maxAttributeLength: 500_000,
  /** Feuille de style, en caractères. */
  maxStyleSheetLength: 100_000,
  /** Côté intrinsèque (viewBox) le plus grand accepté. */
  maxIntrinsicSide: 1_000_000,
  /** Grand côté du PNG rendu. */
  longSide: 512,
  /** Petit côté minimal du PNG rendu (celui d'une icône, `FOUND_LIMITS.iconMinShortSide`). */
  minShortSide: 128,
  /** Grand côté le plus grand, quand un logo très allongé doit garder son petit côté. */
  maxLongSide: 1024,
  /** Part minimale de pixels visibles : un logo vide ou invisible est refusé. */
  minCoverage: 0.002,
} as const;

/** Un SVG refusé ; le message est en français, montrable tel quel. */
export class SvgRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgRefusedError";
  }
}

const refuse = (message: string): never => {
  throw new SvgRefusedError(message);
};

// ─── Listes fermées ──────────────────────────────────────────────

/** Éléments gardés, avec leurs enfants. */
const KEPT_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "style",
  "image",
  "filter",
  "feGaussianBlur",
  "feOffset",
  "feFlood",
  "feComposite",
  "feMerge",
  "feMergeNode",
  "feColorMatrix",
  "feBlend",
  "feComponentTransfer",
  "feFuncR",
  "feFuncG",
  "feFuncB",
  "feFuncA",
  "feDropShadow",
]);

/**
 * Éléments remplacés par un simple groupe : un lien (`a`) perd sa cible,
 * un `switch` (Illustrator y range une version `foreignObject`, retirée, et
 * le dessin) garde ce qui reste.
 */
const UNWRAPPED_ELEMENTS = new Set(["a", "switch"]);

/** Éléments qui désignent un autre élément par `href` ; sur les autres, `href` est retiré. */
const HREF_ELEMENTS = new Set(["use", "image", "linearGradient", "radialGradient", "pattern", "filter"]);

/** Éléments dont le texte compte. */
const TEXT_ELEMENTS = new Set(["text", "tspan", "style"]);

/** Propriétés de présentation : en attribut comme dans un `style`. */
const PRESENTATION = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "clip-path",
  "clip-rule",
  "mask",
  "filter",
  "color",
  "display",
  "visibility",
  "overflow",
  "stop-color",
  "stop-opacity",
  "flood-color",
  "flood-opacity",
  "lighting-color",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "baseline-shift",
  "letter-spacing",
  "word-spacing",
  "text-decoration",
  "writing-mode",
  "direction",
  "unicode-bidi",
  "marker",
  "marker-start",
  "marker-mid",
  "marker-end",
  "paint-order",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
  "color-interpolation",
  "color-interpolation-filters",
  "mix-blend-mode",
  "isolation",
  "vector-effect",
]);

/** Propriétés acceptées dans un `style` : la présentation, plus la transformation. */
const CSS_PROPERTIES = new Set([...PRESENTATION, "transform", "transform-origin"]);

/** Géométrie et structure. `href` est traité à part. */
const GEOMETRY = new Set([
  "id",
  "class",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "fr",
  "width",
  "height",
  "d",
  "points",
  "pathLength",
  "transform",
  "transform-origin",
  "viewBox",
  "preserveAspectRatio",
  "offset",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "filterUnits",
  "primitiveUnits",
  "markerUnits",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "orient",
  "dx",
  "dy",
  "rotate",
  "textLength",
  "lengthAdjust",
  "in",
  "in2",
  "result",
  "stdDeviation",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "mode",
  "values",
  "type",
  "tableValues",
  "slope",
  "intercept",
  "amplitude",
  "exponent",
  "style",
]);

/** Référence interne au document : `#identifiant`, jamais une adresse. */
const LOCAL_REF = /^#[A-Za-z_][\w.:-]*$/;
/** `url(#identifiant)`, guillemets facultatifs, au début de la chaîne examinée. */
const LOCAL_URL = /^url\(\s*(?:"#[A-Za-z_][\w.:-]*"|'#[A-Za-z_][\w.:-]*'|#[A-Za-z_][\w.:-]*)\s*\)/i;
const LOCAL_URL_TARGETS = /url\(\s*["']?#([A-Za-z_][\w.:-]*)["']?\s*\)/gi;
/** Image matricielle incorporée : PNG, JPEG, GIF ou WebP en base 64, jamais un autre SVG. */
const RASTER_DATA_URI = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;
/**
 * Contenus jamais acceptés dans une valeur ou une feuille de style : barre
 * oblique inverse (un échappement CSS cacherait `url`), chevron, règle `@`
 * (`@import`, `@font-face`), vieilles extensions qui exécutent du code.
 */
const FORBIDDEN_CSS = /[\\<@]|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i;

/** Chaque `url(` de la valeur désigne-t-il un élément du document ? */
function onlyLocalUrls(value: string): boolean {
  const lower = value.toLowerCase();
  let index = lower.indexOf("url(");
  while (index !== -1) {
    if (!LOCAL_URL.test(value.slice(index))) return false;
    index = lower.indexOf("url(", index + 4);
  }
  return true;
}

function safeValue(value: string): boolean {
  return value.length <= SVG_LIMITS.maxAttributeLength && !FORBIDDEN_CSS.test(value) && onlyLocalUrls(value);
}

/** Déclarations d'un attribut `style`, réduites aux propriétés connues. `null` : plus rien. */
function cleanStyleAttribute(value: string, removed: Set<string>): string | null {
  const kept: string[] = [];
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const propertyValue = declaration.slice(colon + 1).trim();
    if (!CSS_PROPERTIES.has(property) || !propertyValue || !safeValue(propertyValue)) {
      removed.add(`style:${property}`);
      continue;
    }
    kept.push(`${property}:${propertyValue}`);
  }
  return kept.length ? kept.join(";") : null;
}

/** Une feuille de style est gardée entière ou pas du tout. */
function safeStyleSheet(text: string): boolean {
  return text.length <= SVG_LIMITS.maxStyleSheetLength && !FORBIDDEN_CSS.test(text) && onlyLocalUrls(text);
}

// ─── Arbre nettoyé ───────────────────────────────────────────────

interface SvgNode {
  name: string;
  attributes: [string, string][];
  children: (SvgNode | string)[];
}

interface CleanDocument {
  root: SvgNode;
  width: number;
  height: number;
  elements: number;
  removed: string[];
}

/** Pixels par unité absolue (96 px par pouce). */
const LENGTH_UNITS = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 } as const;

/** Longueur CSS absolue, en pixels ; `null` pour un pourcentage, une unité relative ou une valeur illisible. */
function parseLength(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(value);
  if (!match) return null;
  const factor = LENGTH_UNITS[(match[2] ?? "px").toLowerCase() as keyof typeof LENGTH_UNITS];
  const pixels = Number(match[1]) * factor;
  return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
}

function parseViewBox(value: string | undefined): [number, number, number, number] | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  return parts[2] > 0 && parts[3] > 0 ? (parts as [number, number, number, number]) : null;
}

/** Texte brut en entrée : UTF-8, marque d'ordre des octets retirée. */
function decode(input: Buffer | string): string {
  const text = typeof input === "string" ? input : input.toString("utf-8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Le fichier ressemble-t-il à un SVG ? Type annoncé `image/svg+xml`, ou un
 * texte qui commence par « < » et contient une balise `<svg`. Un PNG, un
 * JPEG ou un WebP commencent par des octets binaires ; un SVG compressé
 * (`.svgz`) n'est pas reconnu, donc refusé plus loin.
 */
export function looksLikeSvg(buffer: Buffer, mimeType?: string): boolean {
  if (String(mimeType ?? "").toLowerCase() === "image/svg+xml") return true;
  const head = decode(buffer.subarray(0, 65_536)).trimStart();
  return head.startsWith("<") && /<svg[\s>/]/.test(head);
}

/** Lit, contrôle et réécrit le document. Lève `SvgRefusedError` si rien de sûr n'en sort. */
function cleanDocument(input: Buffer | string): CleanDocument {
  const size = typeof input === "string" ? Buffer.byteLength(input) : input.length;
  if (size > SVG_LIMITS.maxBytes) refuse("SVG trop lourd.");
  const source = decode(input);

  const removed = new Set<string>();
  const parser = new SaxesParser({ xmlns: true, position: false });
  /** Pile des éléments ouverts : un nœud gardé, ou `null` pour un élément retiré avec ses enfants. */
  const stack: (SvgNode | null)[] = [];
  let root: SvgNode | null = null;
  let rootNamespace = "";
  let elements = 0;

  parser.on("doctype", () => refuse("SVG refusé : déclaration DOCTYPE (entités) non acceptée."));
  parser.on("processinginstruction", (instruction) => removed.add(`?${instruction.target}`));
  parser.on("opentag", (tag: SaxesTagNS) => {
    elements++;
    if (elements > SVG_LIMITS.maxElements) refuse("SVG trop complexe (trop d'éléments).");
    if (stack.length >= SVG_LIMITS.maxDepth) refuse("SVG trop profondément imbriqué.");
    const parent = stack.length ? stack[stack.length - 1] : undefined;

    if (stack.length === 0) {
      if (tag.local !== "svg" || (tag.uri !== SVG_NS && tag.uri !== "")) refuse("Ce fichier n'est pas un SVG.");
      rootNamespace = tag.uri;
    }
    // Dans un élément retiré, tout est retiré.
    if (parent === null) {
      stack.push(null);
      return;
    }
    const inSvg = tag.uri === SVG_NS || (tag.uri === "" && rootNamespace === "");
    const name = inSvg && UNWRAPPED_ELEMENTS.has(tag.local) ? "g" : tag.local;
    if (!inSvg || !KEPT_ELEMENTS.has(name)) {
      removed.add(tag.name);
      stack.push(null);
      return;
    }

    const node: SvgNode = { name, attributes: [], children: [] };
    for (const attribute of Object.values(tag.attributes)) {
      const value = attribute.value;
      // Déclarations d'espaces de noms : la racine réécrite déclare les siennes.
      if (attribute.prefix === "xmlns" || attribute.name === "xmlns") continue;
      if (attribute.local === "href" && (attribute.uri === XLINK_NS || attribute.uri === "")) {
        const keep = !HREF_ELEMENTS.has(name) ? false : name === "image" ? RASTER_DATA_URI.test(value) && value.length <= SVG_LIMITS.maxDataUriLength : LOCAL_REF.test(value.trim());
        if (keep) node.attributes.push(["xlink:href", name === "image" ? value.replace(/\s+/g, "") : value.trim()]);
        else removed.add(`${name}@href`);
        continue;
      }
      if (attribute.uri === XML_NS && attribute.local === "space") {
        if (value === "preserve" || value === "default") node.attributes.push(["xml:space", value]);
        continue;
      }
      if (attribute.uri !== "" || !(GEOMETRY.has(attribute.local) || PRESENTATION.has(attribute.local))) {
        removed.add(`@${attribute.name}`);
        continue;
      }
      if (attribute.local === "style") {
        const style = cleanStyleAttribute(value, removed);
        if (style) node.attributes.push(["style", style]);
        continue;
      }
      if (!safeValue(value)) {
        removed.add(`@${attribute.name}`);
        continue;
      }
      node.attributes.push([attribute.local, value]);
    }
    // Une image sans source sûre, une feuille de style d'un autre langage : retirées.
    const type = node.attributes.find(([key]) => key === "type")?.[1];
    if ((name === "image" && !node.attributes.some(([key]) => key === "xlink:href")) || (name === "style" && type !== undefined && type !== "text/css")) {
      removed.add(name);
      stack.push(null);
      return;
    }
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on("closetag", () => {
    const node = stack.pop();
    if (node?.name !== "style") return;
    const text = node.children.filter((child): child is string => typeof child === "string").join("");
    if (text.trim() && safeStyleSheet(text)) {
      node.children = [text];
      return;
    }
    // Feuille vide ou douteuse : retirée entière, rien n'en reste dans le document.
    if (text.trim()) removed.add("style");
    const parent = stack[stack.length - 1];
    if (parent) parent.children = parent.children.filter((child) => child !== node);
  });
  const onText = (text: string) => {
    const node = stack[stack.length - 1];
    if (node && TEXT_ELEMENTS.has(node.name)) node.children.push(text);
  };
  parser.on("text", onText);
  parser.on("cdata", onText);

  try {
    parser.write(source).close();
  } catch (error) {
    if (error instanceof SvgRefusedError) throw error;
    refuse("SVG illisible (XML invalide).");
  }
  if (!root) return refuse("Ce fichier n'est pas un SVG.");
  const svg: SvgNode = root;

  // Taille intrinsèque : la viewBox, ou à défaut la largeur et la hauteur en unités absolues.
  const attribute = (name: string) => svg.attributes.find(([key]) => key === name)?.[1];
  const viewBox =
    parseViewBox(attribute("viewBox")) ??
    (() => {
      const width = parseLength(attribute("width"));
      const height = parseLength(attribute("height"));
      return width && height ? ([0, 0, width, height] as [number, number, number, number]) : null;
    })();
  if (!viewBox) return refuse("SVG sans dimensions (ni viewBox, ni largeur et hauteur absolues).");
  if (viewBox[2] > SVG_LIMITS.maxIntrinsicSide || viewBox[3] > SVG_LIMITS.maxIntrinsicSide) refuse("Dimensions du SVG démesurées.");
  svg.attributes = [
    ...svg.attributes.filter(([key]) => !["x", "y", "width", "height", "viewBox"].includes(key)),
    ["viewBox", viewBox.join(" ")],
  ];

  dropDanglingUses(svg, collectIds(svg), removed);
  checkExpansion(svg, elements);

  return { root: svg, width: viewBox[2], height: viewBox[3], elements: countNodes(svg), removed: [...removed].sort() };
}

function collectIds(root: SvgNode): Map<string, SvgNode> {
  const ids = new Map<string, SvgNode>();
  const visit = (node: SvgNode) => {
    const id = node.attributes.find(([key]) => key === "id")?.[1];
    if (id && !ids.has(id)) ids.set(id, node);
    for (const child of node.children) if (typeof child !== "string") visit(child);
  };
  visit(root);
  return ids;
}

/** Un `use` qui ne désigne aucun élément du document ne dessine rien : retiré. */
function dropDanglingUses(node: SvgNode, ids: Map<string, SvgNode>, removed: Set<string>) {
  node.children = node.children.filter((child) => {
    if (typeof child === "string") return true;
    if (child.name === "use") {
      const href = child.attributes.find(([key]) => key === "xlink:href")?.[1];
      if (!href || !ids.has(href.slice(1))) {
        removed.add("use");
        return false;
      }
    }
    dropDanglingUses(child, ids, removed);
    return true;
  });
}

function countNodes(node: SvgNode): number {
  return 1 + node.children.reduce((sum, child) => sum + (typeof child === "string" ? 0 : countNodes(child)), 0);
}

/** Identifiants désignés par un nœud : son `href`, et chaque `url(#…)` de ses attributs. */
function referencesOf(node: SvgNode): string[] {
  const targets: string[] = [];
  for (const [key, value] of node.attributes) {
    if (key === "xlink:href" && value.startsWith("#")) targets.push(value.slice(1));
    for (const match of value.matchAll(LOCAL_URL_TARGETS)) targets.push(match[1]);
  }
  return targets;
}

/**
 * Coût du rendu une fois les références développées : un `use` dessine sa
 * cible, un `fill="url(#motif)"` dessine le motif. Dix `use` qui désignent
 * chacun un groupe de dix `use`… se multiplient : au-delà de
 * `maxExpandedElements`, ou devant une boucle, le SVG est refusé.
 */
function checkExpansion(root: SvgNode, parsedElements: number) {
  const ids = collectIds(root);
  const memo = new Map<SvgNode, number>();
  const visiting = new Set<SvgNode>();
  const limit = SVG_LIMITS.maxExpandedElements;
  let sheetReferences: string[] = [];

  const cost = (node: SvgNode): number => {
    const known = memo.get(node);
    if (known !== undefined) return known;
    if (visiting.has(node)) refuse("SVG refusé : références en boucle.");
    visiting.add(node);
    let total = 1;
    for (const child of node.children) {
      if (typeof child === "string") {
        if (node.name === "style") sheetReferences = sheetReferences.concat([...child.matchAll(LOCAL_URL_TARGETS)].map((match) => match[1]));
        continue;
      }
      total += cost(child);
      if (total > limit) refuse("SVG trop complexe à dessiner.");
    }
    for (const target of referencesOf(node)) {
      const referenced = ids.get(target);
      if (referenced) total += cost(referenced);
      if (total > limit) refuse("SVG trop complexe à dessiner.");
    }
    visiting.delete(node);
    memo.set(node, total);
    return total;
  };

  let total = cost(root);
  // Une feuille de style peut appliquer un motif à tous les éléments : compté pour chacun.
  for (const target of sheetReferences) {
    const referenced = ids.get(target);
    if (referenced) total += cost(referenced) * parsedElements;
    if (total > limit) refuse("SVG trop complexe à dessiner.");
  }
}

// ─── Écriture ────────────────────────────────────────────────────

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, "&quot;").replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");

function serialize(node: SvgNode, out: string[], rootAttributes?: [string, string][]) {
  out.push("<", node.name);
  for (const [key, value] of rootAttributes ?? []) out.push(" ", key, '="', escapeAttribute(value), '"');
  for (const [key, value] of node.attributes) out.push(" ", key, '="', escapeAttribute(value), '"');
  if (node.children.length === 0) {
    out.push("/>");
    return;
  }
  out.push(">");
  for (const child of node.children) {
    if (typeof child === "string") out.push(escapeText(child));
    else serialize(child, out);
  }
  out.push("</", node.name, ">");
}

function toMarkup(document: CleanDocument, width: number, height: number): string {
  const out: string[] = [];
  serialize(document.root, out, [
    ["xmlns", SVG_NS],
    ["xmlns:xlink", XLINK_NS],
    ["width", String(width)],
    ["height", String(height)],
  ]);
  return out.join("");
}

// ─── API ─────────────────────────────────────────────────────────

export interface SanitizedSvg {
  /** Le SVG réécrit, à sa taille intrinsèque. */
  markup: string;
  /** Taille intrinsèque (celle de la viewBox). */
  width: number;
  height: number;
  /** Éléments gardés. */
  elements: number;
  /** Ce qui a été retiré (éléments, `@attributs`, `style:propriétés`), pour le journal et les tests. */
  removed: string[];
}

/**
 * Nettoie un SVG : seuls des éléments de dessin et des attributs de
 * présentation connus restent, chaque référence désigne un élément du
 * document, et la racine porte une viewBox. Lève `SvgRefusedError` quand le
 * fichier n'est pas un SVG sûr (XML invalide, DOCTYPE, trop lourd, trop
 * complexe, références en boucle, sans dimensions).
 */
export function sanitizeSvg(input: Buffer | string): SanitizedSvg {
  const document = cleanDocument(input);
  return {
    markup: toMarkup(document, document.width, document.height),
    width: document.width,
    height: document.height,
    elements: document.elements,
    removed: document.removed,
  };
}

/** Taille du PNG rendu : `longSide` sur le grand côté, petit côté d'au moins `minShortSide` dans la limite de `maxLongSide`. */
export function rasterSize(width: number, height: number, longSide: number = SVG_LIMITS.longSide): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  let scale = longSide / long;
  if (short * scale < SVG_LIMITS.minShortSide) scale = Math.min(SVG_LIMITS.minShortSide / short, SVG_LIMITS.maxLongSide / long);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface RasterizedSvg {
  /** PNG transparent. */
  buffer: Buffer;
  width: number;
  height: number;
  /** Part des pixels visibles (alpha non nul). */
  coverage: number;
  removed: string[];
}

/**
 * Nettoie puis rastérise un SVG en PNG transparent (512 px sur le grand côté
 * par défaut). Le SVG reçu n'atteint jamais le moteur de rendu : seul le
 * document réécrit par `sanitizeSvg` y passe. Un rendu vide ou presque
 * (moins de 0,2 % de pixels visibles) est refusé : c'est un logo cassé ou
 * dessiné en dehors de sa viewBox.
 */
export async function rasterizeSvg(input: Buffer | string, options: { longSide?: number } = {}): Promise<RasterizedSvg> {
  const document = cleanDocument(input);
  const size = rasterSize(document.width, document.height, options.longSide);
  let rendered: { data: Buffer; info: OutputInfo };
  try {
    rendered = await sharp(Buffer.from(toMarkup(document, size.width, size.height)), { density: 72, limitInputPixels: size.width * size.height * 4 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return refuse("Ce SVG n'a pas pu être dessiné.");
  }
  const { data, info } = rendered;
  let visible = 0;
  for (let index = 3; index < data.length; index += info.channels) if (data[index] > 0) visible++;
  const coverage = visible / (info.width * info.height);
  if (coverage < SVG_LIMITS.minCoverage) refuse("Ce SVG ne dessine rien de visible.");
  const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png({ compressionLevel: 8 }).toBuffer();
  return { buffer, width: info.width, height: info.height, coverage, removed: document.removed };
}
