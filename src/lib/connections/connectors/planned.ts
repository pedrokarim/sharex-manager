/**
 * Connecteurs annoncés, pas encore réalisés : ils s'affichent « bientôt » dans
 * « Comptes connectés » et ne peuvent pas être connectés. Chacun demandera son
 * propre dossier court (portées, formats acceptés, limites) avant d'être
 * réalisé dans son fichier (dossier 07, § 16).
 *
 * Facebook, Instagram et Threads passent par l'API Meta (Graph API) avec une
 * page ou un compte professionnel ; X facture l'accès en écriture à son API.
 */

import type { Connector, ConnectionCapability } from "../types";

function planned(input: {
  id: string;
  label: string;
  accountNoun: { one: string; many: string };
  capabilities: ConnectionCapability[];
  envPrefix: string;
  consoleUrl: string;
}): Connector {
  return {
    id: input.id,
    label: input.label,
    logo: input.id,
    accountNoun: input.accountNoun,
    status: "planned",
    // Pas de portée tant que le connecteur n'existe pas : rien n'est accordé.
    capabilities: input.capabilities.map((capability) => ({ capability, scopes: [] })),
    app: { envPrefix: input.envPrefix, setupSteps: [], consoleUrl: input.consoleUrl },
    oauth: { authorizeUrl: "", tokenUrl: "", pkce: true, scopeSets: [] },
  };
}

export const plannedConnectors: Connector[] = [
  planned({
    id: "facebook",
    label: "Facebook",
    accountNoun: { one: "page", many: "pages" },
    capabilities: ["publish.video", "publish.image", "publish.text", "posts.list"],
    envPrefix: "FACEBOOK",
    consoleUrl: "https://developers.facebook.com/apps/",
  }),
  planned({
    id: "instagram",
    label: "Instagram",
    accountNoun: { one: "compte", many: "comptes" },
    capabilities: ["publish.video", "publish.image", "posts.list"],
    envPrefix: "INSTAGRAM",
    consoleUrl: "https://developers.facebook.com/apps/",
  }),
  planned({
    id: "threads",
    label: "Threads",
    accountNoun: { one: "compte", many: "comptes" },
    capabilities: ["publish.text", "publish.image", "publish.video"],
    envPrefix: "THREADS",
    consoleUrl: "https://developers.facebook.com/apps/",
  }),
  planned({
    id: "x",
    label: "X",
    accountNoun: { one: "compte", many: "comptes" },
    capabilities: ["publish.text", "publish.image", "publish.video"],
    envPrefix: "X",
    consoleUrl: "https://developer.x.com/en/portal/dashboard",
  }),
];
