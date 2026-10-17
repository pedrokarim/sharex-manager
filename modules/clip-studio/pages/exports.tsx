"use client";

/**
 * Exports de Clip Studio (dossier 01 ter, § 2 et § 3.2).
 *
 * - `/m/clip-studio/exports` : tous les exports, filtrés par projet, par
 *   état de publication et par marque ; chaque carte ouvre la fiche.
 * - `/m/clip-studio/exports?id=<id>` : la fiche d'un export. Lecteur et
 *   caractéristiques, projet d'origine, couverture, textes de publication
 *   (texte commun et variantes par service), crédits figés au rendu,
 *   publications retrouvées dans la file par la source, et les actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Copy,
  CopyX,
  Download,
  FileVideo,
  History,
  MoreHorizontal,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBytes } from "@/components/connections/shared";
import { formatSchedule } from "@/components/connections/date-time-picker";
import { useSession } from "@/lib/auth-client";
import type { PublishJobSummary } from "@/lib/connections/types";
import type { ClipExport } from "../engine/types";
import {
  callModule,
  defaultPostTexts,
  draftPostTexts,
  exportUrl,
  getExport,
  listExportPublications,
  updateExportPost,
  useBrandKits,
} from "../lib/client";
import { creditsText, emptyPost, mergeDraft, samePost, setPostField } from "../lib/export-screens";
import type { ExportDetails, ExportPost, PostTextField } from "../lib/post-types";
import { ExportCard, exportHref, publicationSummary, publishHref } from "../components/export-card";
import { ExportCover } from "../components/export-cover";
import { SendToGalleryButton } from "../components/gallery-button";
import { PostTextsEditor } from "../components/post-texts-editor";
import { JobTimeline, MOVING, formatDuration, jobsPending, serviceTargets, type PublishTargets } from "../components/publish-shared";
import { ScreenHeader } from "../components/screen-header";

export default function ExportsPage() {
  const params = useSearchParams();
  const id = params.get("id");
  return <MotionConfig reducedMotion="user">{id ? <ExportDetail key={id} id={id} /> : <ExportsList />}</MotionConfig>;
}

function useIsAdmin() {
  const { data: session } = useSession();
  return session?.user?.role === "admin";
}

/** Cibles de publication (services et comptes), lues une fois. */
function usePublishTargets(): PublishTargets | null | undefined {
  const [targets, setTargets] = useState<PublishTargets | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void callModule<PublishTargets>("listPublishTargets")
      .then((next) => alive && setTargets(next))
      .catch(() => alive && setTargets(null));
    return () => {
      alive = false;
    };
  }, []);
  return targets;
}

// ─── Liste ───────────────────────────────────────────────────────

type PublishedFilter = "all" | "published" | "unpublished";

/** Publications de chaque export, lues quatre à la fois. */
async function loadPublications(exports: ClipExport[]): Promise<Record<string, PublishJobSummary[]>> {
  const out: Record<string, PublishJobSummary[]> = {};
  const queue = [...exports];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        out[entry.id] = await listExportPublications(entry.id).catch(() => []);
      }
    })
  );
  return out;
}

function ExportsList() {
  const isAdmin = useIsAdmin();
  const kits = useBrandKits();
  const targets = usePublishTargets();
  const [exports, setExports] = useState<ClipExport[] | null>(null);
  const [publications, setPublications] = useState<Record<string, PublishJobSummary[]> | null>(null);
  const [project, setProject] = useState("all");
  const [brand, setBrand] = useState("all");
  const [published, setPublished] = useState<PublishedFilter>("all");

  const refresh = useCallback(async () => {
    const next = await callModule<ClipExport[]>("listExports").catch(() => [] as ClipExport[]);
    setExports(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAdmin || !exports) return;
    let alive = true;
    void loadPublications(exports).then((next) => alive && setPublications(next));
    return () => {
      alive = false;
    };
  }, [isAdmin, exports]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of exports ?? []) if (!map.has(entry.projectId)) map.set(entry.projectId, entry.projectName);
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [exports]);
  const brands = useMemo(() => (kits ?? []).filter((kit) => (exports ?? []).some((entry) => entry.brandKitId === kit.id)), [kits, exports]);

  const shown = (exports ?? []).filter((entry) => {
    if (project !== "all" && entry.projectId !== project) return false;
    if (brand !== "all" && (brand === "none" ? Boolean(entry.brandKitId) : entry.brandKitId !== brand)) return false;
    if (published !== "all" && publications) {
      const done = publicationSummary(publications[entry.id]).published.length > 0;
      if (published === "published" ? !done : done) return false;
    }
    return true;
  });
  const filtered = project !== "all" || brand !== "all" || published !== "all";

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6">
      <ScreenHeader
        back={{ href: "/m/clip-studio", label: "Projets" }}
        icon={FileVideo}
        title="Exports"
        description="Chaque clip rendu, avec sa couverture, ses textes de publication et l’endroit où il a été publié."
      />

      {/* Aucun export : les filtres n'ont rien à filtrer. */}
      {exports?.length === 0 ? null : (
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="grid min-w-0 flex-1 basis-56 gap-1.5 sm:flex-none">
            <Label htmlFor="exports-project">Projet</Label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger id="exports-project" className="w-full min-w-0 sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-[min(32rem,calc(100vw-2rem))]">
                <SelectItem value="all">Tous les projets</SelectItem>
                {projects.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="*:[span]:last:min-w-0">
                    <span className="truncate" title={item.name}>
                      {item.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {brands.length > 0 ? (
            <div className="grid min-w-0 flex-1 basis-48 gap-1.5 sm:flex-none">
              <Label htmlFor="exports-brand">Marque</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger id="exports-brand" className="w-full min-w-0 sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[min(32rem,calc(100vw-2rem))]">
                  <SelectItem value="all">Toutes les marques</SelectItem>
                  <SelectItem value="none">Sans marque</SelectItem>
                  {brands.map((kit) => (
                    <SelectItem key={kit.id} value={kit.id} className="*:[span]:last:min-w-0">
                      <span className="truncate" title={kit.name}>
                        {kit.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {isAdmin ? (
            <div className="grid min-w-0 gap-1.5">
              <Label id="exports-published">Publication</Label>
              <ToggleGroup type="single" variant="outline" aria-labelledby="exports-published" value={published} onValueChange={(value) => value && setPublished(value as PublishedFilter)} className="flex flex-wrap">
                <ToggleGroupItem value="all" className="px-3">
                  Tous
                </ToggleGroupItem>
                <ToggleGroupItem value="published" className="px-3" disabled={!publications}>
                  Publiés
                </ToggleGroupItem>
                <ToggleGroupItem value="unpublished" className="px-3" disabled={!publications}>
                  Non publiés
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}
          {isAdmin && !publications && exports && exports.length > 0 ? (
            <span className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" aria-hidden />
              Lecture des publications…
            </span>
          ) : null}
        </div>
      )}

      {exports === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileVideo />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "Aucun export ne correspond" : "Aucun export"}</EmptyTitle>
            <EmptyDescription>{filtered ? "Changez les filtres pour en voir d’autres." : "Ouvrez un projet puis « Exporter » : le clip rendu arrive ici."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setProject("all");
                  setBrand("all");
                  setPublished("all");
                }}
              >
                Retirer les filtres
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/m/clip-studio">Voir les projets</Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
          <AnimatePresence initial={false}>
            {shown.map((entry) => (
              <motion.div key={entry.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="min-w-0">
                <ExportCard entry={entry} jobs={publications?.[entry.id]} connectors={targets?.connectors} canPublish={isAdmin} onChanged={() => void refresh()} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Fiche ───────────────────────────────────────────────────────

const DETAIL_TABS = ["texts", "publications", "credits"] as const;

function ExportDetail({ id }: { id: string }) {
  const router = useRouter();
  // Onglet gardé dans l'adresse (?tab=) : un lien ou le bouton Retour rouvrent le même.
  const [detailTab, setDetailTab] = useQueryState("tab", parseAsStringLiteral(DETAIL_TABS).withDefault("texts").withOptions({ history: "push" }));
  const isAdmin = useIsAdmin();
  const targets = usePublishTargets();
  const [details, setDetails] = useState<ExportDetails | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    getExport(id)
      .then((next) => alive && setDetails(next))
      .catch((reason) => {
        if (!alive) return;
        setDetails(null);
        setError(reason instanceof Error ? reason.message : "Export introuvable");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // ─── Publications ──────────────────────────────────────────────
  const [jobs, setJobs] = useState<PublishJobSummary[] | null>(null);
  const loadJobs = useCallback(async () => {
    const next = await listExportPublications(id).catch(() => null);
    if (next) setJobs([...next].sort((a, b) => b.createdAt - a.createdAt));
    return next;
  }, [id]);
  useEffect(() => {
    if (isAdmin) void loadJobs();
  }, [isAdmin, loadJobs]);
  useEffect(() => {
    if (!jobs || !jobsPending(jobs)) return;
    const timer = setTimeout(() => void loadJobs(), jobs.some((job) => MOVING.has(job.state)) ? 2000 : 15000);
    return () => clearTimeout(timer);
  }, [jobs, loadJobs]);

  // ─── Textes ────────────────────────────────────────────────────
  const entry = details?.export ?? null;
  const [post, setPost] = useState<ExportPost | null>(null);
  const [saved, setSaved] = useState<ExportPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("base");
  useEffect(() => {
    if (!entry) return;
    let alive = true;
    // Un export d'avant les textes de publication part de ceux de la marque, comme sa publication.
    const initial = entry.post ? Promise.resolve(entry.post) : defaultPostTexts(entry.id).catch(() => emptyPost(0));
    void initial.then((value) => {
      if (!alive) return;
      setPost(value);
      setSaved(value);
    });
    return () => {
      alive = false;
    };
    // Une seule fois par export : les rechargements suivants ne doivent pas écraser une saisie en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);
  const dirty = Boolean(post && saved && !samePost(post, saved));

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const services = useMemo(() => (entry && targets ? serviceTargets(targets.connectors, entry, details?.hashtagRules ?? {}) : []), [entry, targets, details?.hashtagRules]);

  // Retours de l'onglet Textes : l'enregistrement répond dans sa barre, la
  // reprise de la marque au bout de la rangée de boutons.
  const saveFeedback = useFeedback();
  const toolbarFeedback = useFeedback();
  const creditsCopy = useCopyToClipboard();
  const editPost = (next: ExportPost) => {
    setPost(next);
    if (saveFeedback.state?.tone === "error") saveFeedback.clear();
  };

  const save = async () => {
    if (!post || !entry) return;
    setSaving(true);
    saveFeedback.clear();
    try {
      const next = await updateExportPost(entry.id, post, saved?.updatedAt || undefined);
      setPost(next);
      setSaved(next);
      saveFeedback.success("Textes enregistrés.");
    } catch (reason) {
      saveFeedback.error(errorMessage(reason, "Les textes n’ont pas pu être enregistrés. Réessayez."));
    } finally {
      setSaving(false);
    }
  };

  const [brandBusy, setBrandBusy] = useState(false);
  const fromBrand = async () => {
    if (!post || !entry) return;
    setBrandBusy(true);
    toolbarFeedback.clear();
    try {
      const previous = post;
      const next = await defaultPostTexts(entry.id);
      setPost({ ...next, updatedAt: post.updatedAt });
      // Le toast reste : il porte « Annuler », qui rend les textes d'avant.
      toast.success(details?.brand ? `Textes repris de la marque « ${details.brand.name} ».` : "Textes repris du projet.", {
        description: "Rien n’est enregistré tant que vous n’enregistrez pas.",
        action: { label: "Annuler", onClick: () => setPost(previous) },
      });
    } catch (reason) {
      toolbarFeedback.error(errorMessage(reason, "La marque n’a pas pu être relue. Réessayez dans un instant."));
    } finally {
      setBrandBusy(false);
    }
  };

  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const [draftOpen, setDraftOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const draft = async (field?: { connectorId: string | null; kind: PostTextField }) => {
    if (!entry) return;
    const key = field ? `${field.connectorId ?? "base"}.${field.kind}` : "all";
    setDrafting((current) => new Set([...current, key]));
    setDraftOpen(false);
    try {
      const result = await draftPostTexts(entry.id, {
        connectors: services.map((service) => service.connector.id),
        ...(field ? { fields: [field.kind] } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      });
      setPost((current) => {
        if (!current) return current;
        if (field?.connectorId) {
          // Un seul champ d'un service : sa variante proposée, sinon le texte commun proposé, devient la sienne.
          const value = result.post.variants[field.connectorId]?.[field.kind] ?? result.post.base[field.kind];
          const next = setPostField(current, field.connectorId, field.kind, value as never);
          const key = `${field.connectorId}.${field.kind}`;
          return { ...next, unreviewed: [...new Set([...(next.unreviewed ?? []), key])] };
        }
        const keys = field ? result.unreviewed.filter((entryKey) => entryKey === `base.${field.kind}`) : result.unreviewed;
        return mergeDraft(current, { base: result.post.base, variants: result.post.variants, unreviewed: keys }, keys);
      });
      // L'assistant rédige en fond (jusqu'à une minute) : sa fin se notifie, où que l'on soit.
      toast.success(field ? "Proposition prête, à relire." : "Propositions prêtes, à relire.", { description: "Rien n’est enregistré sans votre accord." });
    } catch (reason) {
      toast.error(errorMessage(reason, "L’assistant n’a pas pu rédiger. Réessayez dans un instant."));
    } finally {
      setDrafting((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Un échec reste dans la fenêtre de confirmation, qui ne se ferme qu'une fois l'export supprimé.
  const deleteFeedback = useFeedback();
  const remove = async () => {
    if (!entry) return;
    setDeleting(true);
    deleteFeedback.clear();
    try {
      await callModule("deleteExport", entry.id);
      // La fiche disparaît : le toast confirme sur la liste.
      toast.success("Export supprimé.");
      router.push("/m/clip-studio/exports");
    } catch (reason) {
      deleteFeedback.error(errorMessage(reason, "L’export n’a pas pu être supprimé. Réessayez."));
      setDeleting(false);
    }
  };

  if (details === undefined) return <DetailSkeleton />;
  if (!details || !entry) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileVideo />
          </EmptyMedia>
          <EmptyTitle>Export introuvable</EmptyTitle>
          <EmptyDescription>{error ?? "Il a peut-être été supprimé."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/m/clip-studio/exports">Tous les exports</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const url = exportUrl(entry.file);
  const ratio = entry.width && entry.height ? entry.width / entry.height : 16 / 9;
  const credits = entry.credits ?? [];
  const allDrafting = drafting.has("all");

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6">
      <ScreenHeader
        back={{ href: "/m/clip-studio/exports", label: "Tous les exports" }}
        icon={FileVideo}
        title={entry.projectName}
        fullTitle={entry.projectName}
        description={`Rendu le ${formatSchedule(entry.createdAt)}${details.brand ? ` · marque « ${details.brand.name} »` : ""}`}
        actions={
          <>
            {isAdmin ? (
              <Button asChild className="gap-2">
                <Link href={publishHref(entry.id)}>
                  <Send className="size-4" />
                  Publier
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="gap-2">
              <a href={url} download={`${entry.projectName}.mp4`}>
                <Download className="size-4" />
                Télécharger
              </a>
            </Button>
            <SendToGalleryButton entry={entry} onSent={(fileName) => setDetails((current) => (current ? { ...current, export: { ...current.export, galleryFile: fileName } } : current))} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Autres actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {details.project.exists ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`}>
                      <Clapperboard className="mr-2 size-4" />
                      Ouvrir le projet
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-2 size-4" />
                  Supprimer l’export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <aside className="grid min-w-0 content-start gap-6 lg:sticky lg:top-0 lg:self-start" aria-label="Le fichier rendu">
          <div className="flex min-w-0 justify-center rounded-lg bg-muted/40 p-2">
            <video
              ref={videoRef}
              src={url}
              controls
              playsInline
              preload="metadata"
              style={{ aspectRatio: `${ratio}`, ["--ratio" as string]: ratio }}
              className="block w-[min(100%,calc(40vh*var(--ratio)))] max-w-full rounded-md bg-black object-contain lg:w-[min(100%,calc(56vh*var(--ratio)))]"
            />
          </div>

          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Format</dt>
            <dd className="min-w-0 tabular-nums">
              MP4 · {entry.width} × {entry.height}
            </dd>
            <dt className="text-muted-foreground">Durée</dt>
            <dd className="tabular-nums">{formatDuration(entry.durationMs)}</dd>
            <dt className="text-muted-foreground">Poids</dt>
            <dd className="tabular-nums">{formatBytes(entry.sizeBytes)}</dd>
            <dt className="text-muted-foreground">Volume</dt>
            <dd className="min-w-0 tabular-nums">
              {entry.loudness ? `${entry.loudness.lufs.toLocaleString("fr-FR")} LUFS, crête ${entry.loudness.peakDb.toLocaleString("fr-FR")} dB` : "non mesuré"}
            </dd>
            <dt className="text-muted-foreground">Sous-titres</dt>
            <dd className="min-w-0">
              {entry.subtitles ? (
                <a href={exportUrl(entry.subtitles.file)} download className="underline underline-offset-2">
                  Fichier .srt ({entry.subtitles.language})
                </a>
              ) : (
                "aucun"
              )}
            </dd>
          </dl>

          <OriginProject details={details} />

          <Separator />

          <ExportCover entry={entry} video={() => videoRef.current} onChanged={(next) => setDetails((current) => (current ? { ...current, export: next } : current))} />
        </aside>

        <Tabs value={detailTab} onValueChange={(next) => void setDetailTab(next === "texts" ? null : (next as (typeof DETAIL_TABS)[number]))} className="min-w-0 gap-4">
          {/* Onglets sur plusieurs lignes : hauteur fixe, sinon la hauteur en pourcentage des onglets s'étire et ils passent sur les champs. */}
          <TabsList className="h-auto w-full min-w-0 flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
            <TabsTrigger value="texts" className="flex-none px-3">
              Textes
            </TabsTrigger>
            <TabsTrigger value="publications" className="flex-none px-3">
              Publications{jobs && jobs.length > 0 ? ` (${jobs.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex-none px-3">
              Crédits{credits.length > 0 ? ` (${credits.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="texts" className="grid min-w-0 content-start gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void fromBrand()} loading={brandBusy} disabled={saving}>
                <History className="size-4" />
                Reprendre la marque
              </Button>
              <Popover open={draftOpen} onOpenChange={setDraftOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" loading={allDrafting} disabled={saving}>
                    <Wand2 className="size-4" />
                    {allDrafting ? "Rédaction…" : "Rédiger avec l’assistant"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="grid w-[min(22rem,calc(100vw-2rem))] gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-instructions">Consigne (facultative)</Label>
                    <Textarea id="draft-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} maxLength={1000} placeholder="Plus court, tutoie, insiste sur…" className="[overflow-wrap:anywhere]" />
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground">
                    Tout le jeu est proposé d’un coup, avec une variante courte pour chaque service dont les limites l’exigent. Les propositions arrivent marquées «&nbsp;à relire&nbsp;».
                  </p>
                  <Button size="sm" className="gap-2" onClick={() => void draft()}>
                    <Sparkles className="size-4" />
                    Rédiger
                  </Button>
                </PopoverContent>
              </Popover>
              <ActionStatus state={toolbarFeedback.state} className="max-w-full" />
            </div>

            {post ? (
              <PostTextsEditor
                post={post}
                onChange={editPost}
                services={services}
                showBase
                tab={tab}
                onTabChange={setTab}
                regenerating={drafting}
                onRegenerate={(connectorId, kind) => void draft({ connectorId, kind })}
                disabled={saving || allDrafting}
                idPrefix={`export-${entry.id}`}
              />
            ) : null}

            <AnimatePresence initial={false}>
              {/* La barre reste le temps de dire « Textes enregistrés », puis s'en va. */}
              {dirty || saveFeedback.state?.tone === "success" ? (
                <motion.div
                  key="save"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur"
                >
                  <div className="min-w-0 basis-full empty:hidden">
                    <FormStatus state={saveFeedback.state?.tone === "error" ? saveFeedback.state : null} />
                  </div>
                  {dirty ? (
                    <>
                      <p className="text-sm text-muted-foreground">Modifications non enregistrées</p>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            saveFeedback.clear();
                            setPost(saved);
                          }}
                          disabled={saving}
                        >
                          <Undo2 className="size-4" />
                          Annuler
                        </Button>
                        <Button size="sm" className="gap-1.5" onClick={() => void save()} loading={saving}>
                          Enregistrer
                        </Button>
                      </div>
                    </>
                  ) : (
                    <ActionStatus state={saveFeedback.state} className="text-sm" />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="publications" className="grid min-w-0 content-start gap-4">
            {!isAdmin ? (
              <p className="text-sm text-muted-foreground">Les publications sont réservées aux administrateurs.</p>
            ) : jobs === null ? (
              <div className="grid gap-3" aria-busy>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : jobs.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Send />
                  </EmptyMedia>
                  <EmptyTitle>Pas encore publié</EmptyTitle>
                  <EmptyDescription>Chaque envoi de cet export apparaîtra ici, compte par compte, avec son état et son lien.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild className="gap-2">
                    <Link href={publishHref(entry.id)}>
                      <Send className="size-4" />
                      Publier
                    </Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {jobs.length > 1 ? `${jobs.length} envois` : "1 envoi"}, les plus récents d’abord.
                  </p>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void loadJobs()}>
                    <RefreshCw className="size-3.5" />
                    Actualiser
                  </Button>
                </div>
                <JobTimeline jobs={jobs} accounts={targets?.accounts ?? []} connectors={targets?.connectors ?? []} onChanged={() => void loadJobs()} authorizeReturn={exportHref(entry.id)} showDate />
              </>
            )}
          </TabsContent>

          <TabsContent value="credits" className="grid min-w-0 content-start gap-3">
            {credits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune mention relevée au rendu : le clip n’utilise que vos médias.</p>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-pretty text-muted-foreground">Relevés dans le projet au moment du rendu.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void creditsCopy.copyToClipboard(creditsText(credits))}
                    aria-live="polite"
                  >
                    {creditsCopy.hasCopied ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : creditsCopy.copyFailed ? (
                      <CopyX className="size-3.5 text-destructive" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {creditsCopy.hasCopied ? "Copié" : creditsCopy.copyFailed ? "Copie impossible" : "Copier"}
                  </Button>
                </div>
                <ul className="grid min-w-0 gap-1.5 text-sm">
                  {credits.map((credit) => (
                    <li key={credit} className="min-w-0 [overflow-wrap:anywhere]">
                      {credit}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (deleting) return;
          if (open) deleteFeedback.clear();
          setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet export ?</AlertDialogTitle>
            <AlertDialogDescription>
              La vidéo, sa couverture, ses sous-titres et ses textes disparaissent. Les publications déjà faites restent en ligne chez chaque service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormStatus state={deleteFeedback.state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // La fenêtre reste ouverte jusqu'à la fin : un échec s'y affiche.
                event.preventDefault();
                void remove();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Projet d'origine : lien, et « le projet a changé depuis » avec « Exporter à nouveau ». */
function OriginProject({ details }: { details: ExportDetails }) {
  const entry = details.export;
  if (!details.project.exists) {
    return <p className="text-sm text-muted-foreground">Le projet d’origine a été supprimé.</p>;
  }
  const name = details.project.name ?? entry.projectName;
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        <Clapperboard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="shrink-0 text-muted-foreground">Projet</span>
        <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline" title={name}>
          {name}
        </Link>
      </p>
      {details.projectChanged ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
          <span>Le projet a changé depuis cet export.</span>
          <Link href={`/m/clip-studio/export?project=${encodeURIComponent(entry.projectId)}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
            Exporter à nouveau
            <ArrowRight className="size-3" />
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6" aria-busy>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
