/**
 * Les adresses officielles du projet, en un seul endroit.
 *
 * Une page n'écrit jamais ces liens à la main : elle les lit ici. Un lien
 * recopié de mémoire finit par pointer ailleurs (un compte GitHub homonyme,
 * l'ancien nom du dépôt), et personne ne le voit avant de cliquer dessus.
 */
const REPOSITORY = "https://github.com/pedrokarim/sharex-manager";

export const SITE_LINKS = {
  /** Dépôt du projet. */
  repository: REPOSITORY,
  /** Tickets : bugs et demandes. */
  issues: `${REPOSITORY}/issues`,
  /** Documentation pas à pas. */
  wiki: `${REPOSITORY}/wiki`,
  /** Site de présentation (GitHub Pages). */
  docsSite: "https://pedrokarim.github.io/sharex-manager/",
  /** Serveur Discord de support, commun aux projets Ascencia (« Ascencia Realms »). */
  discord: "https://discord.gg/rTd95UpUEb",
  /** Compte X d'Ascencia. */
  x: "https://x.com/ascencia64",
  xHandle: "@ascencia64",
  /** Site d'Ascencia, l'éditeur. */
  ascencia: "https://ascencia.re",
  email: "contact@ascencia.re",
} as const;
