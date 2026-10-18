/**
 * Rôle d'une image jointe à une génération, partagé par l'interface et les
 * moteurs. Chaque rôle a un libellé pour l'écran et une consigne pour le
 * modèle : c'est cette consigne qui dit au moteur quoi prendre dans l'image.
 *
 * `reference` est l'ancien rôle « Inspiration », gardé pour l'historique et
 * pour une image dont on ne précise pas l'usage.
 */

export const REFERENCE_ROLES = [
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
  reference: {
    label: "Inspiration",
    hint: "Le modèle s’en inspire librement : style, sujet ou ambiance.",
    instruction:
      "référence d’inspiration : t’en inspirer librement (style, sujet ou ambiance) sans la recopier",
  },
  style: {
    label: "Style",
    hint: "Reprend le rendu : technique, lumière, texture. Pas le contenu.",
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
    hint: "L’image est retouchée : seul ce que décrit le prompt change.",
    instruction:
      "image à retoucher : conserver tout ce que la demande ne fait pas varier (cadrage, sujet, style)",
  },
};

export function isReferenceRole(value: unknown): value is ReferenceRole {
  return typeof value === "string" && (REFERENCE_ROLES as readonly string[]).includes(value);
}

/** Rôle sûr : une valeur inconnue devient une simple inspiration. */
export function normalizeReferenceRole(value: unknown): ReferenceRole {
  return isReferenceRole(value) ? value : "reference";
}

/**
 * Consigne qui précède le prompt quand des images sont jointes : une ligne
 * par image, dans l'ordre où le moteur les reçoit. Sans image à retoucher,
 * le modèle est prévenu qu'il doit créer une image neuve – sinon une API de
 * retouche reprendrait simplement la première image.
 */
export function referenceBrief(roles: (ReferenceRole | undefined)[]): string {
  if (!roles.length) return "";
  const lines = roles.map(
    (role, index) => `Image ${index + 1} : ${REFERENCE_ROLE_INFO[normalizeReferenceRole(role)].instruction}.`
  );
  const editing = roles.filter((role) => role === "edit-target").length;
  const closing = !editing
    ? "Crée une image nouvelle : ne retouche pas les images jointes, elles ne servent que de références."
    : editing < roles.length
      ? "Les autres images ne servent que de références pour la retouche."
      : "";
  return [roles.length > 1 ? "Images jointes :" : "Image jointe :", ...lines, closing]
    .filter(Boolean)
    .join("\n");
}
