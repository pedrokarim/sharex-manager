/**
 * Gabarit horizontal commun aux sections de la page d'accueil.
 *
 * Les sections utilisaient trois largeurs différentes et certaines captures
 * débordaient du conteneur par une marge négative : le bloc de contenu n'était
 * plus centré dans la page, avec un vide bien plus large d'un côté que de
 * l'autre. Une seule valeur partagée évite que ça redérive.
 */
export const HOME_CONTAINER = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

/** Rythme vertical commun aux sections. */
export const HOME_SECTION_PADDING = "py-20 lg:py-28";
