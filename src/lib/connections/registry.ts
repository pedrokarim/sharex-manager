/**
 * Registre des connecteurs. Ajouter un service, c'est écrire son fichier dans
 * `connectors/`, l'inscrire ici, ajouter son logo officiel à `BrandLogo` et
 * ses tests : la page « Comptes connectés », la fenêtre de publication de Clip
 * Studio et le choix des comptes d'une image de marque le prennent en charge
 * sans autre modification.
 */

import { FOLLOW_UP_CAPABILITY, type ConnectionCapability, type Connector, type ConnectorInfo } from "./types";
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

/** Portées qu'une connexion incrémentale demandera pour obtenir une capacité : la première de `scopes`, et toutes ses `allOf`. */
export function scopesForCapability(connector: Connector, capability: ConnectionCapability): string[] {
  const entry = connector.capabilities.find((candidate) => candidate.capability === capability);
  if (!entry || entry.scopes.length === 0) return [];
  return [...new Set([entry.scopes[0], ...(entry.allOf ?? [])])];
}

/**
 * Capacités du service que des portées ne couvrent pas (connexion
 * incrémentale possible). Une capacité couverte par les portées mais retirée
 * par le rôle du compte n'y figure pas.
 */
export function requestableCapabilities(connector: Connector, scopes: string[]): ConnectionCapability[] {
  const granted = new Set(capabilitiesForScopes(connector, scopes));
  return [...new Set(connector.capabilities.map((entry) => entry.capability))].filter((capability) => !granted.has(capability));
}

/**
 * Portées à demander pour ajouter des capacités à un compte : celles qu'il a
 * déjà, plus celles qui manquent. Lève une erreur pour une capacité que le
 * service n'offre pas ; rend `null` si rien ne manque.
 */
export function incrementalScopes(connector: Connector, currentScopes: string[], capabilities: ConnectionCapability[]): string[] | null {
  const scopes = new Set(currentScopes);
  const before = scopes.size;
  const granted = new Set(capabilitiesForScopes(connector, currentScopes));
  for (const capability of capabilities) {
    if (granted.has(capability)) continue;
    const needed = scopesForCapability(connector, capability);
    if (needed.length === 0) throw new Error(`${connector.label} n’offre pas cette autorisation.`);
    for (const scope of needed) scopes.add(scope);
  }
  return scopes.size > before ? [...scopes] : null;
}

/** Capacités qu'aucun jeu de portées de la connexion ne donne : seulement à la demande. */
function onDemandCapabilities(connector: Connector): ConnectionCapability[] {
  const offered = new Set(connector.oauth.scopeSets.flatMap((set) => capabilitiesForScopes(connector, set.scopes)));
  return [...new Set(connector.capabilities.map((entry) => entry.capability))].filter((capability) => !offered.has(capability));
}

/** Suites que le connecteur sait exécuter, avec la capacité exigée. */
function describeFollowUps(connector: Connector): ConnectorInfo["followUps"] {
  const support = connector.followUps;
  if (!support) return undefined;
  const result: NonNullable<ConnectorInfo["followUps"]> = {};
  if (support.comment && connector.postComment) result.comment = { ...support.comment, capability: FOLLOW_UP_CAPABILITY.comment };
  if (support.subtitles && connector.uploadSubtitles) result.subtitles = { ...support.subtitles, capability: FOLLOW_UP_CAPABILITY.subtitles };
  if (support.cover?.mode === "publish") result.cover = { ...support.cover };
  else if (support.cover && connector.setCover) result.cover = { ...support.cover, capability: FOLLOW_UP_CAPABILITY.cover };
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Description publique : ni URL de jeton, ni fonction, rien qui serve à se connecter. */
export function describeConnector(connector: Connector): ConnectorInfo {
  const followUps = describeFollowUps(connector);
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
    ...(followUps ? { followUps } : {}),
    onDemandCapabilities: onDemandCapabilities(connector),
    capabilityScopes: Object.fromEntries(connector.capabilities.map((entry) => [entry.capability, scopesForCapability(connector, entry.capability)])),
    ...(connector.oauth.incremental?.help ? { incrementalHelp: connector.oauth.incremental.help } : {}),
  };
}

export function listConnectors(): ConnectorInfo[] {
  return CONNECTORS.map(describeConnector);
}
