/**
 * Gabarits horizontaux des pages publiques.
 *
 * La page n'a pas une largeur unique : chaque section prend celle qui convient
 * à ce qu'elle montre. Un texte se lit dans une colonne étroite, une capture
 * respire dans une colonne large, une image de fond va d'un bord à l'autre de
 * l'écran. Toutes ces colonnes sont centrées : aucune ne déborde d'un seul côté.
 */
const GUTTER = "mx-auto w-full px-5 sm:px-8";

/** Colonne de lecture : titres et paragraphes seuls. */
export const FRONT_NARROW = `${GUTTER} max-w-3xl`;
/** Colonne courante. */
export const FRONT_CONTAINER = `${GUTTER} max-w-6xl`;
/** Colonne large : captures et grilles. */
export const FRONT_WIDE = `${GUTTER} max-w-[1440px]`;
/** Presque tout l'écran : les grilles d'images, qui gagnent à s'étaler. */
export const FRONT_FULL = `${GUTTER} max-w-[1920px]`;

/** Vert profond des bandes photographiques, et de leurs fondus. */
export const FOREST = "#08150e";
