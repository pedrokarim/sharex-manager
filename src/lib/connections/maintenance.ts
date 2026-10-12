/**
 * Tâche de fond des comptes connectés (dossier 07, § 8.9), lancée par
 * `instrumentation.ts` au démarrage puis toutes les heures :
 *
 * - prolonge les jetons des connecteurs qui déclarent un cycle de vie propre
 *   (`tokenLifetime` « scheduled », ou l'entretien d'un « on-use »), même
 *   sans publication : un jeton de soixante jours d'un compte inactif ne se
 *   perd pas ;
 * - passe « à reconnecter » les comptes dont le jeton non renouvelable a expiré ;
 * - efface les liens publics expirés (et leurs fichiers dérivés) et les
 *   autorisations en attente expirées ;
 * - réveille la file (publications différées, comptes reconnectés).
 */

import { renewDueTokens } from "./accounts";
import { purgePendingAuthorizations } from "./pending";
import { purgePublicLinks } from "./public-media";
import { wakePublishQueue } from "./publish-queue";

const INTERVAL_MS = 60 * 60 * 1000;

const holder = globalThis as typeof globalThis & { __sxmConnectionsMaintenance?: ReturnType<typeof setInterval> };

/** Un passage complet ; rend ce qui a été fait (tests, journal). */
export async function runConnectionMaintenance() {
  const tokens = await renewDueTokens();
  const links = purgePublicLinks();
  purgePendingAuthorizations();
  wakePublishQueue();
  return { tokens, links };
}

export function startConnectionMaintenance() {
  if (holder.__sxmConnectionsMaintenance) return;
  const run = () =>
    runConnectionMaintenance()
      .then(({ tokens }) => {
        if (tokens.renewed || tokens.failed || tokens.expired) {
          console.log(`[connections] jetons : ${tokens.renewed} prolongés, ${tokens.failed} en échec, ${tokens.expired} expirés`);
        }
      })
      .catch((error) => console.error("[connections] tâche de fond en échec :", error instanceof Error ? error.message : error));
  void run();
  holder.__sxmConnectionsMaintenance = setInterval(run, INTERVAL_MS);
  (holder.__sxmConnectionsMaintenance as unknown as { unref?: () => void }).unref?.();
}
