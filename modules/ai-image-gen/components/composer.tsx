"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ChevronDown,
  Cpu,
  KeyRound,
  Layers,
  Paperclip,
  Plus,
  Settings2,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  NEGATIVE_PRESETS,
  PRESETS,
  readFileAsBase64,
  type Catalogue,
  type Collection,
  type ModelAvailability,
  type Pipeline,
} from "../lib/client";

export interface ComposerReference {
  b64: string;
  mimeType: string;
  dataUrl: string;
  name: string;
  role: "reference" | "edit-target";
}

export interface ComposerState {
  prompt: string;
  negativePrompt: string;
  model: string;
  size: string;
  quality: string;
  count: number;
  notes: string;
  seed: string;
  collectionId: string;
  pipelineId: string;
  references: ComposerReference[];
}

export function emptyComposerState(
  settings: Record<string, any>,
  fallbackModel: string
): ComposerState {
  return {
    prompt: "",
    negativePrompt: settings.default_negative_prompt ?? "",
    model: settings.default_model || fallbackModel,
    size: settings.default_size || "1024x1024",
    quality: settings.default_quality || "medium",
    count: settings.default_count || 1,
    notes: settings.notes_preprompt ?? "",
    seed: "",
    collectionId: "",
    pipelineId: "",
    references: [],
  };
}

const COUNT_CHOICES = [1, 2, 4] as const;

interface ComposerProps {
  catalogue: Catalogue | null;
  collections: Collection[];
  pipelines: Pipeline[];
  state: ComposerState;
  onChange: (next: Partial<ComposerState>) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function Composer({
  catalogue,
  collections,
  pipelines,
  state,
  onChange,
  onSubmit,
  submitting,
}: ComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const models = catalogue?.models ?? [];
  const model = models.find((entry) => entry.id === state.model);

  const grouped = useMemo(() => {
    const subscription = models.filter((entry) => entry.billing === "subscription");
    const apiKey = models.filter((entry) => entry.billing === "api-key");
    return { subscription, apiKey };
  }, [models]);

  // Chaque modèle a ses propres formats et paliers de qualité. Garder une
  // valeur devenue invalide provoquerait un rejet à l'exécution.
  useEffect(() => {
    if (!model) return;
    const patch: Partial<ComposerState> = {};
    if (!model.sizes.includes(state.size)) patch.size = model.sizes[0];
    if (
      model.qualities?.length &&
      !model.qualities.some((quality) => quality.value === state.quality)
    ) {
      patch.quality = model.qualities[0].value;
    }
    if (state.count > model.maxBatch) patch.count = model.maxBatch;
    if (Object.keys(patch).length) onChange(patch);
  }, [model, state.size, state.quality, state.count, onChange]);

  // Une référence chargée puis un changement de modèle qui ne la gère pas :
  // on la retire plutôt que de laisser une pièce jointe sans effet.
  useEffect(() => {
    if (model && !model.supportsReference && state.references.length) {
      onChange({ references: [] });
      toast.info(
        `${model.label} ne gère pas l'image de départ, la pièce jointe a été retirée.`
      );
    }
  }, [model, state.references.length, onChange]);

  const addFragment = (fragment: string) => {
    const trimmed = state.prompt.trim();
    onChange({ prompt: trimmed ? `${trimmed}, ${fragment}` : fragment });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const loaded = await Promise.all(
        Array.from(files)
          .slice(0, 4)
          .map(async (file) => {
            const read = await readFileAsBase64(file);
            return { ...read, name: file.name, role: "reference" as const };
          })
      );
      onChange({ references: [...state.references, ...loaded].slice(0, 4) });
    } catch {
      toast.error("Lecture du fichier impossible");
    }
  };

  const disabledReason = !state.prompt.trim()
    ? "Écrivez d'abord une description."
    : model && !model.available
      ? model.reason
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Modèle ───────────────────────────────────── */}
      <Field>
        <FieldLabel htmlFor="composer-model">Moteur</FieldLabel>
        <Select
          value={state.model}
          onValueChange={(value) => onChange({ model: value })}
        >
          <SelectTrigger id="composer-model" className="w-full">
            <SelectValue placeholder="Choisir un moteur" />
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            {grouped.subscription.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Comptes connectés
                </SelectLabel>
                {grouped.subscription.map((entry) => (
                  <ModelOption key={entry.id} model={entry} />
                ))}
              </SelectGroup>
            )}
            {grouped.apiKey.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Clés API
                </SelectLabel>
                {grouped.apiKey.map((entry) => (
                  <ModelOption key={entry.id} model={entry} />
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {model && (
          <FieldDescription className="flex flex-col gap-1.5">
            <span>{model.description}</span>
            <span className="flex flex-wrap gap-1">
              {model.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] font-normal"
                >
                  {tag}
                </Badge>
              ))}
            </span>
            {!model.available && model.reason && (
              <span className="text-destructive">{model.reason}</span>
            )}
          </FieldDescription>
        )}
      </Field>

      {/* ─── Prompt ───────────────────────────────────── */}
      <Field>
        <FieldLabel htmlFor="composer-prompt">Description</FieldLabel>
        <Textarea
          id="composer-prompt"
          rows={6}
          autoFocus
          placeholder="Un phare isolé au crépuscule, mer d'huile, lumière rasante…"
          value={state.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="resize-y text-sm leading-6"
        />
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => addFragment(preset.fragment)}
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              + {preset.label}
            </button>
          ))}
        </div>
      </Field>

      {/* ─── Consignes négatives ──────────────────────── */}
      <Collapsible defaultOpen={Boolean(state.negativePrompt)}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-between px-2 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <X className="h-3.5 w-3.5" />À éviter
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Textarea
            rows={2}
            placeholder="texte, filigrane, mains déformées…"
            value={state.negativePrompt}
            onChange={(event) => onChange({ negativePrompt: event.target.value })}
            className="resize-none text-xs"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {NEGATIVE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  onChange({
                    negativePrompt: state.negativePrompt.trim()
                      ? `${state.negativePrompt.trim()}, ${preset}`
                      : preset,
                  })
                }
                className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                + {preset}
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ─── Format, qualité, lot ─────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="composer-size">Format</FieldLabel>
          <Select
            value={state.size}
            onValueChange={(value) => onChange({ size: value })}
          >
            <SelectTrigger id="composer-size" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(model?.sizes ?? ["1024x1024"]).map((size) => (
                <SelectItem key={size} value={size} className="font-mono text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {model?.qualities?.length ? (
          <Field>
            <FieldLabel htmlFor="composer-quality">Qualité</FieldLabel>
            <Select
              value={state.quality}
              onValueChange={(value) => onChange({ quality: value })}
            >
              <SelectTrigger id="composer-quality" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {model.qualities.map((quality) => (
                  <SelectItem key={quality.value} value={quality.value}>
                    {quality.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="composer-seed">Graine</FieldLabel>
            <Input
              id="composer-seed"
              inputMode="numeric"
              placeholder="aléatoire"
              value={state.seed}
              onChange={(event) =>
                onChange({ seed: event.target.value.replace(/\D/g, "") })
              }
              className="font-mono text-xs"
            />
          </Field>
        )}
      </div>

      <Field>
        <FieldLabel>Nombre d&apos;images</FieldLabel>
        <ButtonGroup className="w-full">
          {COUNT_CHOICES.map((choice) => (
            <Button
              key={choice}
              type="button"
              variant={state.count === choice ? "default" : "outline"}
              size="sm"
              disabled={Boolean(model && choice > model.maxBatch)}
              onClick={() => onChange({ count: choice })}
              className="flex-1"
            >
              {choice}
            </Button>
          ))}
        </ButtonGroup>
        {model && model.maxBatch < 4 && (
          <FieldDescription>
            {model.label} rend au plus {model.maxBatch} image(s) par génération.
          </FieldDescription>
        )}
      </Field>

      {/* ─── Images de départ ─────────────────────────── */}
      {model?.supportsReference && (
        <Field>
          <FieldLabel>Image de départ</FieldLabel>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          {state.references.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
              className="w-full gap-2 border-dashed"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Joindre une image
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {state.references.map((reference, index) => (
                  <div
                    key={`${reference.name}-${index}`}
                    className="group relative h-16 w-16 overflow-hidden rounded-md border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={reference.dataUrl}
                      alt={reference.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Retirer ${reference.name}`}
                      onClick={() =>
                        onChange({
                          references: state.references.filter(
                            (_, position) => position !== index
                          ),
                        })
                      }
                      className="absolute right-0.5 top-0.5 rounded bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {state.references.length < 4 && (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    aria-label="Ajouter une image"
                    className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              <label className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-2">
                <span className="text-xs">
                  Retoucher l&apos;image plutôt que s&apos;en inspirer
                  <span className="block text-[11px] text-muted-foreground">
                    Conserve la composition et ne fait varier que ce que décrit
                    le prompt.
                  </span>
                </span>
                <Switch
                  checked={state.references[0]?.role === "edit-target"}
                  onCheckedChange={(checked) =>
                    onChange({
                      references: state.references.map((reference) => ({
                        ...reference,
                        role: checked ? "edit-target" : "reference",
                      })),
                    })
                  }
                />
              </label>
            </div>
          )}
        </Field>
      )}

      {/* ─── Série et pipeline ────────────────────────── */}
      <div className="grid gap-3">
        <Field>
          <FieldLabel htmlFor="composer-collection" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Série
          </FieldLabel>
          <Select
            value={state.collectionId || "none"}
            onValueChange={(value) =>
              onChange({ collectionId: value === "none" ? "" : value })
            }
          >
            <SelectTrigger id="composer-collection" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune</SelectItem>
              {collections.map((collection) => (
                <SelectItem key={collection.id} value={collection.id}>
                  {collection.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.collectionId && (
            <FieldDescription>
              Les repères visuels et le style de la série sont joints
              automatiquement.
            </FieldDescription>
          )}
        </Field>

        {pipelines.length > 0 && (
          <Field>
            <FieldLabel htmlFor="composer-pipeline" className="gap-1.5">
              <Workflow className="h-3.5 w-3.5" />
              Pipeline
            </FieldLabel>
            <Select
              value={state.pipelineId || "none"}
              onValueChange={(value) =>
                onChange({ pipelineId: value === "none" ? "" : value })
              }
            >
              <SelectTrigger id="composer-pipeline" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Génération simple</SelectItem>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name} ({pipeline.steps.length} étapes)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {/* ─── Notes de style ───────────────────────────── */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-between px-2 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Notes de style
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Textarea
            rows={2}
            placeholder="masterpiece, best quality, highly detailed…"
            value={state.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            className="resize-none text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Placées devant chaque prompt de cette session.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* ─── Lancement ────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-background via-background to-transparent px-1 pb-1 pt-3">
        <Button
          type="button"
          size="lg"
          className="w-full gap-2"
          disabled={submitting || Boolean(disabledReason)}
          onClick={onSubmit}
        >
          {submitting ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {state.pipelineId ? "Lancer le pipeline" : "Générer"}
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {disabledReason ?? (
            <>
              <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <Kbd>↵</Kbd>
              </KbdGroup>{" "}
              pour lancer
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ModelOption({ model }: { model: ModelAvailability }) {
  return (
    <SelectItem value={model.id} disabled={!model.available}>
      <span className="flex w-full items-center justify-between gap-3">
        <span className="truncate">{model.label}</span>
        <span
          className={cn(
            "shrink-0 text-[10px]",
            model.available ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {model.available ? model.accessLabel : "indisponible"}
        </span>
      </span>
    </SelectItem>
  );
}
