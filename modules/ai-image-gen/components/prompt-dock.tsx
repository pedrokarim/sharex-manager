"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  CloudUpload,
  Cpu,
  HardDrive,
  ImagePlus,
  KeyRound,
  Layers,
  Link2,
  Palette,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  NEGATIVE_PRESETS,
  PRESETS,
  aspectRatioOf,
  ratioLabel,
  type Catalogue,
  type Collection,
  type ModelAvailability,
  type Pipeline,
} from "../lib/client";
import type { PickedImage, PickerSource } from "./image-picker";

export interface ComposerReference extends PickedImage {
  /** Identifiant local, stable pour les animations du plateau. */
  id: string;
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

export const MAX_REFERENCES = 4;

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

interface PromptDockProps {
  catalogue: Catalogue | null;
  collections: Collection[];
  pipelines: Pipeline[];
  state: ComposerState;
  onChange: (next: Partial<ComposerState>) => void;
  onSubmit: () => void;
  submitting: boolean;
  onOpenPicker: (source: PickerSource) => void;
  /** Vrai pendant la lecture d'une image déposée ou collée. */
  importing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Le compositeur, sous forme de barre flottante au pied du studio.
 *
 * Le prompt est la seule chose qu'on écrit à chaque fois : il occupe toute la
 * largeur. Les réglages, qu'on touche rarement, deviennent des pastilles qui
 * affichent leur valeur courante et s'ouvrent au besoin. On lit ainsi d'un coup
 * d'œil « GPT Image 2 · 3:2 · ×2 » sans parcourir un formulaire.
 */
export function PromptDock({
  catalogue,
  collections,
  pipelines,
  state,
  onChange,
  onSubmit,
  submitting,
  onOpenPicker,
  importing,
  textareaRef,
}: PromptDockProps) {
  const models = catalogue?.models ?? [];
  const model = models.find((entry) => entry.id === state.model);
  const acceptsImages = Boolean(model?.supportsReference);
  const freeSlots = MAX_REFERENCES - state.references.length;

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

  const disabledReason = !state.prompt.trim()
    ? null
    : model && !model.available
      ? model.reason
      : null;
  const canSubmit =
    Boolean(state.prompt.trim()) && !submitting && !(model && !model.available);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-xl supports-[backdrop-filter]:bg-card/85">
      {/* ─── Images de départ ─────────────────────────── */}
      <AnimatePresence initial={false}>
      {(state.references.length > 0 || importing) && (
        <motion.div
          key="tray"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
        <ReferenceTray
          references={state.references}
          importing={importing}
          canAdd={freeSlots > 0}
          onAdd={() => onOpenPicker("uploads")}
          onChange={(references) => onChange({ references })}
        />
        </motion.div>
      )}
      </AnimatePresence>

      {/* ─── Prompt ───────────────────────────────────── */}
      <div className="px-4 pt-3">
        <label htmlFor="dock-prompt" className="sr-only">
          Description de l&apos;image
        </label>
        <Textarea
          id="dock-prompt"
          ref={textareaRef}
          autoFocus
          rows={1}
          placeholder={
            state.references.some((reference) => reference.role === "edit-target")
              ? "Décrivez ce qui doit changer dans l'image…"
              : "Décrivez l'image à créer : un phare isolé au crépuscule, mer d'huile, lumière rasante…"
          }
          value={state.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          className="max-h-56 min-h-12 resize-none border-0 bg-transparent px-0 py-1 text-[15px] leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>

      {disabledReason && (
        <p className="px-4 pb-1 text-xs text-destructive">{disabledReason}</p>
      )}

      {/* ─── Réglages et lancement ────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 px-2.5 pt-1 pb-2.5">
        <ImageSourceMenu
          disabled={!acceptsImages || freeSlots <= 0}
          disabledHint={
            !acceptsImages
              ? `${model?.label ?? "Ce moteur"} ne prend pas d'image de départ`
              : "Quatre images au maximum"
          }
          onOpenPicker={onOpenPicker}
        />

        <span aria-hidden className="mx-1 h-5 w-px bg-border" />

        <ModelPicker
          models={models}
          model={model}
          onSelect={(id) => onChange({ model: id })}
        />
        <AspectPicker
          sizes={model?.sizes ?? [state.size]}
          size={state.size}
          onSelect={(size) => onChange({ size })}
        />
        {model?.qualities?.length ? (
          <QualityPicker
            qualities={model.qualities}
            value={state.quality}
            onSelect={(quality) => onChange({ quality })}
          />
        ) : null}
        <CountPicker
          count={state.count}
          maxBatch={model?.maxBatch ?? 4}
          onSelect={(count) => onChange({ count })}
        />
        <StylePicker
          prompt={state.prompt}
          onChange={(prompt) => onChange({ prompt })}
        />
        <AdvancedSettings
          state={state}
          collections={collections}
          pipelines={pipelines}
          onChange={onChange}
        />

        <div className="ml-auto flex items-center gap-3 pl-2">
          <KbdGroup className="hidden text-muted-foreground lg:inline-flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>↵</Kbd>
          </KbdGroup>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="h-9 gap-2 rounded-xl px-4"
          >
            {submitting ? (
              <Spinner className="h-4 w-4" />
            ) : state.pipelineId ? (
              <Workflow className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {state.pipelineId ? "Lancer le pipeline" : "Générer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Pastille de réglage ─────────────────────────────────────────

function DockChip({
  active,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "data-[state=open]:bg-muted data-[state=open]:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── Images de départ ────────────────────────────────────────────

function ImageSourceMenu({
  disabled,
  disabledHint,
  onOpenPicker,
}: {
  disabled: boolean;
  disabledHint: string;
  onOpenPicker: (source: PickerSource) => void;
}) {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <DockChip disabled aria-label="Joindre une image">
              <ImagePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Image</span>
            </DockChip>
          </span>
        </TooltipTrigger>
        <TooltipContent>{disabledHint}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DockChip aria-label="Joindre une image">
          <ImagePlus className="h-4 w-4" />
          <span className="hidden sm:inline">Image</span>
        </DockChip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Joindre une image de départ
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onOpenPicker("uploads")}>
          <CloudUpload className="mr-2 h-4 w-4" />
          Depuis mes uploads
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenPicker("studio")}>
          <Sparkles className="mr-2 h-4 w-4" />
          Depuis le studio
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenPicker("device")}>
          <HardDrive className="mr-2 h-4 w-4" />
          Depuis l&apos;ordinateur
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenPicker("link")}>
          <Link2 className="mr-2 h-4 w-4" />
          Depuis un lien
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
          Astuce : glissez une image n&apos;importe où sur la page, ou
          collez-la avec Ctrl + V.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReferenceTray({
  references,
  importing,
  canAdd,
  onAdd,
  onChange,
}: {
  references: ComposerReference[];
  importing: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onChange: (references: ComposerReference[]) => void;
}) {
  return (
    <div className="relative flex items-end gap-2 overflow-x-auto border-b bg-muted/30 px-3 py-2.5 sm:gap-2.5 sm:px-4 sm:py-3">
      <AnimatePresence initial={false} mode="popLayout">
      {references.map((reference, index) => {
        const editing = reference.role === "edit-target";
        return (
          <motion.figure
            key={reference.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="group w-14 shrink-0 sm:w-[72px]"
          >
            <div className="relative h-14 w-14 overflow-hidden rounded-xl border bg-background shadow-sm sm:h-[72px] sm:w-[72px]">
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
                  onChange(references.filter((_, position) => position !== index))
                }
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      references.map((entry, position) =>
                        position === index
                          ? { ...entry, role: editing ? "reference" : "edit-target" }
                          : entry
                      )
                    )
                  }
                  className={cn(
                    "mt-1.5 w-full rounded-md py-0.5 text-[10px] font-medium transition-colors",
                    editing
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground ring-1 ring-border hover:text-foreground"
                  )}
                >
                  {editing ? "Retouche" : "Inspiration"}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-56">
                {editing
                  ? "L'image est retouchée : composition conservée, seul ce que décrit le prompt change. Cliquez pour s'en inspirer à la place."
                  : "L'image sert d'inspiration (style, sujet). Cliquez pour la retoucher directement."}
              </TooltipContent>
            </Tooltip>
          </motion.figure>
        );
      })}
      </AnimatePresence>

      {importing && (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center self-start rounded-xl border border-dashed sm:h-[72px] sm:w-[72px]">
          <Spinner className="h-4 w-4" />
        </div>
      )}

      {canAdd && !importing && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Ajouter une image"
          className="flex h-14 w-14 shrink-0 items-center justify-center self-start rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:h-[72px] sm:w-[72px]"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Moteur ──────────────────────────────────────────────────────

function ModelPicker({
  models,
  model,
  onSelect,
}: {
  models: ModelAvailability[];
  model?: ModelAvailability;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(
    () =>
      [
        {
          label: "Comptes connectés",
          icon: Cpu,
          entries: models.filter((entry) => entry.billing === "subscription"),
        },
        {
          label: "Clés API",
          icon: KeyRound,
          entries: models.filter((entry) => entry.billing === "api-key"),
        },
      ].filter((group) => group.entries.length > 0),
    [models]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockChip active aria-label="Choisir le moteur">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              model?.available ? "bg-emerald-500" : "bg-destructive"
            )}
          />
          <span className="max-w-40 truncate">{model?.label ?? "Moteur"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </DockChip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[22rem] p-1.5">
        {groups.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            Aucun moteur détecté. Configurez-en un dans l&apos;onglet Moteurs.
          </p>
        )}
        <div className="max-h-[55vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label} className="py-1">
              <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                <group.icon className="h-3 w-3" />
                {group.label}
              </p>
              {group.entries.map((entry) => {
                const selected = entry.id === model?.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={!entry.available}
                    onClick={() => onSelect(entry.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                      selected ? "bg-primary/10" : "hover:bg-muted",
                      !entry.available && "cursor-not-allowed opacity-60 hover:bg-transparent"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {selected && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{entry.label}</span>
                        <span
                          className={cn(
                            "shrink-0 text-[10px]",
                            entry.available ? "text-muted-foreground" : "text-destructive"
                          )}
                        >
                          {entry.available ? entry.accessLabel : "indisponible"}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                        {!entry.available && entry.reason ? entry.reason : entry.description}
                      </span>
                      {entry.tags.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Format ──────────────────────────────────────────────────────

/** Petit rectangle aux proportions du format, lisible avant le chiffre. */
function RatioGlyph({ size, box = 14 }: { size: string; box?: number }) {
  const ratio = aspectRatioOf(size);
  const width = ratio >= 1 ? box : Math.max(4, Math.round(box * ratio));
  const height = ratio >= 1 ? Math.max(4, Math.round(box / ratio)) : box;
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: box, height: box }}
    >
      <span
        className="rounded-[2px] border-[1.5px] border-current"
        style={{ width, height }}
      />
    </span>
  );
}

/** Palier de définition, d'après le plus grand côté. */
function tierOf(size: string): string {
  const longest = Math.max(...size.split("x").map(Number));
  if (longest > 2600) return "4K";
  if (longest > 1600) return "2K";
  return "Standard";
}

function AspectPicker({
  sizes,
  size,
  onSelect,
}: {
  sizes: string[];
  size: string;
  onSelect: (size: string) => void;
}) {
  // Un même ratio existe souvent en plusieurs définitions : on les range par
  // palier pour ne pas afficher deux « 1:1 » indiscernables côte à côte.
  const tiers = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const entry of sizes) {
      const tier = tierOf(entry);
      groups.set(tier, [...(groups.get(tier) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [sizes]);
  const multipleTiers = tiers.length > 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockChip aria-label="Choisir le format">
          <RatioGlyph size={size} />
          {ratioLabel(size)}
          {multipleTiers && tierOf(size) !== "Standard" && (
            <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
              {tierOf(size)}
            </span>
          )}
        </DockChip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-auto max-w-[22rem] p-2">
        <div className="flex flex-col gap-2">
          {tiers.map(([tier, entries]) => (
            <section key={tier}>
              <p className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
                {multipleTiers ? tier : "Format"}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {entries.map((entry) => {
                  const selected = entry === size;
                  return (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => onSelect(entry)}
                      className={cn(
                        "flex w-24 flex-col items-center gap-1.5 rounded-lg border px-2 pt-3 pb-2 transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <RatioGlyph size={entry} box={24} />
                      <span className="text-xs font-medium">{ratioLabel(entry)}</span>
                      <span className="font-mono text-[10px] opacity-60">
                        {entry.replace("x", "×")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Qualité et nombre ───────────────────────────────────────────

function QualityPicker({
  qualities,
  value,
  onSelect,
}: {
  qualities: { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const current = qualities.find((quality) => quality.value === value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockChip aria-label="Choisir la qualité">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {current?.label ?? "Qualité"}
        </DockChip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-48 p-1.5">
        <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">Qualité</p>
        {qualities.map((quality) => (
          <button
            key={quality.value}
            type="button"
            onClick={() => onSelect(quality.value)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            {quality.label}
            {quality.value === value && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function CountPicker({
  count,
  maxBatch,
  onSelect,
}: {
  count: number;
  maxBatch: number;
  onSelect: (count: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Nombre d'images"
      className="inline-flex h-8 items-center rounded-lg bg-muted/60 p-0.5"
    >
      {COUNT_CHOICES.map((choice) => {
        const selected = count === choice;
        const allowed = choice <= maxBatch;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!allowed}
            title={allowed ? `${choice} image(s)` : `Ce moteur rend au plus ${maxBatch} image(s)`}
            onClick={() => onSelect(choice)}
            className={cn(
              "h-7 min-w-8 rounded-md px-2 text-xs font-medium tabular-nums transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              !allowed && "opacity-30"
            )}
          >
            ×{choice}
          </button>
        );
      })}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

function StylePicker({
  prompt,
  onChange,
}: {
  prompt: string;
  onChange: (prompt: string) => void;
}) {
  const active = PRESETS.filter((preset) => prompt.includes(preset.fragment));

  // Un style se retire comme il s'ajoute : on enlève son fragment et la
  // virgule qui le séparait du reste.
  const toggle = (fragment: string) => {
    if (prompt.includes(fragment)) {
      onChange(
        prompt
          .replace(`, ${fragment}`, "")
          .replace(`${fragment}, `, "")
          .replace(fragment, "")
          .trim()
      );
      return;
    }
    const trimmed = prompt.trim();
    onChange(trimmed ? `${trimmed}, ${fragment}` : fragment);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockChip active={active.length > 0} aria-label="Ajouter un style">
          <Palette className="h-3.5 w-3.5" />
          {active.length === 0
            ? "Style"
            : active.length === 1
              ? active[0].label
              : `${active.length} styles`}
        </DockChip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-3">
        <p className="pb-2 text-[11px] font-medium text-muted-foreground">
          Ajoute un fragment de style au prompt
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const selected = prompt.includes(preset.fragment);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => toggle(preset.fragment)}
                title={preset.fragment}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                {selected && <Check className="h-3 w-3" />}
                {preset.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Réglages avancés ────────────────────────────────────────────

function AdvancedSettings({
  state,
  collections,
  pipelines,
  onChange,
}: {
  state: ComposerState;
  collections: Collection[];
  pipelines: Pipeline[];
  onChange: (next: Partial<ComposerState>) => void;
}) {
  const collection = collections.find((entry) => entry.id === state.collectionId);
  const pipeline = pipelines.find((entry) => entry.id === state.pipelineId);
  const activeCount = [
    state.negativePrompt.trim(),
    state.seed,
    state.notes.trim(),
    collection,
    pipeline,
  ].filter(Boolean).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <DockChip active={activeCount > 0} aria-label="Réglages avancés">
          <Layers className="h-3.5 w-3.5" />
          {collection ? (
            <span className="max-w-28 truncate">{collection.name}</span>
          ) : (
            "Avancé"
          )}
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </DockChip>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <section className="space-y-1.5">
            <label htmlFor="dock-negative" className="text-xs font-medium">
              À éviter
            </label>
            <Textarea
              id="dock-negative"
              rows={2}
              placeholder="texte, filigrane, mains déformées…"
              value={state.negativePrompt}
              onChange={(event) => onChange({ negativePrompt: event.target.value })}
              className="min-h-14 resize-none text-xs"
            />
            <div className="flex flex-wrap gap-1">
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
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <section className="space-y-1.5">
              <label htmlFor="dock-collection" className="flex items-center gap-1.5 text-xs font-medium">
                <Layers className="h-3 w-3" />
                Série
              </label>
              <Select
                value={state.collectionId || "none"}
                onValueChange={(value) =>
                  onChange({ collectionId: value === "none" ? "" : value })
                }
              >
                <SelectTrigger id="dock-collection" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {collections.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="space-y-1.5">
              <label htmlFor="dock-seed" className="flex items-center gap-1.5 text-xs font-medium">
                Graine
              </label>
              <Input
                id="dock-seed"
                inputMode="numeric"
                placeholder="aléatoire"
                value={state.seed}
                onChange={(event) =>
                  onChange({ seed: event.target.value.replace(/\D/g, "") })
                }
                className="h-8 font-mono text-xs"
              />
            </section>
          </div>
          {collection && (
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Les repères visuels et le style de la série sont joints
              automatiquement.
            </p>
          )}

          {pipelines.length > 0 && (
            <section className="space-y-1.5">
              <label htmlFor="dock-pipeline" className="flex items-center gap-1.5 text-xs font-medium">
                <Workflow className="h-3 w-3" />
                Pipeline
              </label>
              <Select
                value={state.pipelineId || "none"}
                onValueChange={(value) =>
                  onChange({ pipelineId: value === "none" ? "" : value })
                }
              >
                <SelectTrigger id="dock-pipeline" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Génération simple</SelectItem>
                  {pipelines.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name} ({entry.steps.length} étapes)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}

          <section className="space-y-1.5">
            <label htmlFor="dock-notes" className="text-xs font-medium">
              Notes de style
            </label>
            <Textarea
              id="dock-notes"
              rows={2}
              placeholder="masterpiece, best quality, highly detailed…"
              value={state.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              className="min-h-14 resize-none text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Placées devant chaque prompt de cette session.
            </p>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
