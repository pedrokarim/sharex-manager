/**
 * Lecteur public de la niche branché sur le vrai yt-dlp, la porte commune des
 * lectures d'adresse et les cookies YouTube des réglages. À part de
 * `niche-public.ts` pour que ses tests n'en chargent rien.
 */

import path from "path";
import { runYtDlp } from "@/lib/media/ytdlp";
import { abortableSleep, createPublicReader, type PublicNicheReader } from "./niche-public";
import { PROBE_BUSY_MESSAGE, PROBE_RATE_MESSAGE, sharedProbeGate } from "./remote-import";
import { DATA_DIR } from "./store";
import { copyYoutubeCookies, markCookiesRejected } from "./video-sources";

/** Un lecteur neuf par étude : ses appels s'enchaînent et se comptent. */
export function youtubePublicReader(): PublicNicheReader {
  return createPublicReader({
    run: runYtDlp,
    gate: sharedProbeGate(),
    busyMessages: [PROBE_RATE_MESSAGE, PROBE_BUSY_MESSAGE],
    // Dossier de travail caché, nettoyé par le ménage des dossiers de travail.
    workRoot: path.join(DATA_DIR, ".remote-tmp"),
    cookies: copyYoutubeCookies,
    onCookiesRejected: markCookiesRejected,
    now: Date.now,
    sleep: abortableSleep,
  });
}
