import { randomBytes } from "crypto";

/**
 * Adresse publique d'un album : un préfixe lisible tiré du nom, puis un
 * suffixe aléatoire. Un album « public par son lien » n'est protégé que par
 * cette adresse : tirée du seul nom (« vacances », « vacances-1 »…), elle se
 * devinait. Le suffixe la rend imprévisible.
 */

/** 32 signes sans ambiguïté (ni l, ni o, ni 0, ni 1) : 5 bits par signe. */
const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** 12 signes de 5 bits : 60 bits tirés par un générateur cryptographique. */
export const SLUG_SUFFIX_LENGTH = 12;

const BASE_MAX_LENGTH = 50;

/** Forme d'une adresse produite ici (préfixe facultatif, suffixe aléatoire). */
export const PUBLIC_ALBUM_SLUG_PATTERN = new RegExp(
  `^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?[${SUFFIX_ALPHABET}]{${SLUG_SUFFIX_LENGTH}}$`
);

/** Préfixe lisible : le nom en minuscules, sans accents ni signes. */
export function slugBase(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9]+/g, "-") // tout autre signe devient un tiret
    .replace(/^-+|-+$/g, "")
    .substring(0, BASE_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Suffixe aléatoire. 256 étant un multiple de 32, le masque sur 5 bits ne
 * favorise aucun signe.
 */
export function randomSlugSuffix(length: number = SLUG_SUFFIX_LENGTH): string {
  const bytes = randomBytes(length);
  let suffix = "";
  for (let i = 0; i < length; i++) {
    suffix += SUFFIX_ALPHABET[bytes[i] & 31];
  }
  return suffix;
}

/** Nouvelle adresse publique pour un album de ce nom. */
export function newPublicAlbumSlug(name: string): string {
  const base = slugBase(name);
  const suffix = randomSlugSuffix();
  return base ? `${base}-${suffix}` : suffix;
}
