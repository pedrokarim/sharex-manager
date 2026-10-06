"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../lib/client";
import { chapterHref, chapterLabel, countLabel, errorMessage, type LinkImportReport } from "../../lib/library-helpers";
import type { LinkImportState, LinkPreview, SourceStatus } from "../../lib/types";
import { LinkPreviewSkeleton, LinkPreviewSummary, SourceErrorNotice } from "./link-preview";
import { SourceName } from "./source-logo";

interface LinkImportPanelProps {
  /**
   * Le chapitre qui reçoit les pages. Absent : le chapitre est rangé tout seul
   * dans le dossier de sa série, créés l'un et l'autre s'ils n'existent pas.
   */
  chapter?: { id: string; number: string; title?: string };
  /** Lien à lire dès l'ouverture, par exemple celui qu'on vient de tester. */
  initialLink?: string;
  /** Des pages ont été ajoutées, ou le chapitre a changé : la planche doit se rafraîchir. */
  onChanged?: () => void;
}

type Phase = "link" | "running" | "done";
type Lookup = { state: "idle" } | { state: "loading" } | { state: "ready"; preview: LinkPreview } | { state: "error"; message: string };

/** Attente après la dernière frappe avant de lire le lien : une lecture, jamais une par touche. */
const TYPING_DELAY_MS = 700;
/** Rythme calme du suivi d'un import. */
const POLL_INTERVAL_MS = 1500;
/** Suivis perdus de suite avant de cesser de demander. */
const MAX_POLL_FAILURES = 4;

const ACTIVE_STATES: LinkImportState[] = ["queued", "resolving", "downloading", "importing"];
const isActive = (job: LinkImportReport) => ACTIVE_STATES.includes(job.state);

/** Ce texte ressemble assez à un lien pour mériter une requête. */
const looksLikeLink = (text: string) => /^https?:\/\/[^\s/]+\.[^\s/]+\/\S+$/i.test(text);

/** Import en cours par chapitre : quitter la page puis y revenir retrouve son suivi. */
const runningJobs = new Map<string, string>();
/** Sites gérés, gardés entre deux ouvertures. */
let sourcesSnapshot: SourceStatus[] | null = null;

function stepLabel(job: LinkImportReport): string {
  if (job.state === "queued") return "En attente…";
  if (job.state === "resolving") return "Lecture du lien chez le site…";
  if (job.state === "importing") return "Rangement des pages dans le chapitre…";
  return `Page ${Math.min(job.done + 1, job.total)} sur ${job.total}`;
}

/**
 * Récupérer un chapitre par son lien : on colle le lien, le site est reconnu
 * et dit ce que le lien désigne, on confirme, puis les pages arrivent une à
 * une. Rien n'est téléchargé avant le clic sur « Récupérer ».
 *
 * C'est une section de la page « Import par lien », pas une fenêtre : il n'y
 * a qu'un endroit où l'on importe par lien.
 */
export function LinkImportPanel({ chapter, initialLink, onChanged }: LinkImportPanelProps) {
  /** La section est toujours là : ce qui valait « à l'ouverture » vaut à l'arrivée sur la page. */
  const open = true;
  /** Sous quelle clé retrouver un import en cours : le chapitre, ou la bibliothèque entière. */
  const jobKey = chapter?.id ?? "library";
  const [phase, setPhase] = useState<Phase>("link");
  const [link, setLink] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [sources, setSources] = useState<SourceStatus[] | null>(sourcesSnapshot);
  const [job, setJob] = useState<LinkImportReport | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [lostTrack, setLostTrack] = useState(false);
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);

  /** Aperçus déjà lus : recoller le même lien ne redemande rien au site. */
  const previews = useRef(new Map<string, Lookup>());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Le lien dont on attend l'aperçu : une réponse arrivée trop tard est ignorée. */
  const wanted = useRef("");
  const busy = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  // ─── Suivi d'un import ─────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const settle = useCallback(
    (finished: LinkImportReport) => {
      runningJobs.delete(jobKey);
      setJob(finished);
      setPhase("done");
      if (finished.state === "done") onChangedRef.current?.();
    },
    [jobKey]
  );

  const follow = useCallback(
    (jobId: string, immediately = false) => {
      stopPolling();
      let failures = 0;
      const tick = async () => {
        try {
          const next = await api.getLinkImport(jobId);
          failures = 0;
          if (!isActive(next)) {
            settle(next);
            return;
          }
          setJob(next);
        } catch (error) {
          failures++;
          if (failures >= MAX_POLL_FAILURES) {
            // L'import continue peut-être sur le serveur : on cesse seulement de demander.
            runningJobs.delete(jobKey);
            setLostTrack(true);
            setPhase("done");
            toast.error(errorMessage(error, "Le suivi de l’import ne répond plus."));
            return;
          }
        }
        pollTimer.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      };
      pollTimer.current = setTimeout(() => void tick(), immediately ? 0 : POLL_INTERVAL_MS);
    },
    [jobKey, settle, stopPolling]
  );

  // Ouverture : on repart de zéro, sauf si un import de ce chapitre tourne encore.
  useEffect(() => {
    if (!open) return;
    setLink("");
    setLookup({ state: "idle" });
    setStartError(null);
    setCancelling(false);
    setLostTrack(false);
    setFilling(false);
    setFilled(false);
    wanted.current = "";

    const running = runningJobs.get(jobKey);
    if (running) {
      setPhase("running");
      // Retour sur un import déjà lancé : son état est demandé tout de suite.
      follow(running, true);
    } else {
      setJob(null);
      setPhase("link");
    }

    // Les sites gérés, avec leur icône : lus sur ce serveur.
    let cancelled = false;
    api
      .listSources()
      .then((next) => {
        sourcesSnapshot = next;
        if (!cancelled) setSources(next);
      })
      .catch((error) => toast.error(errorMessage(error, "Liste des sources indisponible.")));
    return () => {
      cancelled = true;
      stopPolling();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [open, jobKey, follow, stopPolling]);

  // ─── Reconnaissance du lien ────────────────────────────────────

  const read = useCallback(async (url: string) => {
    wanted.current = url;
    const known = previews.current.get(url);
    if (known) {
      setLookup(known);
      return;
    }
    // Une lecture à la fois : si une autre est en cours, celle-ci attendra la prochaine frappe.
    if (busy.current) return;
    busy.current = true;
    setLookup({ state: "loading" });
    let outcome: Lookup;
    try {
      outcome = { state: "ready", preview: await api.previewLink(url) };
    } catch (error) {
      outcome = { state: "error", message: errorMessage(error, "Ce lien n’a pas pu être lu.") };
    }
    busy.current = false;
    // Une erreur n'est pas gardée : le site peut répondre la fois suivante.
    if (outcome.state === "ready") previews.current.set(url, outcome);
    if (wanted.current === url) setLookup(outcome);
    else if (looksLikeLink(wanted.current)) void read(wanted.current);
  }, []);

  /** `delay` vaut zéro pour un collage : le lien est complet, inutile d'attendre. */
  const changeLink = (value: string, delay: number) => {
    setLink(value);
    setStartError(null);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    const url = value.trim();
    wanted.current = url;
    if (!looksLikeLink(url)) {
      setLookup({ state: "idle" });
      return;
    }
    const known = previews.current.get(url);
    if (known) {
      setLookup(known);
      return;
    }
    setLookup({ state: "loading" });
    typingTimer.current = setTimeout(() => void read(url), delay);
  };

  // Ouvert avec un lien (celui qu'on vient de tester) : il est lu aussitôt, une fois.
  const openedWith = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      openedWith.current = null;
      return;
    }
    const url = initialLink?.trim();
    if (!url || openedWith.current === url || runningJobs.has(jobKey)) return;
    openedWith.current = url;
    changeLink(url, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à l'ouverture seulement
  }, [open, initialLink, jobKey]);

  // ─── Import ────────────────────────────────────────────────────

  const start = async () => {
    const url = link.trim();
    if (lookup.state !== "ready" || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      // Avec un chapitre, les pages s'y ajoutent ; sans, le serveur range le chapitre
      // dans le dossier de sa série, en les créant au besoin.
      const created = chapter ? await api.importFromLink(chapter.id, url) : await api.importLinkToLibrary(url);
      runningJobs.set(jobKey, created.id);
      // L'aperçu est déjà là : il tient lieu de celui du travail tant que le serveur ne l'a pas rendu.
      setJob({ ...created, preview: (created as LinkImportReport).preview ?? lookup.preview });
      setPhase("running");
      follow(created.id);
    } catch (error) {
      setStartError(errorMessage(error, "L’import n’a pas pu être lancé."));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job || cancelling) return;
    setCancelling(true);
    try {
      const next = await api.cancelLinkImport(job.id);
      if (!isActive(next)) {
        stopPolling();
        settle(next);
      }
    } catch (error) {
      toast.error(errorMessage(error, "L’annulation n’a pas abouti."));
    } finally {
      setCancelling(false);
    }
  };

  // Ce que le site dit du chapitre n'est repris que d'un geste.
  const preview = job?.preview ?? (lookup.state === "ready" ? lookup.preview : undefined);
  const offeredTitle = chapter && !chapter.title && preview?.chapterTitle ? preview.chapterTitle : undefined;
  const offeredNumber = chapter && chapter.number.trim() === "" && preview?.chapterNumber ? preview.chapterNumber : undefined;

  const fill = async () => {
    if (!chapter || filling || (!offeredTitle && !offeredNumber)) return;
    setFilling(true);
    try {
      await api.updateChapter(chapter.id, { ...(offeredTitle ? { title: offeredTitle } : {}), ...(offeredNumber ? { number: offeredNumber } : {}) });
      setFilled(true);
      toast.success("Chapitre complété d’après le site");
      onChangedRef.current?.();
    } catch (error) {
      toast.error(errorMessage(error, "Le chapitre n’a pas pu être complété."));
    } finally {
      setFilling(false);
    }
  };

  const enabledSources = (sources ?? []).filter((source) => source.enabled);
  const typed = link.trim();
  const ratio = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  /** Repart d'un champ vide, pour récupérer un autre chapitre. */
  const restart = () => {
    stopPolling();
    setJob(null);
    setLink("");
    setLookup({ state: "idle" });
    setStartError(null);
    setLostTrack(false);
    setFilled(false);
    wanted.current = "";
    setPhase("link");
  };

  return (
    <Card role="region" aria-labelledby="scan-studio-link-import-title">
        <CardHeader>
          <CardTitle>
            <h2 id="scan-studio-link-import-title">Récupérer un chapitre</h2>
          </CardTitle>
          <CardDescription>
            {phase === "link"
              ? chapter
                ? `Collez le lien d’un chapitre : ses pages s’ajouteront à la suite de « ${chapterLabel(chapter)} ». Rien n’est téléchargé avant votre confirmation.`
                : "Collez le lien d’un chapitre : il sera rangé dans le dossier de sa série, créé s’il n’existe pas encore. Rien n’est téléchargé avant votre confirmation."
              : phase === "running"
                ? "Les pages arrivent l’une après l’autre, sans presser le site."
                : "La récupération est terminée."}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">

        {phase === "link" && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="scan-studio-link-import">Lien du chapitre</Label>
              <InputGroup>
                <InputGroupAddon>
                  <Link2 aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  id="scan-studio-link-import"
                  type="url"
                inputMode="url"
                value={link}
                onChange={(event) => changeLink(event.target.value, TYPING_DELAY_MS)}
                onPaste={(event) => {
                  // Le collage remplace tout le champ : le lien est lu aussitôt, une fois.
                  const pasted = event.clipboardData.getData("text").trim();
                  if (!looksLikeLink(pasted)) return;
                  event.preventDefault();
                  changeLink(pasted, 0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && lookup.state === "ready") void start();
                }}
                placeholder={enabledSources[0]?.example ?? "https://…"}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
                />
              </InputGroup>
            </div>

            <div className="empty:hidden" aria-live="polite">
              {lookup.state === "loading" ? (
                <LinkPreviewSkeleton />
              ) : lookup.state === "ready" ? (
                <LinkPreviewSummary preview={lookup.preview} />
              ) : lookup.state === "error" ? (
                <SourceErrorNotice message={lookup.message} />
              ) : typed !== "" ? (
                <p className="text-sm text-muted-foreground">Collez l’adresse complète du chapitre, celle qui commence par « https:// ».</p>
              ) : null}
            </div>

            {startError && <SourceErrorNotice message={startError} />}
          </div>
        )}

        {phase === "running" && !job && (
          <div className="grid gap-3" aria-busy="true" aria-label="Reprise du suivi de l’import">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        )}

        {phase === "running" && job && (
          <div className="grid gap-3">
            {preview && (
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                <SourceName source={preview.source} />
                <span className="min-w-0 break-words text-muted-foreground">
                  {[preview.series, preview.chapterNumber ? `chapitre ${preview.chapterNumber}` : null].filter(Boolean).join(", ")}
                </span>
              </p>
            )}
            <div className="flex items-center gap-3">
              <p className="shrink-0 text-sm font-medium tabular-nums" aria-live="polite">
                {cancelling ? "Annulation…" : stepLabel(job)}
              </p>
              <Progress value={ratio} aria-label="Avancement de l’import" className="h-1.5" />
            </div>
            <p className="text-xs text-muted-foreground">
              Une page à la fois, avec une pause entre deux : un long chapitre prend une minute ou deux. Annuler efface ce qui a déjà été téléchargé.
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="grid gap-3 text-sm" aria-live="polite">
            {lostTrack ? (
              <SourceErrorNotice message="Le suivi de l’import ne répond plus. L’import a pu se terminer sur le serveur : fermez cette fenêtre et actualisez le chapitre." />
            ) : job?.state === "done" ? (
              <>
                <p className="flex items-start gap-2 font-medium">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{countLabel(job.imported ?? job.total, "page ajoutée au chapitre", "pages ajoutées au chapitre")}, dans l’ordre du site.</span>
                </p>
                {!chapter && preview && (
                  <p className="break-words text-muted-foreground">
                    Rangé dans « {preview.series ?? `Imports ${preview.source.name}`} »
                    {preview.chapterNumber ? `, chapitre ${preview.chapterNumber}` : ""}
                    {job.created?.folder ? " (dossier créé)." : job.created?.chapter ? " (chapitre créé)." : "."}
                  </p>
                )}
                {preview && (
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
                    Source : <SourceName source={preview.source} className="text-foreground" />
                    {preview.credit && <span>· traduction créditée à {preview.credit}</span>}
                  </p>
                )}
                {(offeredTitle || offeredNumber) && !filled && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="min-w-0 flex-1 break-words">
                      Le site donne à ce chapitre {offeredNumber ? `le numéro ${offeredNumber}` : ""}
                      {offeredNumber && offeredTitle ? " et " : ""}
                      {offeredTitle ? `le titre « ${offeredTitle} »` : ""}. Le vôtre n’en a pas encore.
                    </p>
                    <Button type="button" variant="outline" size="sm" className="gap-2" disabled={filling} onClick={() => void fill()}>
                      {filling && <Loader2 className="h-4 w-4 animate-spin" />}
                      {offeredTitle && offeredNumber ? "Reprendre le numéro et le titre" : offeredTitle ? "Reprendre ce titre" : "Reprendre ce numéro"}
                    </Button>
                  </div>
                )}
              </>
            ) : job?.state === "cancelled" ? (
              <p>Import annulé. Rien n’a été ajouté au chapitre, et les pages déjà téléchargées ont été effacées.</p>
            ) : job?.error ? (
              <>
                <SourceErrorNotice kind={job.error.kind} message={job.error.message} />
                <p className="text-muted-foreground">
                  Rien n’a été ajouté au chapitre{job.done > 0 ? ", et ce qui avait déjà été téléchargé a été effacé" : ""}.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">L’import s’est arrêté sans explication. Actualisez le chapitre pour voir où il en est.</p>
            )}
          </div>
        )}

        </CardContent>

        <CardFooter className="flex-wrap gap-2 border-t">
          {phase === "link" && (
            <Button type="button" className="gap-2" disabled={lookup.state !== "ready" || starting} onClick={() => void start()}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {lookup.state === "ready" ? `Récupérer ${countLabel(lookup.preview.pageCount, "page", "pages")}` : "Récupérer"}
            </Button>
          )}
          {phase === "running" && (
            <Button type="button" variant="outline" disabled={cancelling || job?.state === "importing"} onClick={() => void cancel()}>
              {cancelling ? "Annulation…" : "Annuler l’import"}
            </Button>
          )}
          {phase === "done" && !chapter && job?.state === "done" && (
            <Button asChild type="button">
              <Link href={chapterHref(job.chapterId)}>Ouvrir le chapitre</Link>
            </Button>
          )}
          {phase === "done" && chapter && job?.state === "done" && (
            <Button asChild type="button">
              <Link href={chapterHref(chapter.id)}>Retour au chapitre</Link>
            </Button>
          )}
          {phase === "done" && (
            <Button type="button" variant="outline" onClick={restart}>
              Récupérer un autre lien
            </Button>
          )}
        </CardFooter>
    </Card>
  );
}
