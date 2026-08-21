"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Anchor,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModuleConfig } from "@/types/modules";
import { ModuleShell } from "../components/module-shell";
import { GenerationCard } from "../components/generation-card";
import { ImageViewer, type Shot } from "../components/image-viewer";
import { JobQueue } from "../components/job-queue";
import {
  callModule,
  imageUrl,
  useStudioState,
  type Catalogue,
  type Collection,
  type HistoryItem,
} from "../lib/client";

interface CollectionsPageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

/**
 * Une série regroupe des images qui doivent se tenir entre elles : même
 * univers, mêmes personnages, même traitement. Deux leviers y répondent, et
 * ils sont automatiquement joints à chaque scène : des notes de style
 * partagées, et des repères visuels (les ancres) qui servent de référence
 * d'image à toutes les générations de la série.
 */
export default function CollectionsPage({ settings }: CollectionsPageProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Collection> | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerShots, setViewerShots] = useState<Shot[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { jobs, history, refresh } = useStudioState(200);

  const load = useCallback(async () => {
    try {
      const [cols, cat] = await Promise.all([
        callModule<Collection[]>("listCollections"),
        callModule<Catalogue>("getCatalogue"),
      ]);
      setCollections(cols);
      setCatalogue(cat);
    } catch {
      toast.error("Chargement des séries impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = collections.find((entry) => entry.id === selectedId) ?? null;

  const byCollection = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of history) {
      if (!item.collectionId) continue;
      const list = map.get(item.collectionId) ?? [];
      list.push(item);
      map.set(item.collectionId, list);
    }
    return map;
  }, [history]);

  const openViewer = useCallback((item: HistoryItem, fileIndex: number) => {
    setViewerShots(item.imageFiles.map((file) => ({ item, file })));
    setViewerIndex(fileIndex);
  }, []);

  const saveCollection = async (input: Partial<Collection>) => {
    try {
      const saved = await callModule<Collection>("saveCollection", input);
      await load();
      setEditing(null);
      setSelectedId(saved.id);
      toast.success("Série enregistrée");
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    }
  };

  return (
    <ModuleShell
      current="collections"
      title="Séries"
      description="Des ensembles cohérents : une trame, un style partagé et des repères visuels joints à chaque scène."
      actions={
        <Button
          size="sm"
          onClick={() => setEditing({ name: "" })}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nouvelle série
        </Button>
      }
    >
      {loading && <Spinner className="h-5 w-5" />}

      {!loading && !selected && collections.length === 0 && (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>Aucune série</EmptyTitle>
            <EmptyDescription>
              Une série tient un personnage ou un univers d&apos;une image à
              l&apos;autre. Créez-en une, ajoutez-y un repère visuel, et toutes
              les scènes suivantes s&apos;y accrocheront.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!selected && collections.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => {
            const items = byCollection.get(collection.id) ?? [];
            const cover =
              collection.coverFile ??
              collection.anchors?.[0]?.file ??
              items[0]?.imageFiles[0];
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelectedId(collection.id)}
                className="overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/40"
              >
                <div className="aspect-[16/10] bg-muted/50">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl(cover)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Layers className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="font-medium">{collection.name}</p>
                  {collection.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {collection.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {items.length} scène(s)
                    </Badge>
                    {collection.anchors?.length ? (
                      <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                        <Anchor className="h-2.5 w-2.5" />
                        {collection.anchors.length} repère(s)
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <CollectionDetail
          collection={selected}
          items={byCollection.get(selected.id) ?? []}
          history={history}
          catalogue={catalogue}
          settings={settings}
          jobs={jobs}
          onBack={() => setSelectedId(null)}
          onEdit={() => setEditing(selected)}
          onRefresh={async () => {
            await Promise.all([load(), refresh()]);
          }}
          onOpenViewer={openViewer}
        />
      )}

      <CollectionDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSave={saveCollection}
      />

      <ImageViewer
        shots={viewerShots}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onMutate={refresh}
      />
    </ModuleShell>
  );
}

// ─── Détail d'une série ──────────────────────────────────────────

function CollectionDetail({
  collection,
  items,
  history,
  catalogue,
  settings,
  jobs,
  onBack,
  onEdit,
  onRefresh,
  onOpenViewer,
}: {
  collection: Collection;
  items: HistoryItem[];
  history: HistoryItem[];
  catalogue: Catalogue | null;
  settings: Record<string, any>;
  jobs: ReturnType<typeof useStudioState>["jobs"];
  onBack: () => void;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
  onOpenViewer: (item: HistoryItem, fileIndex: number) => void;
}) {
  const [scenePrompt, setScenePrompt] = useState("");
  const [model, setModel] = useState(settings.default_model ?? "");
  const [busy, setBusy] = useState(false);
  const [anchorPicker, setAnchorPicker] = useState(false);

  const models = (catalogue?.models ?? []).filter((entry) => entry.available);

  useEffect(() => {
    if (!models.length) return;
    if (!models.some((entry) => entry.id === model)) setModel(models[0].id);
  }, [models, model]);

  const addScene = async () => {
    if (!scenePrompt.trim()) return;
    setBusy(true);
    try {
      const spec = models.find((entry) => entry.id === model);
      await callModule("enqueueGeneration", {
        prompt: scenePrompt,
        model,
        size: spec?.sizes[0] ?? "1024x1024",
        quality: spec?.qualities?.[0]?.value,
        n: 1,
        collectionId: collection.id,
      });
      setScenePrompt("");
      toast.success("Scène en file d'attente");
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Lancement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{collection.name}</h2>
            {collection.description && (
              <p className="text-sm text-muted-foreground">
                {collection.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette série ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Les images restent dans la bibliothèque, elles perdent
                  simplement leur rattachement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await callModule("deleteCollection", collection.id);
                    await onRefresh();
                    onBack();
                  }}
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {(collection.synopsis || collection.styleNotes) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {collection.synopsis && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Trame
              </p>
              <p className="mt-1 text-sm leading-6">{collection.synopsis}</p>
            </div>
          )}
          {collection.styleNotes && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Style partagé
              </p>
              <p className="mt-1 text-sm leading-6">{collection.styleNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Repères visuels ──────────────────────────── */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Anchor className="h-4 w-4" />
            Repères visuels
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setAnchorPicker(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </div>

        {collection.anchors?.length ? (
          <div className="flex flex-wrap gap-3">
            {collection.anchors.map((anchor) => (
              <div key={anchor.id} className="group relative w-24">
                <div className="aspect-square overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl(anchor.file)}
                    alt={anchor.label}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-1 truncate text-[11px]" title={anchor.label}>
                  {anchor.label}
                </p>
                <button
                  type="button"
                  aria-label={`Retirer ${anchor.label}`}
                  onClick={async () => {
                    await callModule(
                      "removeCollectionAnchor",
                      collection.id,
                      anchor.id
                    );
                    await onRefresh();
                  }}
                  className="absolute right-1 top-1 rounded bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucun repère. Épinglez une image générée pour que les scènes
            suivantes s&apos;y accrochent (même personnage, même décor, même
            charte).
          </p>
        )}
      </section>

      {/* ─── Nouvelle scène ───────────────────────────── */}
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" />
          Nouvelle scène
        </h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            rows={2}
            placeholder="La même héroïne, de nuit, sur les toits…"
            value={scenePrompt}
            onChange={(event) => setScenePrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void addScene();
              }
            }}
            className="min-h-[60px] flex-1 resize-none text-sm"
          />
          <div className="flex gap-2 sm:flex-col">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <SelectValue placeholder="Moteur" />
              </SelectTrigger>
              <SelectContent>
                {models.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={addScene}
              disabled={busy || !scenePrompt.trim() || !model}
              className="gap-2"
            >
              {busy ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Générer
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          La trame, le style et les {collection.anchors?.length ?? 0} repère(s)
          de la série sont ajoutés automatiquement.
        </p>
      </section>

      <JobQueue jobs={jobs} onMutate={onRefresh} />

      {/* ─── Scènes ───────────────────────────────────── */}
      {items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <GenerationCard
              key={item.id}
              item={item}
              collection={collection}
              onOpen={onOpenViewer}
              onMutate={onRefresh}
              compact
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Aucune scène pour l&apos;instant.
        </p>
      )}

      <AnchorPicker
        open={anchorPicker}
        onClose={() => setAnchorPicker(false)}
        history={history}
        onPick={async (file, label) => {
          await callModule("addCollectionAnchor", collection.id, file, label);
          await onRefresh();
          setAnchorPicker(false);
          toast.success("Repère ajouté");
        }}
      />
    </div>
  );
}

// ─── Choix d'un repère ───────────────────────────────────────────

function AnchorPicker({
  open,
  onClose,
  history,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onPick: (file: string, label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<string | null>(null);

  const shots = useMemo(
    () => history.flatMap((item) => item.imageFiles.map((entry) => entry)).slice(0, 60),
    [history]
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Épingler un repère visuel</DialogTitle>
          <DialogDescription>
            L&apos;image choisie sera jointe à chaque génération de la série,
            comme référence de style ou de personnage.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[45vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
          {shots.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setFile(entry)}
              className={
                file === entry
                  ? "aspect-square overflow-hidden rounded-md ring-2 ring-primary"
                  : "aspect-square overflow-hidden rounded-md border"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(entry)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>

        <Field>
          <FieldLabel htmlFor="anchor-label">Rôle du repère</FieldLabel>
          <Input
            id="anchor-label"
            placeholder="Héroïne, décor du port, charte colorée…"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button
            disabled={!file}
            onClick={() => file && onPick(file, label || "Référence")}
          >
            Épingler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Création et édition ─────────────────────────────────────────

function CollectionDialog({
  value,
  onClose,
  onSave,
}: {
  value: Partial<Collection> | null;
  onClose: () => void;
  onSave: (input: Partial<Collection>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<Collection>>({ name: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  const patch = (next: Partial<Collection>) =>
    setDraft((previous) => ({ ...previous, ...next }));

  return (
    <Dialog open={Boolean(value)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {value?.id ? "Modifier la série" : "Nouvelle série"}
          </DialogTitle>
          <DialogDescription>
            La trame et le style seront ajoutés devant chaque prompt de la
            série.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="collection-name">Nom</FieldLabel>
            <Input
              id="collection-name"
              value={draft.name ?? ""}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Les carnets du phare"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="collection-description">Description</FieldLabel>
            <Input
              id="collection-description"
              value={draft.description ?? ""}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder="Courte phrase de repérage, pour la liste"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="collection-synopsis">Trame</FieldLabel>
            <Textarea
              id="collection-synopsis"
              rows={3}
              value={draft.synopsis ?? ""}
              onChange={(event) => patch({ synopsis: event.target.value })}
              placeholder="Une gardienne de phare traverse une tempête de trois jours…"
              className="resize-none text-sm"
            />
            <FieldDescription>
              Contexte narratif rappelé au modèle à chaque scène.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="collection-style">Style partagé</FieldLabel>
            <Textarea
              id="collection-style"
              rows={2}
              value={draft.styleNotes ?? ""}
              onChange={(event) => patch({ styleNotes: event.target.value })}
              placeholder="illustration à l'encre, palette froide, grain de papier"
              className="resize-none text-sm"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            disabled={busy || !draft.name?.trim()}
            onClick={async () => {
              setBusy(true);
              await onSave(draft);
              setBusy(false);
            }}
          >
            {busy && <Spinner className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
