/**
 * Alertes de sécurité affichées dans l'écran Sécurité : échecs de connexion
 * répétés, nouvelle clé API, administrateur connecté depuis une nouvelle
 * adresse, fichier passé de privé à public.
 *
 * `raiseAlert` ne lève jamais d'erreur et n'a pas besoin d'être attendue :
 * une alerte qui ne s'écrit pas ne doit pas faire échouer l'action qui l'a
 * déclenchée. Une alerte désactivée dans les réglages n'est pas enregistrée.
 *
 * La base (`bun:sqlite`) n'est chargée qu'au moment d'écrire : une route qui
 * lève une alerte reste importable dans les tests sous Node.
 */

import { logger } from "@/lib/utils/logger";
import { isAlertEnabled } from "./settings";
import type { AlertKind } from "./settings-schema";

export type { AlertKind } from "./settings-schema";
export type AlertDetails = Record<string, string | number | boolean | null | undefined>;

/** Résumé lisible, repris dans le journal. */
export const ALERT_MESSAGES: Record<AlertKind, string> = {
  failedSignIns: "Échecs de connexion répétés",
  newApiKey: "Nouvelle clé API",
  adminNewIp: "Administrateur connecté depuis une nouvelle adresse",
  fileMadePublic: "Fichier passé de privé à public",
};

/** Enregistre une alerte ; renvoie son identifiant, ou `null` si elle est désactivée ou n'a pas pu s'écrire. */
export async function raiseAlert(kind: AlertKind, details: AlertDetails = {}): Promise<number | null> {
  try {
    if (!isAlertEnabled(kind)) return null;
    const clean = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) as AlertDetails;
    const { insertAlert } = await import("./alerts-store");
    const id = insertAlert(kind, clean);
    try {
      void logger.warning("security.alert", ALERT_MESSAGES[kind], {
        userId: typeof clean.userId === "string" ? clean.userId : undefined,
        ip: typeof clean.ip === "string" ? clean.ip : undefined,
        metadata: { kind, alertId: id, ...clean },
      });
    } catch {
      // Journal indisponible : l'alerte est déjà enregistrée.
    }
    return id;
  } catch (error) {
    console.error("[security] alerte non enregistrée :", error instanceof Error ? error.message : error);
    return null;
  }
}
