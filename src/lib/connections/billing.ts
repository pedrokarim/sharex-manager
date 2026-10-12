/**
 * Services payants à l'usage (dossier 07, § 8.9) : dépenses du mois, budget
 * mensuel fixé par l'instance, crédits épuisés.
 *
 * - Le connecteur déclare ses prix (`Connector.pricing`, table datée) ; la
 *   fenêtre de publication affiche le coût estimé avant l'envoi
 *   (`estimatePublishCost` de `limits.ts`).
 * - Le budget d'un service vient de `<PREFIX>_MONTHLY_BUDGET`, sinon de
 *   `setMonthlyBudget` ; sans budget, rien n'est refusé. La file refuse un
 *   envoi qui le dépasserait, avec un message clair.
 * - Une dépense est comptée quand la publication aboutit. Le mois est le mois
 *   civil UTC.
 * - « Crédits épuisés » (`CreditsExhaustedError` levée par le connecteur)
 *   suspend tous les envois du service jusqu'à une reprise à la main.
 */

import type { Connector } from "./types";
import { CreditsExhaustedError } from "./errors";
import { formatCost } from "./limits";
import { readStore, updateStore } from "./store";

interface ConnectorBilling {
  /** Budget saisi ; celui de l'environnement prime. */
  budget?: number;
  /** Dépenses par mois (« AAAA-MM »). */
  spent?: Record<string, number>;
  creditsExhausted?: { at: number; message: string };
}

type BillingFile = Record<string, ConnectorBilling>;

export interface BillingStatus {
  connector: string;
  currency: string;
  month: string;
  spent: number;
  budget: number | null;
  budgetSource: "env" | "file" | null;
  creditsExhausted?: { at: number; message: string };
}

export const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

function envBudget(connector: Connector): number | null {
  const raw = process.env[`${connector.app.envPrefix}_MONTHLY_BUDGET`]?.trim();
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function getBillingStatus(connector: Connector, now = Date.now()): BillingStatus | null {
  if (!connector.pricing) return null;
  const entry = readStore<BillingFile>("billing", {})[connector.id] ?? {};
  const env = envBudget(connector);
  const month = monthKey(now);
  return {
    connector: connector.id,
    currency: connector.pricing.currency,
    month,
    spent: entry.spent?.[month] ?? 0,
    budget: env ?? entry.budget ?? null,
    budgetSource: env !== null ? "env" : entry.budget !== undefined ? "file" : null,
    ...(entry.creditsExhausted ? { creditsExhausted: entry.creditsExhausted } : {}),
  };
}

/** Budget mensuel saisi (`null` : aucun). Celui de l'environnement, s'il existe, prime. */
export function setMonthlyBudget(connector: Connector, amount: number | null) {
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) throw new Error("Budget invalide.");
  updateStore<BillingFile>("billing", {}, (file) => {
    const entry = (file[connector.id] ??= {});
    if (amount === null) delete entry.budget;
    else entry.budget = amount;
  });
}

/** Lève `CreditsExhaustedError` si ce coût dépasserait le budget du mois ou si les crédits sont épuisés. */
export function assertBudget(connector: Connector, amount: number, now = Date.now()) {
  const status = getBillingStatus(connector, now);
  if (!status) return;
  if (status.creditsExhausted) throw new CreditsExhaustedError(status.creditsExhausted.message);
  if (status.budget !== null && status.spent + amount > status.budget + 1e-9) {
    throw new CreditsExhaustedError(
      `Budget mensuel atteint chez ${connector.label} : ${formatCost(status.spent, status.currency)} dépensés sur ${formatCost(status.budget, status.currency)}, cette publication coûterait ${formatCost(amount, status.currency)}.`
    );
  }
}

/** Compte une dépense du mois (publication aboutie). */
export function recordSpend(connector: Connector, amount: number, now = Date.now()) {
  if (!connector.pricing || !(amount > 0)) return;
  const month = monthKey(now);
  updateStore<BillingFile>("billing", {}, (file) => {
    const entry = (file[connector.id] ??= {});
    entry.spent = { ...entry.spent, [month]: Math.round(((entry.spent?.[month] ?? 0) + amount) * 10_000) / 10_000 };
    // On ne garde que les douze derniers mois.
    const months = Object.keys(entry.spent).sort();
    for (const old of months.slice(0, Math.max(0, months.length - 12))) delete entry.spent[old];
  });
}

export function markCreditsExhausted(connector: Connector, message: string, now = Date.now()) {
  updateStore<BillingFile>("billing", {}, (file) => {
    (file[connector.id] ??= {}).creditsExhausted = { at: now, message: message.slice(0, 300) };
  });
}

export function creditsExhausted(connectorId: string): { at: number; message: string } | undefined {
  return readStore<BillingFile>("billing", {})[connectorId]?.creditsExhausted;
}

/** « Reprendre » à la main, après recharge des crédits. */
export function clearCreditsExhausted(connectorId: string) {
  updateStore<BillingFile>("billing", {}, (file) => {
    if (file[connectorId]) delete file[connectorId].creditsExhausted;
  });
}
