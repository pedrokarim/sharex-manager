"use client";

import { BrandLogo, type Brand } from "@/components/brand-logo";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AudioLines, Download, HardDrive, Loader2, Mars, Play, Search, Settings2, Square, Venus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callModule } from "../lib/client";
import type { VoiceSource, VoiceStatus } from "../lib/tts";
import type { ResourceState } from "../lib/resources";
import { VOICE_SPEEDS } from "../lib/voice-settings";

export interface VoicesInfo {
  engine: ResourceState;
  voices: VoiceStatus[];
  sources?: VoiceSource[];
}

type SourceId = VoiceStatus["provider"];

/** Voix et état de leur téléchargement, relus tant qu'un téléchargement avance. */
export function useVoices() {
  const [info, setInfo] = useState<VoicesInfo | null>(null);
  /** La liste n'a pas pu être lue (Clip Studio absent ou désactivé). */
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const next = await callModule<VoicesInfo>("getVoices").catch(() => null);
    if (next) setInfo(next);
    setFailed(!next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloading =
    info?.engine.status === "downloading" || info?.voices.some((voice) => voice.state.status === "downloading");
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(refresh, 1200);
    return () => clearInterval(timer);
  }, [downloading, refresh]);

  const prepare = useCallback(
    async (id: string) => {
      await callModule("prepareVoice", id).catch(() => undefined);
      setTimeout(refresh, 300);
    },
    [refresh]
  );

  return { info, failed, refresh, prepare };
}

function progress(state: ResourceState) {
  return state.total ? Math.min(100, Math.round((state.received / state.total) * 100)) : 0;
}

// ─── Écoute ──────────────────────────────────────────────────────

/**
 * Lecteur d'extraits partagé par toute la page : un seul extrait joue à la
 * fois, et un second clic sur le même l'arrête.
 */
type SampleState = { key: string; status: "loading" | "playing" } | null;

let sampleState: SampleState = null;
let sampleAudio: HTMLAudioElement | null = null;
const sampleListeners = new Set<() => void>();

function setSampleState(next: SampleState) {
  sampleState = next;
  for (const listener of sampleListeners) listener();
}

function stopSample() {
  if (sampleAudio) {
    sampleAudio.pause();
    sampleAudio.src = "";
    sampleAudio = null;
  }
  setSampleState(null);
}

export interface SampleRequest {
  voice: string;
  speed?: number;
  tone?: string;
}

function sampleKey(request: SampleRequest) {
  return `${request.voice}|${(request.speed ?? 1).toFixed(2)}|${request.tone ?? ""}`;
}

async function toggleSample(request: SampleRequest) {
  const key = sampleKey(request);
  if (sampleState?.key === key) {
    stopSample();
    return;
  }
  stopSample();
  setSampleState({ key, status: "loading" });
  try {
    const { url } = await callModule<{ url: string }>("previewVoice", request);
    // Un autre extrait a été demandé entre-temps : celui-ci ne joue pas.
    if (sampleState?.key !== key) return;
    const audio = new Audio(url);
    sampleAudio = audio;
    audio.onended = () => {
      if (sampleAudio === audio) stopSample();
    };
    audio.onerror = () => {
      if (sampleAudio === audio) {
        stopSample();
        toast.error("Lecture de l’extrait impossible");
      }
    };
    await audio.play();
    if (sampleAudio === audio) setSampleState({ key, status: "playing" });
  } catch (error) {
    if (sampleState?.key === key) stopSample();
    toast.error(error instanceof Error ? error.message : "Extrait indisponible");
  }
}

function useSampleState(): SampleState {
  return useSyncExternalStore(
    (listener) => {
      sampleListeners.add(listener);
      return () => sampleListeners.delete(listener);
    },
    () => sampleState,
    () => null
  );
}

/** Bouton « Écouter » d'une voix : synthèse d'une phrase d'exemple, mise en cache par le serveur. */
export function VoiceListenButton({ request, provider, className }: { request: SampleRequest; provider: SourceId; className?: string }) {
  const state = useSampleState();
  const mine = state?.key === sampleKey(request) ? state.status : null;
  const label = mine === "playing" ? "Arrêter l’écoute" : mine === "loading" ? "Préparation de l’extrait…" : "Écouter";
  const quota = provider === "azure" ? " (la première écoute compte dans le quota Azure)" : provider === "piper" ? "" : " (texte envoyé au fournisseur)";
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label}${mine ? "" : quota}`}
      onClick={(event) => {
        event.stopPropagation();
        void toggleSample(request);
      }}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mine && "text-primary",
        className
      )}
    >
      {mine === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mine === "playing" ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── Sources ─────────────────────────────────────────────────────

const SOURCES: { id: SourceId; label: string; brand?: Brand }[] = [
  { id: "piper", label: "Locales" },
  { id: "edge", label: "Edge", brand: "microsoft" },
  { id: "azure", label: "Azure", brand: "microsoft" },
  { id: "openai", label: "OpenAI", brand: "openai" },
  { id: "google", label: "Google", brand: "googlecloud" },
  { id: "elevenlabs", label: "ElevenLabs", brand: "elevenlabs" },
];

const SOURCE_NOTES: Partial<Record<SourceId, string>> = {
  piper: "Gratuites, calculées sur ce serveur ; rien ne sort.",
  edge: "Accès non officiel à la lecture à voix haute d’Edge : gratuit, mais Microsoft peut le couper sans préavis. Gardez une voix locale en secours.",
  azure: "Offre gratuite d’Azure : 500 000 caractères par mois.",
  openai: "Payée à l’usage sur votre compte OpenAI.",
  google: "Payée à l’usage sur votre projet Google Cloud.",
  elevenlabs: "Comptée sur votre abonnement ElevenLabs.",
};

const PREFERENCE_KEY = "clip-studio.voice-picker";

interface PickerPreference {
  /** Dernière voix choisie dans un sélecteur, reprise par la fenêtre « Créer ». */
  voice?: string;
  source?: SourceId;
  language?: string;
  gender?: "all" | "female" | "male";
}

function readPreference(): PickerPreference {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFERENCE_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writePreference(patch: PickerPreference) {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ ...readPreference(), ...patch }));
  } catch {
    // Navigation privée ou stockage plein : la préférence n'est simplement pas gardée.
  }
}

/** Dernière voix choisie dans un sélecteur de voix, sur ce navigateur. */
export function lastPickedVoice(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const voice = readPreference().voice;
  return typeof voice === "string" && voice ? voice : undefined;
}

function sourceOf(voiceId: string): SourceId {
  const prefix = /^(edge|azure|openai|google|elevenlabs):/.exec(voiceId)?.[1];
  return (prefix as SourceId | undefined) ?? "piper";
}

let languageNames: Intl.DisplayNames | null = null;
function languageName(code: string): string {
  try {
    languageNames ??= new Intl.DisplayNames(["fr"], { type: "language" });
    const name = languageNames.of(code) ?? code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code;
  }
}

function UsageGauge({ usage }: { usage: NonNullable<VoiceSource["usage"]> }) {
  const ratio = Math.min(1, usage.characters / usage.limit);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", ratio > 0.9 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </span>
      <span className="min-w-0 truncate tabular-nums">
        {usage.characters.toLocaleString("fr-FR")} / {usage.limit.toLocaleString("fr-FR")} caractères ce mois-ci
      </span>
    </span>
  );
}

/**
 * Choix d'une voix : d'abord la source (locales, Edge, Azure, OpenAI,
 * Google, ElevenLabs), puis la voix, avec recherche, langue et genre. Chaque
 * voix s'écoute sur place. Choisir une voix locale pas encore téléchargée
 * lance son téléchargement.
 */
export function VoicePicker({
  value,
  onChange,
  voices,
  onPrepare,
  compact,
  speed,
  tone,
  remember = true,
}: {
  value: string;
  onChange: (id: string) => void;
  voices: VoicesInfo | null;
  onPrepare: (id: string) => void;
  compact?: boolean;
  /** Réglages appliqués à l'écoute, pour entendre la voix telle qu'elle sera lue. */
  speed?: number;
  tone?: string;
  /** Garder la voix choisie comme dernière voix de ce navigateur ; non pour la voix d'une marque. */
  remember?: boolean;
}) {
  const [source, setSource] = useState<SourceId>(() => sourceOf(value));
  const [language, setLanguage] = useState("fr");
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [query, setQuery] = useState("");

  // Préférences locales : lues après le montage (le rendu serveur n'a pas de stockage).
  useEffect(() => {
    const saved = readPreference();
    if (typeof saved.language === "string") setLanguage(saved.language);
    if (saved.gender === "female" || saved.gender === "male" || saved.gender === "all") setGender(saved.gender);
  }, []);

  // La source suit la voix choisie (préférence du compte chargée après coup…).
  useEffect(() => {
    setSource(sourceOf(value));
  }, [value]);

  const sources = useMemo(() => {
    const known = new Map((voices?.sources ?? []).map((entry) => [entry.id, entry]));
    return SOURCES.map((entry) => ({
      ...entry,
      status: known.get(entry.id) ?? { id: entry.id, label: entry.label, available: entry.id === "piper" || (voices?.voices.some((voice) => voice.provider === entry.id) ?? false) },
      count: voices?.voices.filter((voice) => voice.provider === entry.id).length ?? 0,
    }));
  }, [voices]);

  const current = sources.find((entry) => entry.id === source) ?? sources[0];
  const sourceVoices = useMemo(() => voices?.voices.filter((voice) => voice.provider === source) ?? [], [voices, source]);
  const languages = useMemo(() => {
    const codes = Array.from(new Set(sourceVoices.map((voice) => (voice.locale ?? "").slice(0, 2).toLowerCase()).filter(Boolean)));
    return codes.sort((a, b) => (a === "fr" ? -1 : b === "fr" ? 1 : languageName(a).localeCompare(languageName(b), "fr")));
  }, [sourceVoices]);
  const showFilters = sourceVoices.length > 8;
  const activeLanguage = showFilters && languages.includes(language) ? language : "all";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sourceVoices.filter((voice) => {
      if (!showFilters) return true;
      if (activeLanguage !== "all" && !(voice.locale ?? "").toLowerCase().startsWith(activeLanguage)) return false;
      if (gender !== "all" && voice.gender !== gender) return false;
      if (needle && !`${voice.label} ${voice.description} ${voice.locale ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sourceVoices, showFilters, activeLanguage, gender, query]);

  if (!voices) {
    return (
      <div className="space-y-2">
        <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-11 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  const chooseSource = (id: SourceId) => {
    setSource(id);
    writePreference({ source: id });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div role="tablist" aria-label="Source des voix" className="flex flex-wrap gap-1">
        {sources.map((entry) => {
          const active = entry.id === source;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={entry.status.available ? `${entry.status.label}, ${entry.count} voix` : entry.status.reason ?? "Source indisponible"}
              onClick={() => chooseSource(entry.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                // Source indisponible : bordure en pointillés, texte toujours lisible.
                !entry.status.available && "border-dashed"
              )}
            >
              {entry.brand ? <BrandLogo brand={entry.brand} className="size-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
              {entry.label}
            </button>
          );
        })}
      </div>

      {SOURCE_NOTES[source] && <p className="text-[11px] leading-4 text-muted-foreground">{SOURCE_NOTES[source]}</p>}
      {source === "azure" && current.status.usage && (
        <div className="text-[11px] text-muted-foreground">
          <UsageGauge usage={current.status.usage} />
        </div>
      )}

      {!current.status.available ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <p>{current.status.reason ?? "Cette source n’est pas configurée."}</p>
          <Link href="/m/clip-studio/voices" className="mt-1.5 inline-flex items-center gap-1 text-primary hover:underline">
            <Settings2 className="h-3.5 w-3.5" />
            Ouvrir «&nbsp;Voix en ligne&nbsp;»
          </Link>
        </div>
      ) : (
        <>
          {current.status.reason && sourceVoices.length === 0 && <p className="text-xs text-destructive">{current.status.reason}</p>}
          {showFilters && (
            <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto]")}>
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Chercher une voix…"
                  aria-label="Chercher une voix"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <div className={cn("flex min-w-0 gap-1.5", !compact && "contents")}>
                <Select
                  value={activeLanguage}
                  onValueChange={(next) => {
                    setLanguage(next);
                    writePreference({ language: next });
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-0 flex-1 text-xs" aria-label="Langue">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Toutes les langues</SelectItem>
                    {languages.map((code) => (
                      <SelectItem key={code} value={code}>
                        {languageName(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="inline-flex h-8 shrink-0 rounded-md bg-muted p-0.5" role="group" aria-label="Genre">
                  {(
                    [
                      ["all", "Toutes", null],
                      ["female", "Féminines", Venus],
                      ["male", "Masculines", Mars],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={gender === id}
                      title={label}
                      aria-label={label}
                      onClick={() => {
                        setGender(id);
                        writePreference({ gender: id });
                      }}
                      className={cn(
                        "flex items-center justify-center rounded px-2 text-xs",
                        gender === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {Icon ? <Icon className="h-3.5 w-3.5" /> : "Toutes"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div role="listbox" aria-label="Voix" className={cn("min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border", compact ? "max-h-60" : "max-h-[min(16rem,25vh)]")}>
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">
                {sourceVoices.length === 0 ? "Aucune voix pour l’instant." : "Aucune voix ne correspond à ces filtres."}
              </p>
            ) : (
              filtered.map((voice) => {
                const selected = voice.id === value;
                const state = voice.state;
                const Gender = voice.gender === "female" ? Venus : voice.gender === "male" ? Mars : AudioLines;
                return (
                  <div
                    key={voice.id}
                    role="option"
                    aria-selected={selected}
                    className={cn("relative flex min-w-0 items-center gap-1 border-b px-1.5 last:border-b-0", selected ? "bg-primary/10" : "hover:bg-muted/60")}
                  >
                    <button
                      type="button"
                      title={voice.license ? `${voice.description}. ${voice.credit}, ${voice.license}.` : `${voice.description}. Voix en ligne ${voice.credit}.`}
                      onClick={() => {
                        onChange(voice.id);
                        if (remember) writePreference({ voice: voice.id });
                        if (state.status === "missing" || state.status === "error") onPrepare(voice.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-1 text-left"
                    >
                      <Gender className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{voice.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {state.status === "downloading"
                            ? `Téléchargement ${progress(state)} %`
                            : state.status === "error"
                              ? "Échec, cliquer pour réessayer"
                              : voice.description}
                        </span>
                      </span>
                      {state.status === "downloading" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                      {(state.status === "missing" || state.status === "error") && (
                        <span title="Téléchargée au premier usage">
                          <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </span>
                      )}
                    </button>
                    <VoiceListenButton request={{ voice: voice.id, speed, tone: voice.provider === "piper" ? tone : undefined }} provider={voice.provider} />
                    {state.status === "downloading" && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/20">
                        <span className="block h-full bg-primary transition-[width]" style={{ width: `${progress(state)}%` }} />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {showFilters && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {filtered.length} voix sur {sourceVoices.length}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Mention des licences des voix, obligatoire pour les voix CC BY. */
export function VoiceCredit({ voice }: { voice?: VoiceStatus }) {
  if (!voice) return null;
  if (voice.provider === "edge") {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        Voix {voice.label}&nbsp;: synthèse Microsoft par la lecture à voix haute d’Edge, voix générée par IA. Le texte lu est
        envoyé à Microsoft.
      </p>
    );
  }
  if (voice.provider === "azure") {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        Voix {voice.label}&nbsp;: synthèse Microsoft Azure, voix générée par IA. Le texte lu est envoyé à Microsoft et compte dans
        le quota de la ressource.
      </p>
    );
  }
  if (voice.provider !== "piper") {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        Voix {voice.label}&nbsp;: synthèse en ligne {voice.credit}, voix générée par IA. Le texte lu est envoyé au fournisseur et
        facturé sur votre compte.
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-4 text-muted-foreground">
      Voix {voice.label}&nbsp;: {voice.credit}, licence {voice.license}. Synthèse locale avec Piper.
    </p>
  );
}

/** Intonation des voix locales (Piper). */
export const PIPER_TONE_OPTIONS = [
  { value: "steady", label: "Régulière", hint: "Débit stable, peu de variations" },
  { value: "balanced", label: "Équilibrée", hint: "Le bon compromis, par défaut" },
  { value: "expressive", label: "Expressive", hint: "Réglage d’origine du modèle, plus vivant mais plus irrégulier" },
] as const;

/** Débit d'une voix : les paliers de l'éditeur (Posée, Normale, Rapide). */
export function SpeedControl({ value, onChange }: { value: number; onChange: (speed: number) => void }) {
  return (
    <div className="inline-flex w-full rounded-lg bg-muted p-1" role="group" aria-label="Débit">
      {VOICE_SPEEDS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={value === entry.value}
          title={`Débit ×${entry.value.toLocaleString("fr-FR")}`}
          onClick={() => onChange(entry.value)}
          className={
            value === entry.value
              ? "flex-1 rounded-md bg-background px-2 py-1 text-xs font-medium shadow-sm"
              : "flex-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export function ToneControl({ value, onChange }: { value: string; onChange: (tone: string) => void }) {
  return (
    <div className="inline-flex w-full rounded-lg bg-muted p-1" role="group" aria-label="Intonation">
      {PIPER_TONE_OPTIONS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          title={entry.hint}
          aria-pressed={value === entry.value}
          onClick={() => onChange(entry.value)}
          className={
            value === entry.value
              ? "flex-1 rounded-md bg-background px-2 py-1 text-xs font-medium shadow-sm"
              : "flex-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
