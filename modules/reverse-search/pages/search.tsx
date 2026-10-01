"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Ghost, History, ImagePlus, Link2, Loader2, Plus, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAccountPreference } from "@/hooks/use-account-preference";
import { cn } from "@/lib/utils";
import { EngineSection } from "../components/engine-results";
import { ModuleShell } from "../components/module-shell";
import {
  MODULE_PATH,
  SEARCH_PREFERENCE_DEFAULTS,
  SEARCH_PREFERENCE_SCOPE,
  callModule,
  fileToBase64,
  formatBytes,
  formatDate,
  useCatalogue,
} from "../lib/client";
import type { ExternalLinks } from "../lib/search";
import {
  ENGINES,
  bestMatchOf,
  engineInfo,
  formatSimilarity,
  type EngineId,
  type EngineResult,
  type SearchView,
} from "../lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

type Results = Partial<Record<EngineId, EngineResult | "loading">>;
type SearchInput = { image: { b64: string; name: string } } | { galleryFile: string } | { url: string };

const ORIGIN_LABELS = { device: "Depuis l’ordinateur", gallery: "Depuis la galerie", link: "Depuis un lien" } as const;

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { catalogue } = useCatalogue();
  const { value: prefs, update: updatePrefs } = useAccountPreference(SEARCH_PREFERENCE_SCOPE, SEARCH_PREFERENCE_DEFAULTS);

  const [search, setSearch] = useState<SearchView | null>(null);
  const [results, setResults] = useState<Results>({});
  const [starting, setStarting] = useState(false);
  const [links, setLinks] = useState<ExternalLinks | null>(null);
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const current = useRef<SearchView | null>(null);
  current.current = search;

  /** Moteurs dont les résultats peuvent s'afficher dans la page. */
  const inlineReady = useMemo(
    () => new Set((catalogue?.engines ?? []).filter((engine) => engine.inlineReady).map((engine) => engine.id)),
    [catalogue]
  );
  const selected = useMemo(() => new Set(prefs.engines), [prefs.engines]);

  // ─── Recherche ─────────────────────────────────────────────────

  const run = useCallback(async (id: string, engine: EngineId) => {
    setResults((previous) => ({ ...previous, [engine]: "loading" }));
    try {
      const result = await callModule<EngineResult>("runEngine", id, engine, window.location.origin);
      if (current.current?.id === id) setResults((previous) => ({ ...previous, [engine]: result }));
    } catch (error) {
      if (current.current?.id !== id) return;
      setResults((previous) => ({
        ...previous,
        [engine]: {
          engine,
          status: "error",
          matches: [],
          message: error instanceof Error ? error.message : "Échec de la recherche.",
          durationMs: 0,
          ranAt: Date.now(),
        },
      }));
    }
  }, []);

  /** Referme une recherche éphémère côté serveur : son image y est oubliée tout de suite. */
  const release = useCallback((view: SearchView | null) => {
    if (!view?.ephemeral) return;
    void fetch("/api/modules/call-function", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleName: "reverse-search", functionName: "closeSearch", args: [view.id] }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const start = useCallback(
    async (input: SearchInput) => {
      setStarting(true);
      try {
        const view = await callModule<SearchView>("startSearch", { ...input, ephemeral: prefs.ephemeral });
        release(current.current);
        current.current = view;
        setSearch(view);
        setLinks(null);
        setResults({});
        // Chaque moteur répond à son rythme : les résultats arrivent un par un.
        for (const engine of ENGINES) {
          if (selected.has(engine.id) && engine.inline !== "none") void run(view.id, engine.id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Recherche impossible.");
      } finally {
        setStarting(false);
      }
    },
    [prefs.ephemeral, selected, run, release]
  );

  const startFromFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) return void toast.error("Ce fichier n’est pas une image.");
      if (file.size > MAX_BYTES) return void toast.error("Image trop lourde (20 Mo maximum).");
      await start({ image: { b64: await fileToBase64(file), name: file.name || "image" } });
    },
    [start]
  );

  const reset = useCallback(() => {
    release(current.current);
    current.current = null;
    setSearch(null);
    setResults({});
    setLinks(null);
  }, [release]);

  // Une recherche éphémère ne survit pas à la page.
  useEffect(() => {
    const onLeave = () => release(current.current);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [release]);

  // Arrivée depuis la galerie (`?files=`) ou depuis l'historique (`?search=`).
  const handledParams = useRef("");
  useEffect(() => {
    const file = searchParams.get("files")?.split(",")[0];
    const stored = searchParams.get("search");
    const key = `${file ?? ""}|${stored ?? ""}`;
    if (key === "|" || key === handledParams.current || !catalogue) return;
    handledParams.current = key;
    router.replace(MODULE_PATH, { scroll: false });
    if (stored) {
      callModule<SearchView>("openSearch", stored)
        .then((view) => {
          release(current.current);
          current.current = view;
          setSearch(view);
          setLinks(null);
          setResults(view.results);
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Recherche introuvable."));
    } else if (file) {
      void start({ galleryFile: file });
    }
  }, [searchParams, catalogue, router, start, release]);

  // ─── Dépôt et collage ──────────────────────────────────────────

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        void startFromFile(file);
        return;
      }
      // Une adresse collée hors d'un champ de saisie lance aussi la recherche.
      const target = event.target as HTMLElement | null;
      const text = event.clipboardData?.getData("text/plain").trim() ?? "";
      if (!target?.closest("input, textarea") && /^https?:\/\/\S+$/.test(text)) void start({ url: text });
    };
    const carriesImage = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
      return types.includes("Files") || types.includes("text/uri-list");
    };
    const onEnter = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      dragDepth.current++;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (carriesImage(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesImage(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = Array.from(event.dataTransfer?.files ?? []).find((entry) => entry.type.startsWith("image/"));
      if (file) return void startFromFile(file);
      // Image glissée depuis un autre onglet : le navigateur ne donne que son adresse.
      const dropped = event.dataTransfer?.getData("text/uri-list").split("\n")[0]?.trim();
      if (dropped && /^https?:\/\//.test(dropped)) void start({ url: dropped });
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [start, startFromFile]);

  // ─── Liens vers les sites des moteurs ──────────────────────────

  /**
   * Ouvre la page de résultats d'un moteur. L'onglet est ouvert tout de suite,
   * puis dirigé une fois le lien prêt : ouvert après l'attente, le navigateur
   * le prendrait pour une fenêtre intempestive.
   */
  const openExternal = useCallback(
    async (engine: EngineId) => {
      if (!search) return;
      if (links) return void window.open(links.links[engine], "_blank", "noopener,noreferrer");
      const tab = window.open("about:blank", "_blank");
      try {
        const fresh = await callModule<ExternalLinks>("getLinks", search.id, window.location.origin);
        setLinks(fresh);
        if (tab) {
          tab.opener = null;
          tab.location.href = fresh.links[engine];
        }
      } catch (error) {
        tab?.close();
        toast.error(error instanceof Error ? error.message : "Lien indisponible.");
      }
    },
    [search, links]
  );

  const toggleEngine = (id: EngineId) => {
    const next = selected.has(id) ? prefs.engines.filter((entry) => entry !== id) : [...prefs.engines, id];
    updatePrefs({ engines: next });
  };

  // ─── Rendu ─────────────────────────────────────────────────────

  const ephemeralSwitch = (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
        prefs.ephemeral ? "border-primary/50 bg-primary/5 text-foreground" : "text-muted-foreground"
      )}
      title="Rien n’est enregistré : ni l’image, ni les résultats."
    >
      <Ghost className="h-4 w-4" />
      Éphémère
      <Switch checked={prefs.ephemeral} onCheckedChange={(checked) => updatePrefs({ ephemeral: checked })} aria-label="Recherche éphémère" />
    </label>
  );

  const best = search ? bestMatchOf(Object.fromEntries(Object.entries(results).filter(([, value]) => value !== "loading")) as SearchView["results"]) : undefined;
  const bestEngine = best ? engineInfo(best.engine) : undefined;
  const pending = Object.values(results).some((value) => value === "loading");

  return (
    <ModuleShell
      current=""
      actions={
        <>
          {ephemeralSwitch}
          {search && (
            <Button size="sm" className="gap-2" onClick={reset}>
              <Plus className="h-4 w-4" />
              Nouvelle recherche
            </Button>
          )}
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void startFromFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {!search ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4 sm:py-10">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={starting}
            className={cn(
              "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
            )}
          >
            {starting ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <ImagePlus className="h-10 w-10 text-muted-foreground" />}
            <span className="space-y-1">
              <span className="block text-lg font-semibold">{starting ? "Préparation de l’image…" : "Déposez une image pour retrouver son origine"}</span>
              <span className="block text-sm text-muted-foreground">
                Glissez-la ici, collez-la (Ctrl + V) ou cliquez pour la choisir. PNG, JPEG, WebP, GIF ou AVIF, 20 Mo au plus.
              </span>
            </span>
          </button>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (url.trim()) void start({ url: url.trim() }).then(() => setUrl(""));
            }}
          >
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="… ou collez l’adresse d’une image"
                className="h-10 pl-9"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10" disabled={!url.trim() || starting}>
              Rechercher
            </Button>
          </form>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Moteurs interrogés</h2>
              <p className="text-xs text-muted-foreground">Votre choix est retenu dans votre compte.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ENGINES.map((engine) => {
                const ready = inlineReady.has(engine.id);
                const linkOnly = engine.inline === "none";
                const active = selected.has(engine.id) && !linkOnly;
                return (
                  <button
                    key={engine.id}
                    type="button"
                    disabled={linkOnly}
                    aria-pressed={linkOnly ? undefined : active}
                    onClick={() => toggleEngine(engine.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      active ? "border-primary/60 bg-primary/5" : "hover:bg-muted/40",
                      linkOnly && "cursor-default hover:bg-transparent"
                    )}
                  >
                    <BrandLogo brand={engine.brand} className="mt-0.5 size-5 rounded-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {engine.name}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          {linkOnly ? "Onglet" : ready ? "Dans la page" : "Clé requise"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{engine.description}</span>
                    </span>
                    {!linkOnly && (
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                        )}
                      >
                        {active && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Les moteurs « Dans la page » répondent ici même. Les autres s’ouvrent dans un onglet depuis l’écran de
              résultats : l’image leur est alors transmise par un lien temporaire.
            </p>
          </section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ─── Image interrogée ─── */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
            <div className="overflow-hidden rounded-xl border bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local ou servi par le module */}
              <img src={search.preview} alt="" className="max-h-80 w-full object-contain" />
            </div>
            <div className="space-y-1">
              <p className="truncate text-sm font-medium" title={search.query.name}>
                {search.query.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {search.query.width} × {search.query.height} · {formatBytes(search.query.bytes)} · {ORIGIN_LABELS[search.query.origin]}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {search.ephemeral ? (
                  <>
                    <Ghost className="h-3.5 w-3.5" />
                    Recherche éphémère : rien n’est enregistré.
                  </>
                ) : (
                  <>
                    <History className="h-3.5 w-3.5" />
                    Enregistrée dans l’historique, {formatDate(search.createdAt)}.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ouvrir sur</h2>
              <div className="grid grid-cols-2 gap-1.5">
                {ENGINES.map((engine) => (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => void openExternal(engine.id)}
                    title={`Ouvrir sur ${engine.name}`}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <BrandLogo brand={engine.brand} className="size-4 rounded-sm" />
                    <span className="min-w-0 flex-1 truncate">{engine.name}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {links?.expiresAt
                  ? `L’image est lisible par ces sites grâce à un lien temporaire, jusqu’à ${new Date(links.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`
                  : links
                    ? "Ces sites lisent l’image par son adresse publique."
                    : "Ouvrir un de ces sites lui transmet l’image, par son adresse publique ou par un lien temporaire de trente minutes."}
              </p>
            </div>
          </aside>

          {/* ─── Résultats ─── */}
          <div className="flex min-w-0 flex-col gap-6">
            <AnimatePresence>
              {best && bestEngine && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Meilleure correspondance</p>
                    <p className="truncate text-base font-semibold">{best.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <BrandLogo brand={bestEngine.brand} className="size-4 rounded-sm" />
                    <span className="hidden text-muted-foreground sm:inline">{bestEngine.name}</span>
                    {formatSimilarity(best.similarity) && <span className="font-semibold tabular-nums">{formatSimilarity(best.similarity)}</span>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {ENGINES.filter((engine) => engine.inline !== "none" && (results[engine.id] || selected.has(engine.id))).map((engine) => (
              <EngineSection
                key={engine.id}
                engine={engine}
                result={results[engine.id]}
                showWeak={prefs.showWeak}
                onRetry={() => void run(search.id, engine.id)}
                onOpenExternal={() => void openExternal(engine.id)}
              />
            ))}

            {Object.keys(results).length === 0 && !pending && (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun moteur « dans la page » n’est sélectionné. Utilisez « Ouvrir sur » pour interroger un site directement.
              </p>
            )}

            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={prefs.showWeak} onCheckedChange={(checked) => updatePrefs({ showWeak: checked })} />
              Toujours afficher les résultats peu sûrs
            </label>
          </div>
        </div>
      )}

      {/* Dépôt sur toute la page, y compris par-dessus des résultats. */}
      {dragging && search && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/95 px-10 py-8 text-center shadow-lg">
            <Upload className="h-10 w-10 text-primary" />
            <p className="text-lg font-semibold">Déposez pour lancer une nouvelle recherche</p>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}
