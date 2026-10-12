/**
 * Données des pages « Comptes connectés », lues côté serveur. Rien ici ne
 * contient de jeton ni de secret : ce sont des résumés prêts à envoyer au
 * navigateur.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { allConnectors, describeConnector, getConnector } from "@/lib/connections/registry";
import { getAppStatus, publicBaseUrl } from "@/lib/connections/apps";
import { getAccountSummary, listAccounts } from "@/lib/connections/accounts";
import { getBillingStatus, type BillingStatus } from "@/lib/connections/billing";
import { keySource } from "@/lib/connections/crypto";
import { listJobs } from "@/lib/connections/publish-queue";
import { getAccountQuotaUsage, getQuotaUsage } from "@/lib/connections/quota";
import { publicMediaStatus } from "@/lib/connections/public-media";
import type { AccountQuotaUsage, AccountSummary, PublishJobSummary, QuotaUsage } from "@/lib/connections/types";
import type { ConnectionsOverview, ConnectorView } from "@/components/connections/types";

export type { ConnectionsOverview, ConnectorView } from "@/components/connections/types";

export interface BrandFormats {
  id: string;
  name: string;
  isDefault: boolean;
  banner?: string;
  watermark?: string;
  avatar?: string;
}

export interface AccountPageData {
  account: AccountSummary;
  connector: ConnectorView;
  quota: QuotaUsage | null;
  /** Quota propre au compte, sur fenêtre glissante (absent si le service n'en a pas). */
  accountQuota: AccountQuotaUsage | null;
  jobs: PublishJobSummary[];
  kits: BrandFormats[] | null;
}

/** Session administrateur exigée ; rend la session, ou `null`. */
export async function adminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && isAdmin(session) ? session : null;
}

export function connectorView(id: string): ConnectorView | null {
  const connector = getConnector(id);
  if (!connector) return null;
  return {
    ...describeConnector(connector),
    app: connector.status === "ready" ? getAppStatus(connector) : null,
    setupSteps: connector.app.setupSteps,
    consoleUrl: connector.app.consoleUrl,
  };
}

export function connectionsOverview(): ConnectionsOverview {
  const billing: Record<string, BillingStatus> = {};
  for (const connector of allConnectors()) {
    const status = connector.status === "ready" ? getBillingStatus(connector) : null;
    if (status) billing[connector.id] = status;
  }
  return {
    connectors: allConnectors().map((connector) => connectorView(connector.id)!),
    accounts: listAccounts(),
    keySource: keySource(),
    authUrl: publicBaseUrl(),
    publicMedia: publicMediaStatus(),
    billing,
  };
}

/** Images de marque et leurs formats exportés (bannière, filigrane, avatar), lus par le module `brand-kit`. */
export async function brandFormats(): Promise<BrandFormats[] | null> {
  try {
    const { apiModuleManager } = await import("@/lib/modules/module-manager.api");
    const kits = (await apiModuleManager.callModuleFunction("brand-kit", "listKits")) as { id: string; name: string; isDefault?: boolean }[] | null;
    if (!Array.isArray(kits)) return null;
    const result: BrandFormats[] = [];
    for (const kit of kits) {
      const detail = (await apiModuleManager.callModuleFunction("brand-kit", "getKit", kit.id).catch(() => null)) as {
        exports?: { format: string; url: string }[];
      } | null;
      const url = (format: string) => detail?.exports?.find((entry) => entry.format === format)?.url;
      result.push({ id: kit.id, name: kit.name, isDefault: Boolean(kit.isDefault), banner: url("banner"), watermark: url("watermark"), avatar: url("avatar") });
    }
    return result;
  } catch {
    return null;
  }
}

export async function accountPageData(accountId: string): Promise<AccountPageData | null> {
  const account = getAccountSummary(accountId);
  if (!account) return null;
  const connector = connectorView(account.connector);
  const definition = getConnector(account.connector);
  if (!connector || !definition) return null;
  return {
    account,
    connector,
    quota: getQuotaUsage(definition),
    accountQuota: getAccountQuotaUsage(definition, accountId),
    jobs: listJobs({ accountId }),
    kits: await brandFormats(),
  };
}
