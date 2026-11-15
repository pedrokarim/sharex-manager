"use client";

/**
 * Droits des musiques dans l'éditeur et l'écran Publier (dossier 01 quater,
 * § 4.4) : la banque lue une fois et partagée, la ligne de l'inspecteur et
 * les lignes à confirmer avant l'envoi.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Music, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { MusicEntry } from "../lib/music";
import { callModule } from "../lib/client";
import { TRACK_RIGHTS_LABELS, type TrackRightsState } from "../lib/rights-types";
import {
  rightsConfirmLabel,
  rightsFix,
  rightsTitle,
  rightsUsage,
  type MusicRightsGroup,
  type ProjectRightsWarning,
  type RightsTrack,
} from "../lib/rights-warnings";

// ─── La banque, lue une fois ─────────────────────────────────────

/** Au-delà, la page suivante relit la banque : un morceau a pu passer « revendiqué » entre-temps. */
const MAX_AGE_MS = 5 * 60_000;

let cache: { at: number; tracks: RightsTrack[] } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(tracks: RightsTrack[]) => void>();

function loadMusicRights() {
  inflight ??= callModule<MusicEntry[]>("getMusic")
    .then((list) => {
      const tracks = (Array.isArray(list) ? list : []).map(({ id, title, artist, rights }) => ({ id, title, artist, ...(rights ? { rights } : {}) }));
      cache = { at: Date.now(), tracks };
      for (const listener of listeners) listener(tracks);
    })
    // Banque injoignable : aucun avertissement, et la page suivante réessaie (le serveur garde son contrôle).
    .catch(() => {
      for (const listener of listeners) listener([]);
    })
    .finally(() => {
      inflight = null;
    });
}

/**
 * Morceaux de la banque avec leur note de droits, lus une fois pour tous les
 * composants de la page ; `null` tant que la lecture est en cours.
 */
export function useMusicRights(): RightsTrack[] | null {
  const [tracks, setTracks] = useState<RightsTrack[] | null>(() => cache?.tracks ?? null);
  useEffect(() => {
    listeners.add(setTracks);
    if (!cache || Date.now() - cache.at > MAX_AGE_MS) loadMusicRights();
    else setTracks(cache.tracks);
    return () => {
      listeners.delete(setTracks);
    };
  }, []);
  return tracks;
}

/** Oublie la banque lue (tests, ou après un changement d'état). */
export function resetMusicRights() {
  cache = null;
  inflight = null;
}

// ─── Pièces communes ─────────────────────────────────────────────

/** Couleur du repère : rouge quand la publication demande une confirmation. */
export function rightsToneClass(state: TrackRightsState): string {
  return state === "claimed" || state === "withdrawn" ? "text-destructive" : "text-amber-600 dark:text-amber-400";
}

function sinceText(since: string | undefined): string | null {
  const match = since ? /^(\d{4})-(\d{2})-(\d{2})/.exec(since) : null;
  return match ? `Constaté le ${match[3]}/${match[2]}/${match[1]}.` : null;
}

/**
 * Ligne de l'inspecteur pour un son dont le morceau est en cause : l'état,
 * la raison, et l'ouverture du panneau Musique pour le remplacer.
 */
export function RightsInspectorSection({ warning, onReplace }: { warning: ProjectRightsWarning; onReplace?: () => void }) {
  const since = sinceText(warning.since);
  return (
    <section className="space-y-2.5" aria-label="Droits de la musique">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Droits de la musique</h3>
      <div className="flex min-w-0 items-start gap-2">
        <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", rightsToneClass(warning.state))} aria-hidden />
        <div className="grid min-w-0 flex-1 gap-1 text-xs">
          <p className="font-medium [overflow-wrap:anywhere]">
            {TRACK_RIGHTS_LABELS[warning.state]} · «&nbsp;{warning.music.title}&nbsp;»
          </p>
          <p className="text-pretty text-muted-foreground [overflow-wrap:anywhere]">{warning.reason}</p>
          {since ? <p className="text-muted-foreground">{since}</p> : null}
        </div>
      </div>
      {onReplace ? (
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={onReplace}>
          <Music className="size-4" />
          Remplacer depuis le panneau Musique
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Lignes de l'écran Publier, une par morceau en cause, sur le modèle des
 * vérifications de l'écran Exporter. Un morceau revendiqué ou retiré porte
 * la case « Publier quand même » : tant qu'elle n'est pas cochée, l'envoi
 * reste fermé (`unconfirmedBlockers`).
 */
export function PublishRightsLines({
  groups,
  confirmed,
  onConfirm,
  editorHref,
  disabled,
}: {
  groups: MusicRightsGroup[];
  confirmed: ReadonlySet<string>;
  onConfirm: (trackId: string, on: boolean) => void;
  /** Adresse de l'éditeur du projet, sans l'élément ; absente si le projet n'existe plus. */
  editorHref?: string;
  disabled?: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <ul className="grid min-w-0 gap-3" aria-label="Droits des musiques">
      {groups.map((group) => {
        const usage = rightsUsage(group);
        const first = group.items[0]?.item.id;
        const inputId = `publish-rights-${group.music.id}`;
        return (
          <li key={group.music.id} className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", rightsToneClass(group.state))} aria-label={TRACK_RIGHTS_LABELS[group.state]} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{rightsTitle(group)}</p>
                <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">
                  {group.music.artist ? `${group.music.artist} · ` : ""}
                  {group.reason}
                  {usage ? ` ${usage}` : ""}
                </p>
                <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">
                  {rightsFix(group)}
                  {editorHref && first ? (
                    <>
                      {" "}
                      <Link
                        href={`${editorHref}&item=${encodeURIComponent(first)}`}
                        className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2"
                      >
                        Voir la musique dans l’éditeur
                        <ArrowRight className="size-3" />
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            {group.blocksPublication ? (
              <label htmlFor={inputId} className="flex min-w-0 cursor-pointer items-start gap-2 pl-6.5 text-sm">
                <Checkbox
                  id={inputId}
                  checked={confirmed.has(group.music.id)}
                  disabled={disabled}
                  onCheckedChange={(value) => onConfirm(group.music.id, value === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0 text-pretty">{rightsConfirmLabel(group)}</span>
              </label>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
