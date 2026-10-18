"use server";

/**
 * Actions serveur de l’écran « Intelligence artificielle ». Chacune vérifie la
 * session administrateur : une action est joignable par une requête directe,
 * pas seulement depuis la page. Les erreurs sont rendues comme valeur, avec
 * leur message en français : une erreur levée serait masquée en production.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/api-guard";
import { getAiUsageOverview, readRemoteLimits } from "@/lib/ai-usage";
import { isAiProviderId } from "@/lib/ai-usage/catalog";
import type { AiLimit, AiProviderId, AiUsageOverview } from "@/lib/ai-usage/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function adminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && isAdmin(session) ? session : null;
}

async function run<T>(task: () => Promise<T> | T, fallback: string): Promise<ActionResult<T>> {
  const session = await adminSession();
  if (!session) return { ok: false, error: "Réservé aux administrateurs." };
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message ? error.message : fallback };
  }
}

/** Aperçu de tous les fournisseurs : accès, limites, consommation, derniers appels. */
export async function aiUsageOverviewAction(): Promise<ActionResult<AiUsageOverview>> {
  return run(() => getAiUsageOverview(), "Consommation des IA indisponible.");
}

/** Solde lu chez le service, d’une seule requête de lecture qui ne dépense rien. */
export async function readRemoteLimitsAction(provider: AiProviderId): Promise<ActionResult<AiLimit[]>> {
  return run(() => {
    if (!isAiProviderId(provider)) throw new Error("Fournisseur inconnu.");
    return readRemoteLimits(provider);
  }, "Lecture du solde impossible.");
}
