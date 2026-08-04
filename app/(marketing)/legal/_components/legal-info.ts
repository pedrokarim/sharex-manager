/**
 * Source unique des informations légales, réutilisée par toutes les pages
 * du dossier /legal pour éviter les divergences.
 */
export const LEGAL_INFO = {
  appName: "ShareX Manager",
  domain: "sxm.ascencia.re",
  url: "https://sxm.ascencia.re",
  editor: "Ascencia, structure informelle représentée par Ahmed Karim",
  editorSite: "https://ascencia.re",
  publicationDirector: "Ahmed Karim",
  contactEmail: "contact@ascencia.re",
  host: {
    name: "Contabo GmbH",
    address: "Aschauer Straße 32a, 81549 München, Allemagne",
    site: "https://contabo.com",
  },
  /** Le dépôt est publié sous GPL v3 (cf. fichier LICENSE à la racine). */
  license: "GNU General Public License v3.0",
  licenseUrl: "https://www.gnu.org/licenses/gpl-3.0.html",
  repository: "https://github.com/pedrokarim/sharex-manager",
  lastUpdated: "4 août 2026",
} as const;
