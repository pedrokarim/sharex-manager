/**
 * Registre des connecteurs. Ajouter un service, c'est écrire son fichier dans
 * `connectors/`, l'inscrire ici, ajouter son logo officiel à `BrandLogo` et
 * ses tests : la page « Comptes connectés », la fenêtre de publication de Clip
 * Studio et le choix des comptes d'une image de marque le prennent en charge
 * sans autre modification.
 */

import type { ConnectionCapability, Connector, ConnectorInfo } from "./types";
import { youtubeConnector } from "./connectors/youtube";
import { facebookConnector } from "./connectors/facebook";
import { instagramConnector } from "./connectors/instagram";
import { threadsConnector } from "./connectors/threads";
import { plannedConnectors } from "./connectors/planned";

/** Connecteurs réalisés ; un service annoncé disparaît des « bientôt » dès qu'il est ici. */
const READY: Connector[] = [youtubeConnector, facebookConnector, instagramConnector, threadsConnector];

const CONNECTORS: Connector[] = [
  ...READY,
  ...plannedConnectors.filter((planned) => !READY.some((ready) => ready.id === planned.id)),
];

/** Segments déjà pris sous `/api/connections/` : aucun connecteur ne peut porter ce nom. */
const RESERVED_IDS = new Set(["media", "pending"]);

export function allConnectors(): Connector[] {
  return CONNECTORS;
}

/**
 * Inscrit un connecteur de plus, pour les tests (faux service) : un vrai
 * connecteur s'inscrit dans `CONNECTORS`. Remplace un connecteur de même id.
 */
export function registerConnector(connector: Connector) {
  if (RESERVED_IDS.has(connector.id)) throw new Error(`« ${connector.id} » est un nom réservé.`);
  const index = CONNECTORS.findIndex((entry) => entry.id === connector.id);
  if (index >= 0) CONNECTORS[index] = connector;
  else CONNECTORS.push(connector);
}

/** Retire un connecteur inscrit par `registerConnector` (tests). */
export function unregisterConnector(id: string) {
  const index = CONNECTORS.findIndex((entry) => entry.id === id);
  if (index >= 0) CONNECTORS.splice(index, 1);
}

export function getConnector(id: unknown): Connector | null {
  return typeof id === "string" ? (CONNECTORS.find((connector) => connector.id === id) ?? null) : null;
}

/** Connecteur utilisable, sinon une erreur claire. */
export function requireReadyConnector(id: unknown): Connector {
  const connector = getConnector(id);
  if (!connector) throw new Error("Service inconnu.");
  if (connector.status !== "ready") throw new Error(`${connector.label} n’est pas encore pris en charge.`);
  return connector;
}

/**
 * Capacités qu'accordent des portées : une seule des `scopes` d'une capacité
 * suffit, et toutes ses `allOf` sont exigées en plus.
 */
export function capabilitiesForScopes(connector: Connector, scopes: string[]): ConnectionCapability[] {
  const granted = new Set(scopes);
  return connector.capabilities
    .filter((entry) => entry.scopes.some((scope) => granted.has(scope)) && (entry.allOf ?? []).every((scope) => granted.has(scope)))
    .map((entry) => entry.capability);
}

/** Description publique : ni URL de jeton, ni fonction, rien qui serve à se connecter. */
export function describeConnector(connector: Connector): ConnectorInfo {
  return {
    id: connector.id,
    label: connector.label,
    logo: connector.logo,
    accountNoun: connector.accountNoun,
    status: connector.status,
    capabilities: connector.capabilities.map((entry) => entry.capability),
    scopeSets: connector.oauth.scopeSets.map((set) => ({
      id: set.id,
      label: set.label,
      description: set.description,
      capabilities: capabilitiesForScopes(connector, set.scopes),
    })),
    publishFields: connector.publishFields ?? [],
    ...(connector.shortForm ? { shortForm: connector.shortForm } : {}),
    ...(connector.limits ? { limits: connector.limits } : {}),
    ...(connector.pricing ? { pricing: connector.pricing } : {}),
    ...(connector.posts ? { postActions: { update: Boolean(connector.posts.update), remove: Boolean(connector.posts.remove) } } : {}),
    ...(connector.app.disconnectHelp ? { disconnectHelp: connector.app.disconnectHelp } : {}),
    ...(connector.fetchAccounts ? { multipleAccounts: true } : {}),
    ...(connector.publicMedia ? { publicMedia: true } : {}),
  };
}

export function listConnectors(): ConnectorInfo[] {
  return CONNECTORS.map(describeConnector);
}
