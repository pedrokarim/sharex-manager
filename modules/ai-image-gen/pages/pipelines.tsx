"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ImageDown,
  Pencil,
  Plus,
  Trash2,
  Wand2,
  Workflow,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  callModule,
  type Catalogue,
  type Pipeline,
  type PipelineStep,
  type PipelineStepKind,
} from "../lib/client";

interface PipelinesPageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

const STEP_KINDS: {
  value: PipelineStepKind;
  label: string;
  help: string;
}[] = [
  {
    value: "generate",
    label: "Génération",
    help: "Produit des images à partir du prompt. La première étape reçoit les pièces jointes du studio.",
  },
  {
    value: "variant",
    label: "Variantes",
    help: "Repart du rendu précédent comme référence et en décline des versions voisines.",
  },
  {
    value: "edit",
    label: "Retouche",
    help: "Reprend le rendu précédent comme image à modifier, en ne faisant varier que ce que décrit le prompt de l'étape.",
  },
  {
    value: "upscale",
    label: "Agrandissement",
    help: "Rééchantillonne localement le rendu précédent. Immédiat, sans appel réseau ni consommation de quota.",
  },
  {
    value: "gallery",
    label: "Envoi en galerie",
    help: "Copie le rendu précédent dans les uploads de l'application.",
  },
];

/** Gabarits proposés à la création, pour ne pas partir d'une page blanche. */
const TEMPLATES: { name: string; description: string; steps: PipelineStep[] }[] = [
  {
    name: "Brouillon puis finition",
    description:
      "Un premier jet rapide, décliné en variantes, puis agrandi et publié.",
    steps: [
      { id: "s1", kind: "generate", quality: "low", n: 2, keep: true },
      { id: "s2", kind: "variant", n: 2, keep: true },
      { id: "s3", kind: "upscale", scale: 2, keep: true },
      { id: "s4", kind: "gallery", keep: true },
    ],
  },
  {
    name: "Déclinaison de visuels",
    description: "Une image de base, trois variations, tout part en galerie.",
    steps: [
      { id: "s1", kind: "generate", n: 1, keep: true },
      { id: "s2", kind: "variant", n: 3, keep: true },
      { id: "s3", kind: "gallery", keep: true },
    ],
  },
  {
    name: "Retouche guidée",
    description:
      "Génère, puis applique une modification ciblée en préservant le reste.",
    steps: [
      { id: "s1", kind: "generate", n: 1, keep: true },
      {
        id: "s2",
        kind: "edit",
        prompt: "{prompt}, au coucher du soleil",
        n: 1,
        keep: true,
      },
    ],
  },
];

export default function PipelinesPage({}: PipelinesPageProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [editing, setEditing] = useState<Partial<Pipeline> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [list, cat] = await Promise.all([
        callModule<Pipeline[]>("listPipelines"),
        callModule<Catalogue>("getCatalogue"),
      ]);
      setPipelines(list);
      setCatalogue(cat);
    } catch {
      toast.error("Chargement des pipelines impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ModuleShell
      current="pipelines"
      title="Pipelines"
      description="Des enchaînements enregistrés : générer, décliner, retoucher, agrandir, publier, sans repasser par l'interface entre chaque geste."
      actions={
        <Button
          size="sm"
          className="gap-2"
          onClick={() =>
            setEditing({ name: "", steps: [{ id: "s1", kind: "generate", n: 1 }] })
          }
        >
          <Plus className="h-4 w-4" />
          Nouveau pipeline
        </Button>
      }
    >
      {loading && <Spinner className="h-5 w-5" />}

      {!loading && pipelines.length === 0 && (
        <div className="space-y-5">
          <Empty className="rounded-xl border border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Workflow className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle>Aucun pipeline</EmptyTitle>
              <EmptyDescription>
                Partez d&apos;un gabarit ci-dessous, ou composez le vôtre étape
                par étape.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>

          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((template) => (
              <button
                key={template.name}
                type="button"
                onClick={() =>
                  setEditing({ name: template.name, steps: template.steps })
                }
                className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
              >
                <p className="font-medium">{template.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {template.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {template.steps.map((step, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] font-normal"
                    >
                      {STEP_KINDS.find((kind) => kind.value === step.kind)?.label}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pipelines.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {pipelines.map((pipeline) => (
            <article key={pipeline.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{pipeline.name}</p>
                  {pipeline.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pipeline.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Modifier"
                    onClick={() => setEditing(pipeline)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Supprimer"
                    onClick={async () => {
                      await callModule("deletePipeline", pipeline.id);
                      await load();
                      toast.success("Pipeline supprimé");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <ol className="mt-3 space-y-1.5">
                {pipeline.steps.map((step, index) => (
                  <li
                    key={step.id}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-medium tabular-nums">
                      {index + 1}
                    </span>
                    <StepIcon kind={step.kind} />
                    <span className="font-medium">
                      {step.label ||
                        STEP_KINDS.find((kind) => kind.value === step.kind)?.label}
                    </span>
                    {step.n && step.n > 1 && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        ×{step.n}
                      </Badge>
                    )}
                    {step.prompt && (
                      <span className="truncate text-muted-foreground">
                        {step.prompt}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      )}

      <PipelineEditor
        value={editing}
        catalogue={catalogue}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await load();
          setEditing(null);
        }}
      />
    </ModuleShell>
  );
}

function StepIcon({ kind }: { kind: PipelineStepKind }) {
  const className = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (kind === "variant") return <Wand2 className={className} />;
  if (kind === "edit") return <Pencil className={className} />;
  if (kind === "upscale") return <ZoomIn className={className} />;
  if (kind === "gallery") return <ImageDown className={className} />;
  return <Workflow className={className} />;
}

// ─── Éditeur ─────────────────────────────────────────────────────

function PipelineEditor({
  value,
  catalogue,
  onClose,
  onSaved,
}: {
  value: Partial<Pipeline> | null;
  catalogue: Catalogue | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<Pipeline>>({ name: "", steps: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  const steps = draft.steps ?? [];
  const models = (catalogue?.models ?? []).filter((model) => model.available);

  const patchStep = (index: number, next: Partial<PipelineStep>) =>
    setDraft((previous) => ({
      ...previous,
      steps: (previous.steps ?? []).map((step, position) =>
        position === index ? { ...step, ...next } : step
      ),
    }));

  const move = (index: number, delta: number) =>
    setDraft((previous) => {
      const list = [...(previous.steps ?? [])];
      const target = index + delta;
      if (target < 0 || target >= list.length) return previous;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...previous, steps: list };
    });

  const save = async () => {
    setBusy(true);
    try {
      await callModule("savePipeline", {
        id: draft.id,
        name: draft.name,
        description: draft.description,
        steps: draft.steps,
      });
      toast.success("Pipeline enregistré");
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(value)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Modifier le pipeline" : "Nouveau pipeline"}
          </DialogTitle>
          <DialogDescription>
            Chaque étape travaille sur le rendu de la précédente. Le prompt du
            studio est repris par{" "}
            <code className="font-mono text-[11px]">{"{prompt}"}</code>.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="pipeline-name">Nom</FieldLabel>
            <Input
              id="pipeline-name"
              value={draft.name ?? ""}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, name: event.target.value }))
              }
              placeholder="Brouillon puis finition"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="pipeline-description">Description</FieldLabel>
            <Input
              id="pipeline-description"
              value={draft.description ?? ""}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
            />
          </Field>
        </FieldGroup>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Étapes</h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                setDraft((previous) => ({
                  ...previous,
                  steps: [
                    ...(previous.steps ?? []),
                    {
                      id: `s${(previous.steps?.length ?? 0) + 1}-${Math.random()
                        .toString(36)
                        .slice(2, 6)}`,
                      kind: "generate",
                      n: 1,
                    },
                  ],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>

          {steps.map((step, index) => {
            const kind = STEP_KINDS.find((entry) => entry.value === step.kind);
            const needsPrompt = step.kind !== "upscale" && step.kind !== "gallery";
            return (
              <div key={step.id} className="space-y-2.5 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums">
                    {index + 1}
                  </span>
                  <Select
                    value={step.kind}
                    onValueChange={(next) =>
                      patchStep(index, { kind: next as PipelineStepKind })
                    }
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STEP_KINDS.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Monter"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Descendre"
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Retirer"
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        steps: (previous.steps ?? []).filter(
                          (_, position) => position !== index
                        ),
                      }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <p className="text-[11px] leading-4 text-muted-foreground">
                  {kind?.help}
                </p>

                {needsPrompt && (
                  <Textarea
                    rows={2}
                    placeholder="Laisser vide pour reprendre le prompt du studio, ou écrire par exemple : {prompt}, vu de nuit"
                    value={step.prompt ?? ""}
                    onChange={(event) =>
                      patchStep(index, { prompt: event.target.value })
                    }
                    className="resize-none text-xs"
                  />
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {needsPrompt && (
                    <Field>
                      <FieldLabel className="text-[11px]">Images</FieldLabel>
                      <Input
                        type="number"
                        min={1}
                        max={4}
                        value={step.n ?? 1}
                        onChange={(event) =>
                          patchStep(index, {
                            n: Math.max(1, Math.min(4, Number(event.target.value) || 1)),
                          })
                        }
                        className="h-8"
                      />
                    </Field>
                  )}

                  {needsPrompt && models.length > 0 && (
                    <Field className="col-span-2">
                      <FieldLabel className="text-[11px]">Moteur</FieldLabel>
                      <Select
                        value={step.model ?? "inherit"}
                        onValueChange={(next) =>
                          patchStep(index, {
                            model: next === "inherit" ? undefined : next,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Celui du studio</SelectItem>
                          {models.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  {step.kind === "upscale" && (
                    <Field>
                      <FieldLabel className="text-[11px]">Facteur</FieldLabel>
                      <Select
                        value={String(step.scale ?? 2)}
                        onValueChange={(next) =>
                          patchStep(index, { scale: Number(next) })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">×2</SelectItem>
                          <SelectItem value="3">×3</SelectItem>
                          <SelectItem value="4">×4</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>

                {needsPrompt && (
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      Garder ces rendus dans la bibliothèque
                      <span className="block text-[11px] text-muted-foreground">
                        Décochez pour une étape intermédiaire qui ne vous
                        intéresse pas.
                      </span>
                    </span>
                    <Switch
                      checked={step.keep !== false}
                      onCheckedChange={(checked) =>
                        patchStep(index, { keep: checked })
                      }
                    />
                  </label>
                )}
              </div>
            );
          })}

          {steps.length === 0 && (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
              Ajoutez au moins une étape.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={save}
            disabled={busy || !draft.name?.trim() || steps.length === 0}
          >
            {busy && <Spinner className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
