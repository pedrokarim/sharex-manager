"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Images, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ModuleConfig } from "@/types/modules";
import { ModuleShell } from "../components/module-shell";
import { ImageViewer, type Shot } from "../components/image-viewer";
import { GenerationCard } from "../components/generation-card";
import { JobQueue } from "../components/job-queue";
import {
  Composer,
  emptyComposerState,
  type ComposerState,
} from "../components/composer";
import {
  callModule,
  fileToReference,
  isJobActive,
  useStudioState,
  type Catalogue,
  type Collection,
  type HistoryItem,
  type Pipeline,
} from "../lib/client";

interface GeneratePageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

export default function GeneratePage({ settings }: GeneratePageProps) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [state, setState] = useState<ComposerState>(() =>
    emptyComposerState(settings, "codex/gpt-image-2")
  );
  const [submitting, setSubmitting] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerShots, setViewerShots] = useState<Shot[]>([]);

  const { jobs, history, ready, refresh } = useStudioState(60);

  const patch = useCallback(
    (next: Partial<ComposerState>) => setState((prev) => ({ ...prev, ...next })),
    []
  );

  const loadReferenceData = useCallback(async () => {
    const [cat, cols, pipes] = await Promise.all([
      callModule<Catalogue>("getCatalogue"),
      callModule<Collection[]>("listCollections"),
      callModule<Pipeline[]>("listPipelines"),
    ]);
    setCatalogue(cat);
    setCollections(cols);
    setPipelines(pipes);
    return cat;
  }, []);

  useEffect(() => {
    loadReferenceData()
      .then((cat) => {
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
  }, [loadReferenceData]);

  const collectionsById = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections]
  );

  const anyAvailable = (catalogue?.models ?? []).some((model) => model.available);
  const activeJobs = jobs.filter(isJobActive);

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
      toast.success("Génération lancée");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Lancement impossible");
    } finally {
      setSubmitting(false);
    }
  }, [state, submitting, refresh]);

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

  const handleUseAsReference = useCallback(
    async (item: HistoryItem, file: string) => {
      try {
        const reference = await fileToReference(file);
        patch({
          references: [
            {
              ...reference,
              dataUrl: `data:${reference.mimeType};base64,${reference.b64}`,
              name: file,
              role: "edit-target",
            },
          ],
          prompt: state.prompt || item.prompt,
        });
        toast.success("Image reprise comme point de départ");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        toast.error("Reprise de l'image impossible");
      }
    },
    [patch, state.prompt]
  );

  const handleReuse = useCallback(
    (item: HistoryItem) => {
      patch({
        prompt: item.prompt,
        negativePrompt: item.negativePrompt ?? "",
        model: item.model,
        size: item.size,
        quality: item.quality ?? "",
        collectionId: item.collectionId ?? "",
        seed: item.seed !== undefined ? String(item.seed) : "",
      });
      toast.success("Réglages rechargés");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [patch]
  );

  const openViewer = useCallback((item: HistoryItem, fileIndex: number) => {
    setViewerShots(item.imageFiles.map((file) => ({ item, file })));
    setViewerIndex(fileIndex);
  }, []);

  // ─── Rendu ──────────────────────────────────────────────────

  return (
    <ModuleShell
      wide
      current=""
      title="Studio"
      description="Composez, lancez, enchaînez. Les rendus rejoignent la bibliothèque et, sur demande, la galerie."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/m/ai-image-gen/library" className="gap-2">
            <Images className="h-4 w-4" />
            Bibliothèque
          </Link>
        </Button>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,330px)_minmax(0,1fr)_minmax(260px,300px)]">
        {/* ─── Compositeur ─────────────────────────── */}
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <div className="rounded-xl border bg-card p-4">
            <Composer
              catalogue={catalogue}
              collections={collections}
              pipelines={pipelines}
              state={state}
              onChange={patch}
              onSubmit={submit}
              submitting={submitting}
            />
          </div>
        </aside>

        {/* ─── Flux des rendus ─────────────────────── */}
        <main className="min-w-0 space-y-4">
          {/* Sur écran étroit la file passe au-dessus du flux : elle reste
              visible pendant qu'on attend, sans colonne dédiée. */}
          {activeJobs.length > 0 && (
            <div className="xl:hidden">
              <JobQueue jobs={jobs} onMutate={refresh} />
            </div>
          )}

          {!ready && (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="aspect-square rounded-xl" />
              ))}
            </div>
          )}

          {ready && history.length === 0 && activeJobs.length === 0 && (
            <Empty className="rounded-xl border border-dashed py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Sparkles className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>Rien à afficher pour l&apos;instant</EmptyTitle>
                <EmptyDescription>
                  Décrivez une image dans le compositeur, puis lancez la
                  génération. Les rendus apparaîtront ici.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          )}

          {history.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {history.map((item) => (
                <GenerationCard
                  key={item.id}
                  item={item}
                  collection={
                    item.collectionId
                      ? collectionsById.get(item.collectionId)
                      : undefined
                  }
                  onOpen={openViewer}
                  onReuse={handleReuse}
                  onVariants={handleVariants}
                  onUseAsReference={handleUseAsReference}
                  onMutate={refresh}
                  compact
                />
              ))}
            </div>
          )}
        </main>

        {/* ─── File d'attente ──────────────────────── */}
        <aside className="hidden xl:block">
          <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <JobQueue jobs={jobs} onMutate={refresh} />
          </div>
        </aside>
      </div>

      <ImageViewer
        shots={viewerShots}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onMutate={refresh}
      />
    </ModuleShell>
  );
}
