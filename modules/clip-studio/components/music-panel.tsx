"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, ExternalLink, Library, Loader2, Pause, Play, Plus, Search, Telescope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MediaSource } from "../engine/types";
import { callModule } from "../lib/client";
import type { MusicCandidate, MusicEntry } from "../lib/music";

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

/** Un seul extrait joué à la fois, arrêté en quittant le panneau. */
function usePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }, []);

  const toggle = useCallback(
    (id: string, url: string) => {
      if (playing === id) return stop();
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.volume = 0.7;
      audio.onended = () => setPlaying((current) => (current === id ? null : current));
      audio.onerror = () => {
        toast.error("Extrait illisible");
        setPlaying(null);
      };
      void audio.play().catch(() => undefined);
      audioRef.current = audio;
      setPlaying(id);
    },
    [playing, stop]
  );

  useEffect(() => stop, [stop]);
  return { playing, toggle, stop };
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
  const moods = Object.keys(MOOD_LABELS).filter((key) => tracks?.some((track) => track.mood === key));
  const visible = (tracks ?? []).filter((track) => !mood || track.mood === mood);
  const ready = tracks?.filter((track) => track.state.status === "ready").length ?? 0;

  if (!tracks) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
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
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
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
                      await callModule("removeMusicFromLibrary", track.id).catch((error) => toast.error(error.message));
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

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await callModule<MusicCandidate[]>("searchMusic", { query }));
    } catch (error: any) {
      toast.error(error?.message ?? "Recherche impossible");
    } finally {
      setSearching(false);
    }
  };

  const add = async (candidate: MusicCandidate) => {
    setAdding(candidate.id);
    try {
      await callModule("addMusicToLibrary", { id: candidate.id, mood: addMood });
      setResults((current) => current?.map((entry) => (entry.id === candidate.id ? { ...entry, inLibrary: true } : entry)) ?? null);
      toast.success(`« ${candidate.title} » rejoint la banque`);
      onAdded();
    } catch (error: any) {
      toast.error(error?.message ?? "Ajout impossible");
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
        {searching && <Loader2 className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </form>

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
        <p className="py-6 text-center text-xs text-muted-foreground">
          Cherchez parmi des centaines de milliers de morceaux libres de Jamendo, via Openverse.
        </p>
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
              >
                {candidate.inLibrary ? (
                  <span className="flex h-7 w-7 items-center justify-center" title="Déjà dans la banque">
                    <Check className="h-4 w-4 text-emerald-500" />
                  </span>
                ) : (
                  <RowButton title="Ajouter à la banque" onClick={() => void add(candidate)}>
                    {adding === candidate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
  children,
}: {
  title: string;
  artist: string;
  meta: string;
  playing: boolean;
  onPreview: () => void;
  pageUrl?: string;
  children: React.ReactNode;
}) {
  return (
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
}
