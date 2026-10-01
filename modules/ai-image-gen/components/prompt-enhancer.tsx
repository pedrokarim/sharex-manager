"use client";

import { useState } from "react";
import { ChevronDown, Undo2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAccountPreference } from "@/hooks/use-account-preference";
import { cn } from "@/lib/utils";
import { callModule } from "../lib/client";
import {
  ENHANCE_BOOSTERS,
  ENHANCE_LEVELS,
  MAX_ENHANCE_INSTRUCTION,
  WRITING_PREFERENCE_SCOPE,
  type EnhanceLevel,
  type WritingPreference,
} from "../lib/enhance-options";

/**
 * Assistant d'écriture du compositeur.
 *
 * Le bouton améliore le prompt avec les réglages retenus par le compte ; la
 * flèche ouvre ces réglages : niveau (corriger, enrichir, sublimer), renforts
 * d'ambiance et demande libre. Le texte d'avant reste récupérable.
 */
export function PromptEnhancer({
  prompt,
  onChange,
}: {
  prompt: string;
  onChange: (prompt: string) => void;
}) {
  const { value: saved, update } = useAccountPreference<WritingPreference>(WRITING_PREFERENCE_SCOPE, {});
  const level: EnhanceLevel = saved.level === 1 || saved.level === 3 ? saved.level : 2;
  const boosters = Array.isArray(saved.boosters) ? saved.boosters.filter((id): id is string => typeof id === "string") : [];

  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  /** Texte d'avant la dernière amélioration, pour revenir en arrière. */
  const [previous, setPrevious] = useState<string | null>(null);

  const current = ENHANCE_LEVELS.find((entry) => entry.level === level)!;
  const canRun = !busy && (prompt.trim().length > 0 || instruction.trim().length > 0);

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const result = await callModule<{ prompt: string }>("enhancePrompt", {
        prompt,
        level,
        boosters,
        instruction: instruction.trim() || undefined,
      });
      setPrevious(prompt);
      onChange(result.prompt);
      setInstruction("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Amélioration impossible");
    } finally {
      setBusy(false);
    }
  };

  const toggleBooster = (id: string) =>
    update({ boosters: boosters.includes(id) ? boosters.filter((entry) => entry !== id) : [...boosters, id] });

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            aria-label={`Améliorer le prompt : ${current.label}`}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-l-lg pr-1.5 pl-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-40"
            )}
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" />}
            {busy ? "Écriture…" : current.label}
            {boosters.length > 0 && !busy && (
              <span className="rounded bg-muted px-1 text-[10px] tabular-nums text-foreground">+{boosters.length}</span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Améliorer le prompt avec l’IA</TooltipContent>
      </Tooltip>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Réglages de l'assistant d'écriture"
            className={cn(
              "inline-flex h-8 w-6 items-center justify-center rounded-r-lg transition-colors",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "data-[state=open]:bg-muted data-[state=open]:text-foreground"
            )}
          >
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-[23rem] space-y-4 p-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Niveau d’amélioration</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Niveau d'amélioration">
              {ENHANCE_LEVELS.map((entry) => (
                <button
                  key={entry.level}
                  type="button"
                  role="radio"
                  aria-checked={entry.level === level}
                  onClick={() => update({ level: entry.level })}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    entry.level === level ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">{current.description}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Renforts{level === 1 ? " (ignorés par « Corriger », qui n’ajoute rien)" : ""}
            </p>
            <div className={cn("flex flex-wrap gap-1.5", level === 1 && "opacity-50")}>
              {ENHANCE_BOOSTERS.map((booster) => {
                const selected = boosters.includes(booster.id);
                return (
                  <button
                    key={booster.id}
                    type="button"
                    aria-pressed={selected}
                    title={booster.hint}
                    onClick={() => toggleBooster(booster.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      selected ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {booster.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="enhance-instruction" className="text-[11px] font-medium text-muted-foreground">
              Demander autre chose à l’IA
            </label>
            <Input
              id="enhance-instruction"
              value={instruction}
              maxLength={MAX_ENHANCE_INSTRUCTION}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void run();
                }
              }}
              placeholder="Ajoute un chat roux, version de nuit, plus de brume…"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-4 text-muted-foreground">Ces choix sont retenus dans votre compte.</p>
            <Button size="sm" className="h-8 gap-1.5" disabled={!canRun} onClick={run}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" />}
              Améliorer
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {previous !== null && previous !== prompt && !busy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Revenir au texte d'avant"
              onClick={() => {
                onChange(previous);
                setPrevious(null);
              }}
              className="ml-0.5 inline-flex h-8 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Revenir au texte d’avant</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
