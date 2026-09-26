"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ImageDown,
  Images,
  LayoutGrid,
  MessagesSquare,
  Rows3,
  Settings2,
} from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ModuleConfig } from "@/types/modules";
import { ModuleShell } from "../components/module-shell";
import { ImageViewer, type Shot } from "../components/image-viewer";
import { JobQueue } from "../components/job-queue";
import { StudioFeed, type FeedView } from "../components/studio-feed";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ImagePicker,
  type PickedImage,
  type PickerSource,
} from "../components/image-picker";
import {
  MAX_REFERENCES,
  PromptDock,
  emptyComposerState,
  type ComposerReference,
  type ComposerState,
} from "../components/prompt-dock";
import {
  callModule,
  fileToReference,
  isJobActive,
  sameOriginImageToBase64,
  useStudioState,
  type Catalogue,
  type Collection,
  type HistoryItem,
  type Job,
  type Pipeline,
} from "../lib/client";
import { useImageIntake } from "../lib/use-image-intake";

interface GeneratePageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

/** Amorces proposées quand le studio est vide. */
const STARTERS = [
  {
    title: "Phare au crépuscule",
    prompt:
      "un phare isolé sur un rocher au crépuscule, mer d'huile, lumière rasante dorée, brume légère, photographie argentique",
  },
  {
    title: "Ruelle néon",
    prompt:
      "ruelle de Tokyo sous la pluie la nuit, enseignes néon qui se reflètent sur les pavés mouillés, cinématique, 35 mm",
  },
  {
    title: "Serre abandonnée",
    prompt:
      "serre victorienne abandonnée envahie par la végétation, rayons de soleil à travers les vitres brisées, illustration aquarelle",
  },
  {
    title: "Mascotte 3D",
    prompt:
      "petite mascotte renard en pâte à modeler, rendu 3D doux, fond pastel uni, éclairage studio, style Pixar",
  },
] as const;

/** Brouillon du compositeur (prompt, réglages, images jointes) entre deux visites. */
let draftSnapshot: ComposerState | null = null;

/** Données de référence gardées entre deux visites, rafraîchies à chaque retour. */
let referenceSnapshot: {
  catalogue: Catalogue;
  collections: Collection[];
  pipelines: Pipeline[];
} | null = null;

export default function GeneratePage({ settings }: GeneratePageProps) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(
    () => referenceSnapshot?.catalogue ?? null
  );
  const [collections, setCollections] = useState<Collection[]>(
    () => referenceSnapshot?.collections ?? []
  );
  const [pipelines, setPipelines] = useState<Pipeline[]>(
    () => referenceSnapshot?.pipelines ?? []
  );
  const [state, setState] = useState<ComposerState>(
    () => draftSnapshot ?? emptyComposerState(settings, "codex/gpt-image-2")
  );

  // Le brouillon survit à un passage par la bibliothèque ou les réglages.
  useEffect(() => {
    draftSnapshot = state;
  }, [state]);
  const [submitting, setSubmitting] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerShots, setViewerShots] = useState<Shot[]>([]);
  const [picker, setPicker] = useState<{ open: boolean; source: PickerSource }>({
    open: false,
    source: "uploads",
  });
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useFeedView();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fichiers envoyés depuis la galerie (« Retoucher dans le studio »,
  // « S'en inspirer ») : lus une fois à l'arrivée, puis retirés de l'adresse
  // pour qu'un rechargement ne les joigne pas une seconde fois.
  const [incoming, setIncoming] = useState<{
    files: string[];
    role: ComposerReference["role"];
  } | null>(() => {
    const files = searchParams.get("files");
    if (!files) return null;
    return {
      files: files.split(",").map((name) => name.trim()).filter(Boolean).slice(0, MAX_REFERENCES),
      role: searchParams.get("role") === "edit-target" ? "edit-target" : "reference",
    };
  });

  useEffect(() => {
    if (searchParams.get("files")) {
      router.replace("/m/ai-image-gen", { scroll: false });
    }
  }, [searchParams, router]);

  const { jobs, history, ready, refresh } = useStudioState(60);

  const patch = useCallback(
    (next: Partial<ComposerState>) => setState((prev) => ({ ...prev, ...next })),
    []
  );

  useEffect(() => {
    Promise.all([
      callModule<Catalogue>("getCatalogue"),
      callModule<Collection[]>("listCollections"),
      callModule<Pipeline[]>("listPipelines"),
    ])
      .then(([cat, cols, pipes]) => {
        referenceSnapshot = { catalogue: cat, collections: cols, pipelines: pipes };
        setCatalogue(cat);
        setCollections(cols);
        setPipelines(pipes);
        // Le modèle par défaut peut ne plus être disponible (clé retirée, CLI
        // désinstallé). Basculer sur le premier utilisable évite un bouton
        // « Générer » définitivement grisé sans explication.
        setState((prev) => {
          const current = cat.models.find((model) => model.id === prev.model);
          if (current?.available) return prev;
          const fallback = cat.models.find((model) => model.available);
          return fallback ? { ...prev, model: fallback.id } : prev;
        });
      })
      .catch(() => setCatalogue({ models: [], cli: [], apiEngines: [] }));
  }, []);

  const collectionsById = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections]
  );

  const model = catalogue?.models.find((entry) => entry.id === state.model);
  const anyAvailable = (catalogue?.models ?? []).some((entry) => entry.available);
  const activeJobs = jobs.filter(isJobActive);
  const freeSlots = MAX_REFERENCES - state.references.length;

  // ─── Images de départ ───────────────────────────────────────

  const attach = useCallback(
    (images: PickedImage[], role: ComposerReference["role"] = "reference") => {
      setState((prev) => {
        // Une image en retouche fixe le rôle du lot : on aligne les nouvelles
        // venues sur les images déjà présentes.
        const inherited = prev.references[0]?.role ?? role;
        return {
          ...prev,
          references: [
            ...prev.references,
            ...images.map((image) => ({
              ...image,
              id: crypto.randomUUID(),
              role: inherited,
            })),
          ].slice(0, MAX_REFERENCES),
        };
      });
      toast.success(
        images.length > 1 ? `${images.length} images jointes` : "Image jointe"
      );
      promptRef.current?.focus();
    },
    []
  );

  const intake = useImageIntake({
    enabled: Boolean(model?.supportsReference),
    capacity: freeSlots,
    onImages: attach,
    disabledReason: model
      ? `${model.label} ne prend pas d'image de départ`
      : undefined,
    paused: picker.open,
  });

  // Jonction des fichiers reçus, une fois le catalogue connu : il faut un
  // moteur qui accepte une image de départ.
  useEffect(() => {
    if (!incoming || !catalogue) return;
    const request = incoming;
    setIncoming(null);

    const current = catalogue.models.find((entry) => entry.id === state.model);
    if (!current?.supportsReference) {
      const fallback = catalogue.models.find(
        (entry) => entry.available && entry.supportsReference
      );
      if (!fallback) {
        toast.error("Aucun moteur disponible ne prend d'image de départ");
        return;
      }
      patch({ model: fallback.id });
      toast.info(`Moteur ${fallback.label} choisi : il accepte une image de départ`);
    }

    Promise.all(
      request.files.map(async (name) => ({
        ...(await sameOriginImageToBase64(`/api/files/${encodeURIComponent(name)}`)),
        name,
      }))
    )
      .then((images) => {
        setState((prev) => ({
          ...prev,
          // Une retouche repart de cette image seule ; une inspiration
          // s'ajoute à ce qui est déjà joint.
          references: [
            ...(request.role === "edit-target" ? [] : prev.references),
            ...images.map((image) => ({
              ...image,
              id: crypto.randomUUID(),
              role: request.role,
            })),
          ].slice(0, MAX_REFERENCES),
        }));
        toast.success(
          request.role === "edit-target"
            ? "Image prête à être retouchée : décrivez ce qui doit changer"
            : images.length > 1
              ? `${images.length} images jointes comme inspiration`
              : "Image jointe comme inspiration"
        );
        promptRef.current?.focus();
      })
      .catch((error) => toast.error(error?.message ?? "Import des fichiers impossible"));
    // Seule l'arrivée de fichiers déclenche la jonction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, catalogue]);

  const openPicker = useCallback(
    (source: PickerSource) => setPicker({ open: true, source }),
    []
  );

  // ─── Actions ────────────────────────────────────────────────

  const submit = useCallback(async () => {
    if (!state.prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      await callModule("enqueueGeneration", {
        prompt: state.prompt,
        negativePrompt: state.negativePrompt || undefined,
        notes: state.notes || undefined,
        model: state.model,
        size: state.size,
        quality: state.quality,
        n: state.count,
        seed: state.seed ? Number(state.seed) : undefined,
        collectionId: state.collectionId || undefined,
        pipelineId: state.pipelineId || undefined,
        references: state.references.map((reference) => ({
          b64: reference.b64,
          mimeType: reference.mimeType,
          role: reference.role,
        })),
      });
      // Réglage du module : le compositeur se vide pour la saisie suivante,
      // les réglages restent. « Reprendre » remet tout au besoin.
      if (settings.clear_after_submit !== false) {
        setState((prev) => ({ ...prev, prompt: "", references: [] }));
      }
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Lancement impossible");
    } finally {
      setSubmitting(false);
    }
  }, [state, submitting, refresh, settings.clear_after_submit]);

  const handleVariants = useCallback(
    async (item: HistoryItem, file: string) => {
      try {
        const reference = await fileToReference(file);
        await callModule("enqueueGeneration", {
          prompt: item.prompt,
          negativePrompt: item.negativePrompt,
          model: item.model,
          size: item.size,
          quality: item.quality,
          n: 2,
          collectionId: item.collectionId,
          parentId: item.id,
          references: [{ ...reference, role: "reference" }],
        });
        toast.success("Variantes en file d'attente");
        await refresh();
      } catch (error: any) {
        toast.error(error?.message ?? "Impossible de décliner cette image");
      }
    },
    [refresh]
  );

  const handleEdit = useCallback(
    async (item: HistoryItem, file: string) => {
      if (model && !model.supportsReference) {
        toast.info(`${model.label} ne sait pas retoucher une image. Changez de moteur.`);
        return;
      }
      try {
        const reference = await fileToReference(file);
        setState((prev) => ({
          ...prev,
          references: [
            {
              ...reference,
              dataUrl: `data:${reference.mimeType};base64,${reference.b64}`,
              name: file,
              id: crypto.randomUUID(),
              role: "edit-target",
            },
          ],
          prompt: "",
        }));
        promptRef.current?.focus();
        toast.success("Décrivez maintenant ce qui doit changer");
      } catch {
        toast.error("Reprise de l'image impossible");
      }
    },
    [model]
  );

  /** Recharge les images de départ archivées d'une génération. */
  const loadSources = useCallback(async (item: HistoryItem) => {
    return Promise.all(
      (item.sourceImages ?? []).map(async (source) => {
        const reference = await fileToReference(source.file);
        return {
          ...reference,
          dataUrl: `data:${reference.mimeType};base64,${reference.b64}`,
          name: source.file,
          id: crypto.randomUUID(),
          role: source.role ?? ("reference" as const),
        };
      })
    );
  }, []);

  /**
   * « Reprendre » : la demande revient dans le compositeur telle qu'elle a été
   * envoyée (texte, réglages et images de départ), prête à être retouchée puis
   * relancée. Ce n'est pas une édition : la génération d'origine reste intacte.
   */
  const handleRestore = useCallback(
    async (item: HistoryItem, mode: "full" | "prompt") => {
      if (mode === "prompt") {
        patch({ prompt: item.prompt });
        promptRef.current?.focus();
        toast.success("Texte repris dans le compositeur");
        return;
      }

      try {
        const references = await loadSources(item);
        patch({
          prompt: item.prompt,
          negativePrompt: item.negativePrompt ?? "",
          model: item.model,
          size: item.size,
          quality: item.quality ?? "",
          count: Math.max(1, Math.min(4, item.count)),
          collectionId: item.collectionId ?? "",
          pipelineId: "",
          seed: item.seed !== undefined ? String(item.seed) : "",
          references,
        });
        promptRef.current?.focus();
        if (item.usedReference && references.length === 0) {
          toast.info(
            "Texte et réglages repris. Les images de départ de cette ancienne génération n'ont pas été conservées."
          );
        } else {
          toast.success(
            references.length
              ? "Demande reprise avec ses images de départ"
              : "Demande reprise dans le compositeur"
          );
        }
      } catch {
        toast.error("Reprise de la demande impossible");
      }
    },
    [patch, loadSources]
  );

  /** Relance immédiatement la même demande, images de départ comprises. */
  const handleRerun = useCallback(
    async (item: HistoryItem) => {
      try {
        const references = await loadSources(item);
        await callModule("enqueueGeneration", {
          prompt: item.prompt,
          negativePrompt: item.negativePrompt,
          model: item.model,
          size: item.size,
          quality: item.quality,
          n: Math.max(1, Math.min(4, item.count)),
          seed: item.seed,
          collectionId: item.collectionId,
          references: references.map((reference) => ({
            b64: reference.b64,
            mimeType: reference.mimeType,
            role: reference.role,
          })),
        });
        toast.success("Génération relancée");
        await refresh();
      } catch (error: any) {
        toast.error(error?.message ?? "Relance impossible");
      }
    },
    [loadSources, refresh]
  );

  /** Ajoute une image du fil aux images d'inspiration du compositeur. */
  const handleInspire = useCallback(
    async (item: HistoryItem, file: string) => {
      if (model && !model.supportsReference) {
        toast.info(`${model.label} ne prend pas d'image de départ. Changez de moteur.`);
        return;
      }
      if (freeSlots <= 0) {
        toast.info("Le compositeur a déjà quatre images");
        return;
      }
      try {
        const reference = await fileToReference(file);
        attach(
          [
            {
              ...reference,
              dataUrl: `data:${reference.mimeType};base64,${reference.b64}`,
              name: file,
            },
          ],
          "reference"
        );
      } catch {
        toast.error("Reprise de l'image impossible");
      }
    },
    [model, freeSlots, attach]
  );

  const handleRetry = useCallback(
    (job: Job) => {
      patch({
        prompt: job.request.prompt,
        negativePrompt: job.request.negativePrompt ?? "",
        model: job.request.model,
        size: job.request.size,
        quality: job.request.quality ?? "",
        count: job.request.n,
        collectionId: job.request.collectionId ?? "",
        pipelineId: job.request.pipelineId ?? "",
      });
      promptRef.current?.focus();
      toast.info("Demande reprise dans le compositeur");
    },
    [patch]
  );

  const openViewer = useCallback((item: HistoryItem, fileIndex: number) => {
    setViewerShots(item.imageFiles.map((file) => ({ item, file })));
    setViewerIndex(fileIndex);
  }, []);

  const empty = ready && history.length === 0 && jobs.length === 0;

  // ─── Rendu ──────────────────────────────────────────────────

  return (
    // Les animations du studio suivent le réglage « réduire les animations »
    // du système.
    <MotionConfig reducedMotion="user">
    <ModuleShell
      wide
      current=""
      title="Studio"
      description="Décrivez, joignez une image si besoin, lancez. Les rendus arrivent dans le fil au fil de l'eau."
      actions={
        <>
          <ViewSwitcher view={view} onChange={setView} />
          <ActivitySheet jobs={jobs} activeCount={activeJobs.length} onMutate={refresh} />
          <Button variant="outline" size="sm" asChild>
            <Link href="/m/ai-image-gen/library" className="gap-2">
              <Images className="h-4 w-4" />
              <span className="hidden sm:inline">Bibliothèque</span>
            </Link>
          </Button>
        </>
      }
    >
      {catalogue && !anyAvailable && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Aucun moteur disponible</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              Aucun agent en ligne de commande n&apos;a été détecté et aucune clé
              API n&apos;est enregistrée.
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href="/m/ai-image-gen/settings" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Configurer les moteurs
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex min-h-[calc(100svh-9rem)] flex-col">
        <div className="w-full flex-1 pb-6">
          {!ready && (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="my-2.5 h-4 w-40" />
              {[
                [1, 1, 1.4, 1, 1],
                [2, 1, 1.5],
              ].map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-4 pb-2">
                  {row.map((ratio, index) => (
                    <div key={index} className="flex min-w-0 flex-col gap-2" style={{ flex: `${ratio} 1 0%` }}>
                      <Skeleton className="w-full rounded-xl" style={{ aspectRatio: ratio }} />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {empty && (
            <EmptyStudio onPick={(prompt) => {
              patch({ prompt });
              promptRef.current?.focus();
            }} />
          )}

          {ready && !empty && (
            <StudioFeed
              view={view}
              history={history}
              jobs={jobs}
              collectionsById={collectionsById}
              onOpen={openViewer}
              collections={collections}
              onRestore={handleRestore}
              onRerun={handleRerun}
              onInspire={handleInspire}
              onVariants={handleVariants}
              onEdit={handleEdit}
              onRetry={handleRetry}
              onMutate={refresh}
            />
          )}
        </div>

        {/* Le dock suit le défilement du fil et reste collé au bas de la
            zone visible ; le dégradé évite une coupure nette des images qui
            passent dessous. */}
        <div className="sticky -bottom-4 z-20 -mx-1 -mb-4 bg-gradient-to-t from-background from-45% to-transparent px-1 pt-10 pb-4">
          <div className="mx-auto w-full max-w-4xl">
            <PromptDock
              catalogue={catalogue}
              collections={collections}
              pipelines={pipelines}
              state={state}
              onChange={patch}
              onSubmit={submit}
              submitting={submitting}
              onOpenPicker={openPicker}
              importing={intake.busy}
              textareaRef={promptRef}
            />
          </div>
        </div>
      </div>

      <DropOverlay
        visible={intake.dragging}
        accepted={Boolean(model?.supportsReference) && freeSlots > 0}
        reason={
          !model?.supportsReference
            ? `${model?.label ?? "Ce moteur"} ne prend pas d'image de départ`
            : "Le compositeur a déjà quatre images"
        }
      />

      <ImagePicker
        open={picker.open}
        initialSource={picker.source}
        onOpenChange={(open) => setPicker((current) => ({ ...current, open }))}
        maxSelection={Math.max(1, freeSlots)}
        onPick={(images) => attach(images)}
      />

      <ImageViewer
        shots={viewerShots}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onMutate={refresh}
      />
    </ModuleShell>
    </MotionConfig>
  );
}

// ─── Studio vide ─────────────────────────────────────────────────

function EmptyStudio({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-8 pt-10 pb-4 text-center md:pt-16">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Qu&apos;allez-vous créer&nbsp;?
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Écrivez une description dans la barre ci-dessous, ou partez d&apos;une
          de ces idées. Vous pouvez aussi glisser une image n&apos;importe où
          sur la page pour la retoucher.
        </p>
      </div>
      <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2">
        {STARTERS.map((starter) => (
          <button
            key={starter.title}
            type="button"
            onClick={() => onPick(starter.prompt)}
            className="group rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="block text-sm font-medium">{starter.title}</span>
            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
              {starter.prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Dépôt d'image ───────────────────────────────────────────────

function DropOverlay({
  visible,
  accepted,
  reason,
}: {
  visible: boolean;
  accepted: boolean;
  reason: string;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6 transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        className={cn(
          "relative flex h-full max-h-[32rem] w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed p-8 text-center transition-transform duration-200",
          accepted ? "border-primary bg-primary/5" : "border-destructive/60 bg-destructive/5",
          visible ? "scale-100" : "scale-95"
        )}
      >
        <span
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl",
            accepted ? "bg-primary text-primary-foreground" : "bg-destructive/15 text-destructive"
          )}
        >
          <ImageDown className="h-7 w-7" />
        </span>
        <span className="text-lg font-medium">
          {accepted ? "Déposez pour joindre l'image" : "Dépôt impossible"}
        </span>
        <span className="max-w-sm text-sm text-muted-foreground">
          {accepted
            ? "Elle rejoint le compositeur comme image de départ. Fichiers, images d'autres onglets et rendus du fil sont acceptés."
            : reason}
        </span>
      </div>
    </div>
  );
}

// ─── Activité ────────────────────────────────────────────────────

function ActivitySheet({
  jobs,
  activeCount,
  onMutate,
}: {
  jobs: Job[];
  activeCount: number;
  onMutate: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Activity className="h-4 w-4" />
          <span className="hidden sm:inline">Activité</span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Activité</SheetTitle>
          <SheetDescription>
            File d&apos;attente et dernières générations, avec le journal de
            chaque moteur.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <JobQueue jobs={jobs} onMutate={onMutate} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Choix de la vue ─────────────────────────────────────────────

const VIEW_KEY = "ai-image-gen:view";

const VIEWS: { id: FeedView; label: string; icon: typeof LayoutGrid }[] = [
  { id: "mosaic", label: "Mosaïque", icon: LayoutGrid },
  { id: "list", label: "Liste", icon: Rows3 },
  { id: "chat", label: "Conversation", icon: MessagesSquare },
];

/** Vue du fil, retenue d'une visite à l'autre dans ce navigateur. */
function useFeedView() {
  const [view, setView] = useState<FeedView>("mosaic");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved && VIEWS.some((entry) => entry.id === saved)) setView(saved as FeedView);
    } catch {
      // Stockage indisponible : la mosaïque reste la vue par défaut.
    }
  }, []);

  const change = useCallback((next: FeedView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sans stockage, le choix vaut pour la visite en cours.
    }
  }, []);

  return [view, change] as const;
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: FeedView;
  onChange: (view: FeedView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Affichage du fil"
      className="inline-flex h-8 items-center rounded-lg border bg-muted/60 p-0.5"
    >
      {VIEWS.map((entry) => {
        const active = entry.id === view;
        const Icon = entry.icon;
        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={entry.label}
                onClick={() => onChange(entry.id)}
                className={cn(
                  "relative flex h-7 w-8 items-center justify-center rounded-md transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {/* La pastille glisse d'une option à l'autre. */}
                {active && (
                  <motion.span
                    layoutId="studio-view-pill"
                    className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <Icon className="relative h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{entry.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
