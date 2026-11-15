"use client";

import { BrandLogo } from "@/components/brand-logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, ChevronDown, Download, ExternalLink, FileJson, Library, Pause, Play, Plus, Search, ShieldAlert, ShieldQuestion, Telescope, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionStatus, FormStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import type { MediaSource } from "../engine/types";
import { callModule } from "../lib/client";
import type { MusicCandidate, MusicEntry } from "../lib/music";
import { TRACK_RIGHTS_LABELS, type RightsCheck, type TrackRightsNote, type TrackRightsRecord, type TrackRightsState } from "../lib/rights-types";

export const MOOD_LABELS: Record<string, string> = {
  energetic: "Énergique",
  happy: "Joyeux",
  chill: "Détente",
  epic: "Épique",
  suspense: "Suspense",
  inspiring: "Inspirant",
  funky: "Funky",
  ambient: "Ambiant",
};

function duration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function musicSource(track: MusicEntry): MediaSource | null {
  if (!track.url) return null;
  return {
    url: track.url,
    ref: `module:clip-studio/resources/music/${track.id}.mp3`,
    name: `${track.title} – ${track.artist}`,
    kind: "audio",
    durationMs: track.durationMs,
    credit: track.credit,
  };
}

/** Erreurs par morceau : chacune s'affiche sur la ligne qui l'a produite. */
function useRowErrors() {
  const [errors, setErrors] = useState<Record<string, FeedbackState>>({});
  const counter = useRef(0);
  const set = useCallback((id: string, message: string) => {
    counter.current += 1;
    const state: FeedbackState = { tone: "error", message, id: counter.current };
    setErrors((current) => ({ ...current, [id]: state }));
  }, []);
  const clear = useCallback((id: string) => {
    setErrors((current) => {
      if (!(id in current)) return current;
      const { [id]: _cleared, ...rest } = current;
      return rest;
    });
  }, []);
  return { of: (id: string): FeedbackState | null => errors[id] ?? null, set, clear };
}

/** Un seul extrait joué à la fois, arrêté en quittant le panneau. */
function usePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const failures = useRowErrors();
  const { set: setFailure, clear: clearFailure } = failures;

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }, []);

  const toggle = useCallback(
    (id: string, url: string) => {
      if (playing === id) return stop();
      clearFailure(id);
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.volume = 0.7;
      audio.onended = () => setPlaying((current) => (current === id ? null : current));
      audio.onerror = () => {
        setFailure(id, "Extrait illisible. Ouvrez la page du morceau pour l’écouter.");
        setPlaying(null);
      };
      void audio.play().catch(() => undefined);
      audioRef.current = audio;
      setPlaying(id);
    },
    [playing, stop, setFailure, clearFailure]
  );

  useEffect(() => stop, [stop]);
  return { playing, toggle, stop, failureOf: failures.of };
}

/**
 * Musique de fond : la banque libre de droits du module, et la découverte de
 * nouveaux morceaux dans Openverse (Jamendo, licences CC0 et CC BY).
 */
export function MusicPanel({ onAdd }: { onAdd: (source: MediaSource) => void }) {
  const [tab, setTab] = useState<"library" | "discover">("library");
  const [tracks, setTracks] = useState<MusicEntry[] | null>(null);
  const preview = usePreview();

  const refresh = useCallback(async () => {
    const next = await callModule<MusicEntry[]>("getMusic").catch(() => null);
    if (next) setTracks(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = tracks?.some((track) => track.state.status === "downloading" || track.state.status === "missing");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b p-2">
        {(
          [
            { id: "library", label: "Banque", icon: Library },
            { id: "discover", label: "Découvrir", icon: Telescope },
          ] as const
        ).map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && <motion.span layoutId="music-tab" className="absolute inset-0 rounded-md bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <Icon className="relative h-3.5 w-3.5" />
              <span className="relative">{entry.label}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "library" ? (
          <LibraryTab tracks={tracks} preview={preview} onAdd={onAdd} onChanged={refresh} />
        ) : (
          <DiscoverTab preview={preview} onAdded={refresh} />
        )}
      </div>
    </div>
  );
}

// ─── Banque ──────────────────────────────────────────────────────

function LibraryTab({
  tracks,
  preview,
  onAdd,
  onChanged,
}: {
  tracks: MusicEntry[] | null;
  preview: ReturnType<typeof usePreview>;
  onAdd: (source: MediaSource) => void;
  onChanged: () => void;
}) {
  const [mood, setMood] = useState<string | null>(null);
  const [openRights, setOpenRights] = useState<string | null>(null);
  const rowErrors = useRowErrors();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const moods = Object.keys(MOOD_LABELS).filter((key) => tracks?.some((track) => track.mood === key));
  const visible = (tracks ?? []).filter((track) => !mood || track.mood === mood);
  const ready = tracks?.filter((track) => track.state.status === "ready").length ?? 0;

  if (!tracks) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-1.5">
        <MoodChip label="Toutes" active={mood === null} onClick={() => setMood(null)} />
        {moods.map((key) => (
          <MoodChip key={key} label={MOOD_LABELS[key]} active={mood === key} onClick={() => setMood(key)} />
        ))}
      </div>

      {ready < tracks.length && (
        <p className="text-[11px] text-muted-foreground">
          {ready} morceau(x) sur {tracks.length} téléchargé(s). Les autres arrivent en arrière-plan.
        </p>
      )}

      <motion.ul layout className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {visible.map((track) => (
            <motion.li key={track.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TrackRow
                title={track.title}
                artist={track.artist}
                meta={`${MOOD_LABELS[track.mood] ?? track.mood} · ${duration(track.durationMs)} · ${track.license}`}
                playing={preview.playing === track.id}
                onPreview={() => preview.toggle(track.id, track.url ?? track.audioUrl)}
                pageUrl={track.pageUrl}
                status={rowErrors.of(track.id) ?? preview.failureOf(track.id)}
                detail={
                  track.rights && track.rights.state !== "clear" ? (
                    <RightsLine
                      rights={track.rights}
                      checkedAt={track.rightsCheckedAt}
                      open={openRights === track.id}
                      onToggle={isAdmin ? () => setOpenRights((current) => (current === track.id ? null : track.id)) : undefined}
                    />
                  ) : null
                }
                below={
                  isAdmin && openRights === track.id ? <RightsDetails trackId={track.id} current={track.rights?.state} onChanged={onChanged} /> : null
                }
              >
                {track.state.status === "ready" ? (
                  <RowButton
                    title="Ajouter à la tête de lecture"
                    onClick={() => {
                      const source = musicSource(track);
                      if (source) onAdd(source);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </RowButton>
                ) : track.state.status === "downloading" ? (
                  <span className="flex h-7 w-7 items-center justify-center" title="Téléchargement en cours">
                    <Spinner className="size-3.5 text-muted-foreground" label="Téléchargement en cours" />
                  </span>
                ) : (
                  <RowButton
                    title={track.state.status === "error" ? "Échec du téléchargement, réessayer" : "Télécharger"}
                    onClick={() => void callModule("prepareMusic", track.id).then(() => setTimeout(onChanged, 400))}
                  >
                    <Download className={cn("h-4 w-4", track.state.status === "error" && "text-destructive")} />
                  </RowButton>
                )}
                {track.added && (
                  <RowButton
                    title="Retirer de la banque"
                    onClick={async () => {
                      rowErrors.clear(track.id);
                      await callModule("removeMusicFromLibrary", track.id).catch((error) =>
                        rowErrors.set(track.id, errorMessage(error, "Le morceau n’a pas pu être retiré. Réessayez."))
                      );
                      onChanged();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </RowButton>
                )}
              </TrackRow>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      <p className="text-[11px] leading-4 text-muted-foreground">
        <BrandLogo brand="jamendo" className="mr-1 inline size-3.5 align-[-3px]" />
        Morceaux de Jamendo sous licence CC BY ou CC0 : utilisables dans vos vidéos, y compris
        commerciales. Pour CC BY, citez l&apos;artiste ; les crédits sont rappelés à l&apos;export.
      </p>
    </div>
  );
}

// ─── Découvrir ───────────────────────────────────────────────────

function DiscoverTab({ preview, onAdded }: { preview: ReturnType<typeof usePreview>; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [onlyInstrumental, setOnlyInstrumental] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [addMood, setAddMood] = useState("chill");
  // L'échec d'une recherche se lit sous le champ ; celui d'un ajout, sur sa ligne.
  const searchFeedback = useFeedback();
  const rowErrors = useRowErrors();

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    searchFeedback.clear();
    try {
      setResults(await callModule<MusicCandidate[]>("searchMusic", { query }));
    } catch (error) {
      searchFeedback.error(errorMessage(error, "La recherche n’a pas abouti. Réessayez dans un instant."));
    } finally {
      setSearching(false);
    }
  };

  const add = async (candidate: MusicCandidate) => {
    setAdding(candidate.id);
    rowErrors.clear(candidate.id);
    try {
      await callModule("addMusicToLibrary", { id: candidate.id, mood: addMood });
      // La coche qui remplace le bouton confirme l'ajout.
      setResults((current) => current?.map((entry) => (entry.id === candidate.id ? { ...entry, inLibrary: true } : entry)) ?? null);
      onAdded();
    } catch (error) {
      rowErrors.set(candidate.id, errorMessage(error, "Le morceau n’a pas pu rejoindre la banque. Réessayez."));
    } finally {
      setAdding(null);
    }
  };

  const visible = (results ?? []).filter((entry) => !onlyInstrumental || entry.instrumental);

  return (
    <div className="flex flex-col gap-3 p-3">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="piano, epic, lofi, ukulele…" className="h-8 pr-8 pl-8 text-sm" />
        {searching && <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" label="Recherche…" />}
      </form>
      <FormStatus state={searchFeedback.state} />

      <div className="flex flex-col gap-2 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyInstrumental} onChange={(event) => setOnlyInstrumental(event.target.checked)} className="accent-primary" />
          Instrumentaux seulement
        </label>
        <label className="flex items-center gap-1.5">
          Ajouter dans l&apos;ambiance
          <select value={addMood} onChange={(event) => setAddMood(event.target.value)} className="rounded border bg-background px-1 py-0.5 text-[11px] text-foreground">
            {Object.entries(MOOD_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {results === null ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <BrandLogo brand="jamendo" labelled className="size-5" />
            <BrandLogo brand="openverse" labelled className="size-5" />
          </span>
          Cherchez parmi des centaines de milliers de morceaux libres de Jamendo, via Openverse.
        </div>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Aucun morceau trouvé.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((candidate) => (
            <li key={candidate.id}>
              <TrackRow
                title={candidate.title}
                artist={candidate.artist}
                meta={`${duration(candidate.durationMs)} · ${candidate.license}${candidate.genres.length ? ` · ${candidate.genres.slice(0, 2).join(", ")}` : ""}`}
                playing={preview.playing === candidate.id}
                onPreview={() => preview.toggle(candidate.id, candidate.audioUrl)}
                pageUrl={candidate.pageUrl}
                status={rowErrors.of(candidate.id) ?? preview.failureOf(candidate.id)}
              >
                {candidate.inLibrary ? (
                  <span className="flex h-7 w-7 items-center justify-center" title="Déjà dans la banque">
                    <Check className="h-4 w-4 text-emerald-500" />
                  </span>
                ) : (
                  <RowButton title="Ajouter à la banque" onClick={() => void add(candidate)}>
                    {adding === candidate.id ? <Spinner className="size-4" aria-hidden /> : <Plus className="h-4 w-4" />}
                  </RowButton>
                )}
              </TrackRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Éléments communs ────────────────────────────────────────────

function MoodChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function RowButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function TrackRow({
  title,
  artist,
  meta,
  playing,
  onPreview,
  pageUrl,
  status,
  detail,
  below,
  children,
}: {
  title: string;
  artist: string;
  meta: string;
  playing: boolean;
  onPreview: () => void;
  pageUrl?: string;
  /** Échec d'une action de la ligne (écoute, ajout, retrait). */
  status?: FeedbackState | null;
  /** Ligne de plus sous le titre (état des droits). */
  detail?: React.ReactNode;
  /** Zone dépliée sous la ligne, alignée sur le texte. */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  const row = (
    <div className={cn("group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors", playing ? "bg-primary/10" : "hover:bg-muted/60")}>
      <button
        type="button"
        onClick={onPreview}
        aria-label={playing ? "Arrêter l'extrait" : "Écouter un extrait"}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          playing ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-primary/20"
        )}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {artist} · {meta}
        </p>
        {detail}
        <ActionStatus state={status ?? null} className="max-w-full text-[11px] empty:hidden" />
      </div>
      {pageUrl && (
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          title="Page du morceau"
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground group-hover:flex"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {children}
    </div>
  );
  return (
    <div className="min-w-0">
      {row}
      <AnimatePresence initial={false}>{below}</AnimatePresence>
    </div>
  );
}

// ─── Droits d'un morceau ─────────────────────────────────────────

const RIGHTS_ICONS: Record<TrackRightsState, typeof ShieldAlert> = {
  clear: Check,
  "at-risk": ShieldAlert,
  claimed: ShieldAlert,
  withdrawn: Ban,
  unknown: ShieldQuestion,
};

const RIGHTS_TONES: Record<TrackRightsState, string> = {
  clear: "text-muted-foreground",
  "at-risk": "text-amber-700 dark:text-amber-400",
  claimed: "text-red-700 dark:text-red-400",
  withdrawn: "text-red-700 dark:text-red-400",
  unknown: "text-muted-foreground",
};

function frenchDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString("fr-FR");
}

/**
 * État des droits d'un morceau qui n'est pas libre, sous son titre : icône,
 * libellé, raison et date du dernier contrôle abouti. Cliquable pour un
 * admin, qui ouvre la preuve et les actions.
 */
function RightsLine({
  rights,
  checkedAt,
  open,
  onToggle,
}: {
  rights: TrackRightsNote;
  checkedAt?: string;
  open: boolean;
  onToggle?: () => void;
}) {
  const Icon = RIGHTS_ICONS[rights.state];
  const checked = frenchDate(checkedAt);
  const text = [
    TRACK_RIGHTS_LABELS[rights.state],
    rights.reason,
    checked ? `contrôlé le ${checked}` : "jamais contrôlé",
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {onToggle && <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />}
    </>
  );
  const className = cn("flex w-full min-w-0 items-center gap-1 text-left text-[11px] leading-4", RIGHTS_TONES[rights.state]);
  if (!onToggle) {
    return (
      <p className={className} title={text}>
        {body}
      </p>
    );
  }
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} title={text} className={cn(className, "rounded-sm hover:underline")}>
      {body}
    </button>
  );
}

function checkSummary(check: RightsCheck): string {
  const source = check.source === "openverse" ? "Openverse" : check.source === "jamendo" ? "Jamendo" : check.source;
  const when = frenchDate(check.at) ?? check.at;
  if (!check.ok) return `${source}, ${when} : injoignable${check.note ? ` (${check.note})` : ""}`;
  if (check.listed === false) return `${source}, ${when} : morceau absent`;
  return `${source}, ${when} : listé${check.license ? `, ${check.license}` : ""}`;
}

/** Fichier JSON de la preuve, à garder avec une contestation. */
function evidenceDownload(record: TrackRightsRecord): string {
  return URL.createObjectURL(new Blob([JSON.stringify(record.evidence, null, 2)], { type: "application/json" }));
}

/**
 * Détail des droits d'un morceau (admins) : la preuve de licence, le dernier
 * contrôle, « Vérifier maintenant » et le changement d'état à la main.
 * Chaque retour s'affiche à côté de son action ; l'attente reste dans la zone.
 */
function RightsDetails({ trackId, current, onChanged }: { trackId: string; current?: TrackRightsState; onChanged: () => void }) {
  const [record, setRecord] = useState<TrackRightsRecord | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<TrackRightsState>(current === "clear" ? "at-risk" : "clear");
  const [note, setNote] = useState("");
  const [download, setDownload] = useState<string | null>(null);
  const loadFeedback = useFeedback();
  const checkFeedback = useFeedback();
  const saveFeedback = useFeedback();
  const { error: loadError } = loadFeedback;

  useEffect(() => {
    let cancelled = false;
    callModule<TrackRightsRecord>("getMusicRights", trackId)
      .then((next) => !cancelled && setRecord(next))
      .catch((error) => !cancelled && loadError(errorMessage(error, "Les droits de ce morceau n’ont pas pu être lus.")));
    return () => {
      cancelled = true;
    };
  }, [trackId, loadError]);

  // Le lien de téléchargement suit la preuve affichée, et se libère ensuite.
  useEffect(() => {
    if (!record?.evidence) return setDownload(null);
    const url = evidenceDownload(record);
    setDownload(url);
    return () => URL.revokeObjectURL(url);
  }, [record]);

  const checkNow = async () => {
    setChecking(true);
    checkFeedback.clear();
    try {
      const next = await callModule<TrackRightsRecord>("checkMusicRightsNow", trackId);
      setRecord(next);
      const last = next.checks.filter((check) => check.source === "openverse").at(-1);
      if (last && !last.ok) checkFeedback.error("Openverse n’a pas répondu : l’état ne change pas.");
      else checkFeedback.success("Contrôle fait");
      onChanged();
    } catch (error) {
      checkFeedback.error(errorMessage(error, "Le contrôle n’a pas pu être lancé. Réessayez."));
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!note.trim()) {
      saveFeedback.error("Expliquez ce changement d’état dans la note.");
      return;
    }
    setSaving(true);
    saveFeedback.clear();
    try {
      setRecord(await callModule<TrackRightsRecord>("setMusicRightsState", trackId, state, note));
      setNote("");
      saveFeedback.success("État enregistré");
      onChanged();
    } catch (error) {
      saveFeedback.error(errorMessage(error, "L’état n’a pas pu être enregistré. Réessayez."));
    } finally {
      setSaving(false);
    }
  };

  const evidence = record?.evidence;
  const lastCheck = record?.checks.at(-1);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="min-w-0 overflow-hidden"
    >
      <div className="flex min-w-0 flex-col gap-2 pt-1 pr-1.5 pb-2 pl-[2.875rem] text-[11px] leading-4 text-muted-foreground">
        {!record ? (
          loadFeedback.state ? (
            <ActionStatus state={loadFeedback.state} className="max-w-full text-[11px]" />
          ) : (
            <span className="flex h-8 items-center">
              <Spinner className="size-3.5" label="Lecture des droits…" />
            </span>
          )
        ) : (
          <>
            {evidence ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0">
                  Preuve de licence du {frenchDate(evidence.capturedAt)}, {evidence.license}
                </span>
                {evidence.archiveUrl && (
                  <a href={evidence.archiveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
                    <ExternalLink className="size-3" aria-hidden />
                    Archive
                  </a>
                )}
                {download && (
                  <a href={download} download={`preuve-${trackId}.json`} className="inline-flex items-center gap-1 text-foreground hover:underline">
                    <FileJson className="size-3" aria-hidden />
                    JSON
                  </a>
                )}
              </div>
            ) : (
              <p>Aucune preuve de licence pour l’instant : elle se prend après le téléchargement du morceau.</p>
            )}
            {lastCheck && (
              <p className="min-w-0 truncate" title={checkSummary(lastCheck)}>
                Dernier contrôle : {checkSummary(lastCheck)}
              </p>
            )}
            <div className="flex min-w-0 items-center gap-2">
              <Button type="button" variant="outline" size="xs" loading={checking} onClick={() => void checkNow()}>
                Vérifier maintenant
              </Button>
              <ActionStatus state={checkFeedback.state} className="min-w-0 flex-1 text-[11px]" />
            </div>

            <form
              className="flex min-w-0 flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">Passer à</span>
                <select
                  value={state}
                  onChange={(event) => setState(event.target.value as TrackRightsState)}
                  className="min-w-0 rounded border bg-background px-1 py-0.5 text-[11px] text-foreground"
                >
                  {(Object.keys(TRACK_RIGHTS_LABELS) as TrackRightsState[]).map((key) => (
                    <option key={key} value={key}>
                      {TRACK_RIGHTS_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  saveFeedback.clear();
                }}
                maxLength={500}
                placeholder="Note : contestation gagnée, licence achetée…"
                aria-label="Note du changement d’état"
                className="h-7 text-[11px]"
              />
              <FormStatus state={saveFeedback.state} />
              <div>
                <Button type="submit" size="xs" loading={saving}>
                  Enregistrer l’état
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </motion.div>
  );
}
