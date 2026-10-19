/**
 * Adresses des écrans d'un export : sa fiche et l'écran Publier. Les cartes
 * et les lignes d'export sont dans `library-ui.tsx` et les pages Accueil et
 * Exports.
 */

export const exportHref = (id: string) => `/m/clip-studio/exports?id=${encodeURIComponent(id)}`;
export const publishHref = (id: string) => `/m/clip-studio/publish?export=${encodeURIComponent(id)}`;
