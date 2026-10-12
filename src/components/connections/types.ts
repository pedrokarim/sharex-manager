/**
 * Ce que les écrans des comptes connectés reçoivent du serveur : des résumés
 * sans jeton ni secret. Types seulement (le navigateur les importe).
 */

import type { AppStatus } from "@/lib/connections/apps";
import type { BillingStatus } from "@/lib/connections/billing";
import type { KeySource } from "@/lib/connections/crypto";
import type { PublicMediaStatus } from "@/lib/connections/public-media";
import type { AccountSummary, ConnectorInfo } from "@/lib/connections/types";

export type { AppStatus, AppSettingStatus } from "@/lib/connections/apps";
export type { BillingStatus } from "@/lib/connections/billing";

/** Description publique d'un service, avec l'état de son application. */
export interface ConnectorView extends ConnectorInfo {
  /** `null` pour un service annoncé (« bientôt »). */
  app: AppStatus | null;
  setupSteps: string[];
  consoleUrl: string;
}

export interface ConnectionsOverview {
  connectors: ConnectorView[];
  accounts: AccountSummary[];
  keySource: KeySource | null;
  authUrl: string | null;
  /** Les services qui vont chercher les fichiers pourront-ils joindre l'instance ? */
  publicMedia: PublicMediaStatus;
  /** Dépenses et budget du mois des services payants, par service. */
  billing: Record<string, BillingStatus>;
}
