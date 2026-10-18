/**
 * Tâche de fond de la sécurité, lancée au démarrage (`instrumentation.ts`) puis
 * une fois par jour :
 *
 * - suppression des entrées du journal plus anciennes que `logs.retentionDays` ;
 * - ménage des compteurs d'échecs de connexion et des alertes déjà vues ;
 * - au démarrage seulement, droits des fichiers de données.
 */

import { logger } from "@/lib/utils/logger";
import { logDb } from "@/lib/utils/db";
import { purgeAcknowledgedAlerts } from "./alerts-store";
import { hardenDataFiles } from "./data-files";
import { retentionCutoff } from "./retention";
import { getLogSettings, getSignInSettings } from "./settings";
import { purgeSignInAttempts } from "./sign-in-attempts";

const DAY_MS = 24 * 60 * 60 * 1000;

const holder = globalThis as typeof globalThis & { __sxmSecurityMaintenance?: ReturnType<typeof setInterval> };

/** Une passe de ménage ; renvoie le nombre d'entrées supprimées par catégorie. */
export function runSecurityPurge(now = new Date()) {
  const cutoff = retentionCutoff(getLogSettings().retentionDays, now);
  const logs = logDb.purgeOlderThan(cutoff);
  const alerts = purgeAcknowledgedAlerts(cutoff);
  // Un compteur sans échec depuis une journée et sans blocage en cours ne sert plus.
  const lockWindow = Math.max(getSignInSettings().lockMinutes * 60_000, DAY_MS);
  const attempts = purgeSignInAttempts(now.getTime() - lockWindow);
  if (logs > 0) {
    void logger.info("logs.purge", `Journal : ${logs} entrée(s) de plus de ${getLogSettings().retentionDays} jours supprimée(s)`, {
      metadata: { removed: logs, cutoff },
    });
  }
  return { logs, alerts, attempts };
}

export function startSecurityMaintenance() {
  try {
    const changed = hardenDataFiles();
    if (changed > 0) console.log(`[security] droits resserrés sur ${changed} fichier(s) de data/`);
  } catch (error) {
    console.error("[security] échec du contrôle des droits de data/ :", error);
  }

  const run = () => {
    try {
      runSecurityPurge();
    } catch (error) {
      console.error("[security] échec du ménage du journal :", error);
    }
  };
  run();

  if (holder.__sxmSecurityMaintenance) clearInterval(holder.__sxmSecurityMaintenance);
  const timer = setInterval(run, DAY_MS);
  // Ne retient pas le processus (Node) ; sans effet ailleurs.
  (timer as unknown as { unref?: () => void }).unref?.();
  holder.__sxmSecurityMaintenance = timer;
}
