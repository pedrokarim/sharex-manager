/**
 * Rôle d'une image jointe à une génération, partagé par l'interface et les
 * moteurs. Chaque rôle a un libellé pour l'écran et une consigne pour le
 * modèle : c'est cette consigne qui dit au moteur quoi prendre dans l'image.
 *
 * `auto` est le rôle d'une image qu'on vient de joindre : c'est le message
 * qui dit ce qu'on en fait, en la désignant par son numéro (« sers-toi de
 * l'image 1 comme référence pour retoucher l'image 2 »). `reference` est
 * l'ancien rôle « Inspiration », gardé pour l'historique.
 */

export const REFERENCE_ROLES = [
  "auto",
  "reference",
  "style",
  "subject",
  "composition",
  "palette",
  "edit-target",
] as const;

export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export interface ReferenceRoleInfo {
  /** Libellé court, sur la vignette. */
  label: string;
  /** Ce que fait le rôle, en une phrase, pour l'utilisateur. */
  hint: string;
  /** Consigne transmise au modèle. */
  instruction: string;
}

export const REFERENCE_ROLE_INFO: Record<ReferenceRole, ReferenceRoleInfo> = {
  auto: {
    label: "Auto",
    hint: "Votre message dit ce que devient l’image, en la désignant par son numéro. Sans précision, elle sert d’inspiration.",
    instruction:
      "rôle à lire dans la demande, qui la désigne par son numéro ; si la demande n’en dit rien, simple référence d’inspiration, à ne pas retoucher",
  },
  reference: {
    label: "Inspiration",
    hint: "Le modèle s’en inspire librement : style, sujet ou ambiance.",
    instruction:
      "référence d’inspiration : t’en inspirer librement (style, sujet ou ambiance) sans la recopier ni la retoucher",
  },
  style: {
    label: "Style",
    hint: "Reprend le rendu : technique, lumière, texture. Pas le contenu.",
    instruction:
      "référence de style : reprendre le rendu, la technique, la lumière et la texture, pas le contenu",
  },
  subject: {
    label: "Sujet",
    hint: "Garde ce personnage ou cet objet reconnaissable, dans une nouvelle scène.",
    instruction:
      "référence de sujet : garder ce personnage ou cet objet reconnaissable (traits, forme, tenue, couleurs) dans la nouvelle scène",
  },
  composition: {
    label: "Composition",
    hint: "Reprend le cadrage, la disposition et la perspective.",
    instruction:
      "référence de composition : reprendre le cadrage, la disposition des éléments et la perspective, pas le style ni le sujet",
  },
  palette: {
    label: "Couleurs",
    hint: "Reprend la palette et l’ambiance colorée seulement.",
    instruction:
      "référence de couleurs : reprendre seulement la palette et l’ambiance colorée",
  },
  "edit-target": {
    label: "Retouche",
    hint: "L’image est retouchée : seul ce que décrit le prompt change.",
    instruction:
      "image à retoucher : c’est elle qu’il faut modifier, en conservant tout ce que la demande ne fait pas varier (cadrage, sujet, style)",
  },
};

export function isReferenceRole(value: unknown): value is ReferenceRole {
  return typeof value === "string" && (REFERENCE_ROLES as readonly string[]).includes(value);
}

/** Rôle sûr : une valeur inconnue devient une simple inspiration. */
export function normalizeReferenceRole(value: unknown): ReferenceRole {
  return isReferenceRole(value) ? value : "reference";
}

// ─── Lecture du message ──────────────────────────────────────────

/** Mots qui donnent un rôle à l'image qu'ils désignent. */
const ROLE_CUES: { role: ReferenceRole; pattern: RegExp }[] = [
  { role: "edit-target", pattern: /(?<!\p{L})(?:modifi|retouch|chang|corrig|transform|appliqu|remplac|ajout|enl[eè]v|retir|effac|[ée]dit)\p{L}*/giu },
  { role: "reference", pattern: /(?<!\p{L})(?:r[ée]f[ée]rence|inspir|mod[eè]le)\p{L}*/giu },
  { role: "style", pattern: /(?<!\p{L})(?:style|rendu|technique)s?(?!\p{L})/giu },
  { role: "subject", pattern: /(?<!\p{L})(?:personnage|sujet|visage|mascotte|perso)s?(?!\p{L})/giu },
  { role: "composition", pattern: /(?<!\p{L})(?:composition|cadrage|disposition|perspective)s?(?!\p{L})/giu },
  { role: "palette", pattern: /(?<!\p{L})(?:couleur|palette|teinte|colorim[ée]trie)s?(?!\p{L})/giu },
];

/** Un verbe de retouche devant le nom (« modifie le style de l'image 2 ») fait de l'image celle à retoucher. */
const EDIT_BEFORE_NOUN = /(?:modifi|retouch|chang|corrig|transform)\p{L}*(?:-l[ae])?\s+(?:le|la|les|son|sa|ses|l['’])\s*$/iu;

/** Ce qui peut séparer un mot de l'image qu'il précède : « modifier l'image 2 », « le style de l'image 1 ». */
const GAP_BEFORE = /^[\s,]*(?:-l(?:e|a|es)\s*)?(?:(?:[àa]|sur|dans|de|du|des|d['’]|pour)\s*)?(?:(?:l['’]|la|le|les|une|un|cette|ma|mon)\s*)?$/iu;

/** Ce qui peut séparer une image du nom qui la suit : « l'image 1 comme référence », « cette image va servir de référence ». */
const GAP_AFTER = /^[\s,:=]*(?:(?:sert|servira|servir|va\s+servir|est|sera)\s+(?:de\s+|d['’])?|comme\s+|en\s+(?:tant\s+que\s+)?|pour\s+)?(?:(?:l['’]|la|le|les|sa|son|ses|une?)\s*)?$/iu;

const ORDINALS: Record<string, number> = { premi: 1, deuxi: 2, second: 2, troisi: 3, quatri: 4 };

interface Mention {
  /** Numéro de l'image (1 pour la première), ou `null` pour « cette image ». */
  number: number | null;
  start: number;
  end: number;
}

function mentionsIn(clause: string): Mention[] {
  const found: Mention[] = [];
  const numbered = /(?<!\p{L})images?\s*(?:n[°o]\.?\s*|num[ée]ro\s*)?(\d+)(?!\d)/giu;
  for (const match of clause.matchAll(numbered)) {
    found.push({ number: Number(match[1]), start: match.index!, end: match.index! + match[0].length });
  }
  const ordinal = /(?<!\p{L})(premi|deuxi|second|troisi|quatri)\p{L}*\s+image(?!\p{L})/giu;
  for (const match of clause.matchAll(ordinal)) {
    found.push({ number: ORDINALS[match[1].toLowerCase()], start: match.index!, end: match.index! + match[0].length });
  }
  // « cette image », « l'image » sans numéro.
  const deictic = /(?<!\p{L})(?:cette|l['’])\s*image(?!s|\s*(?:n[°o]|num|\d))/giu;
  for (const match of clause.matchAll(deictic)) {
    if (found.some((mention) => match.index! < mention.end && match.index! + match[0].length > mention.start)) continue;
    found.push({ number: null, start: match.index!, end: match.index! + match[0].length });
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Rôle donné par les mots qui touchent la mention, ou rien si la phrase ne le dit pas nettement. */
function roleOf(clause: string, mention: Mention): ReferenceRole | undefined {
  let best: { role: ReferenceRole; distance: number } | undefined;
  for (const cue of ROLE_CUES) {
    for (const match of clause.matchAll(cue.pattern)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (end <= mention.start) {
        const gap = clause.slice(end, mention.start);
        if (!GAP_BEFORE.test(gap)) continue;
        const role = cue.role !== "edit-target" && EDIT_BEFORE_NOUN.test(clause.slice(0, start)) ? "edit-target" : cue.role;
        if (!best || gap.length < best.distance) best = { role, distance: gap.length };
      } else if (start >= mention.end) {
        const gap = clause.slice(mention.end, start);
        // Un verbe qui suit l'image n'en dit rien (« l'image 1 et applique-le… ») : seuls les noms comptent.
        if (cue.role === "edit-target" || !GAP_AFTER.test(gap)) continue;
        if (!best || gap.length < best.distance) best = { role: cue.role, distance: gap.length };
      }
    }
  }
  return best?.role;
}

/**
 * Rôles que le message donne aux images jointes, désignées par leur numéro
 * (« image 2 », « image numéro 2 », « la deuxième image ») ou, quand une
 * seule reste à désigner, par « cette image ». Pur calcul, sans IA : une
 * phrase qui ne dit rien de net ne donne rien, et le modèle lit alors le
 * message lui-même. Index 0 pour l'image 1.
 */
export function rolesFromPrompt(prompt: string, count: number): (ReferenceRole | undefined)[] {
  const roles: (ReferenceRole | undefined)[] = Array.from({ length: count }, () => undefined);
  if (!count || !prompt.trim()) return roles;
  const clauses = prompt.split(/[.;!?\n]+/);
  const numbered = new Set<number>();
  for (const clause of clauses) {
    for (const mention of mentionsIn(clause)) if (mention.number) numbered.add(mention.number);
  }
  // « cette image » : la seule image jointe, ou la seule que le message ne désigne pas par son numéro.
  const unnamed = Array.from({ length: count }, (_, index) => index + 1).filter((number) => !numbered.has(number));
  const deicticNumber = count === 1 ? 1 : unnamed.length === 1 ? unnamed[0] : null;
  for (const clause of clauses) {
    for (const mention of mentionsIn(clause)) {
      const number = mention.number ?? deicticNumber;
      if (!number || number > count || roles[number - 1]) continue;
      roles[number - 1] = roleOf(clause, mention);
    }
  }
  return roles;
}

/** Rôles transmis au moteur : une image « Auto » prend celui que le message lui donne, s'il en donne un. */
export function resolveReferenceRoles(roles: (ReferenceRole | undefined)[], prompt: string): ReferenceRole[] {
  const detected = rolesFromPrompt(prompt, roles.length);
  return roles.map((role, index) => {
    const normalized = normalizeReferenceRole(role);
    return normalized === "auto" ? (detected[index] ?? "auto") : normalized;
  });
}

/**
 * Consigne qui précède le prompt quand des images sont jointes : une ligne
 * par image, numérotée dans l'ordre où le moteur les reçoit – le numéro que
 * la demande emploie. Sans image à retoucher, le modèle est prévenu qu'il
 * doit créer une image neuve, sinon une API de retouche reprendrait
 * simplement la première image.
 */
export function referenceBrief(roles: (ReferenceRole | undefined)[]): string {
  if (!roles.length) return "";
  const normalized = roles.map(normalizeReferenceRole);
  const lines = normalized.map((role, index) => `Image ${index + 1} : ${REFERENCE_ROLE_INFO[role].instruction}.`);
  const editing = normalized.filter((role) => role === "edit-target").length;
  const closing = editing
    ? editing < normalized.length
      ? "Les autres images ne servent que de références pour la retouche."
      : ""
    : normalized.includes("auto")
      ? "Si la demande ne désigne aucune image à modifier, crée une image nouvelle : ne retouche pas les images jointes."
      : "Crée une image nouvelle : ne retouche pas les images jointes, elles ne servent que de références.";
  const heading =
    normalized.length > 1
      ? "Images jointes, numérotées dans l’ordre où tu les reçois (la demande les désigne par ce numéro) :"
      : "Image jointe :";
  return [heading, ...lines, closing].filter(Boolean).join("\n");
}
