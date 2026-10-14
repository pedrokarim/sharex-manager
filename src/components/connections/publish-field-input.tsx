"use client";

/**
 * Dessin d'un champ de publication (`PublishField`) sans connaître le
 * service, avec la pièce qui sert chaque geste : compteur en direct pour un
 * texte limité, jetons pour des tags, bascules pour un choix court (la
 * visibilité), palette avec recherche pour une longue liste (la catégorie),
 * calendrier et heure pour une programmation. La fenêtre de publication de
 * Clip Studio et la modification d'une publication s'en servent toutes deux.
 */

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { countText } from "@/lib/connections/limits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublishField, PublishFieldCondition, PublishFieldRule, TextCount } from "@/lib/connections/types";
import { DateTimePicker } from "./date-time-picker";

export type FieldValue = string | string[] | boolean | undefined;

/** Valeur de départ d'un champ, avant tout préremplissage. */
export function defaultFieldValue(field: PublishField): FieldValue {
  switch (field.kind) {
    case "tags":
      return [];
    case "toggle":
      return field.defaultValue ?? false;
    case "select":
      // Aucun choix d'avance quand le service l'exige (visibilité) : la personne choisit elle-même.
      return field.noDefault ? (field.defaultValue ?? "") : (field.defaultValue ?? field.choices[0]?.value ?? "");
    default:
      return "";
  }
}

/** La condition tient-elle pour ces valeurs ? Une bascule absente vaut « non ». */
export function conditionHolds(condition: PublishFieldCondition, values: Record<string, FieldValue>): boolean {
  const value = values[condition.key];
  return condition.values.some((expected) => (typeof expected === "boolean" ? (value === true) === expected : value === expected));
}

/**
 * Champ à montrer, vérifier et envoyer : sans condition, ou condition remplie.
 * `values` doit être passé par `visibleValues` pour qu'un champ dont le
 * parent est masqué le soit aussi.
 */
export function isFieldVisible(field: PublishField, values: Record<string, FieldValue>): boolean {
  return !field.showWhen || conditionHolds(field.showWhen, values);
}

/**
 * Valeurs des seuls champs affichés, dans l'ordre des champs (un parent
 * avant ses enfants) : un champ masqué compte comme vide pour les
 * conditions, les règles et les déclarations, et ne part pas.
 */
export function visibleValues(fields: PublishField[], values: Record<string, FieldValue>): Record<string, FieldValue> {
  const shown: Record<string, FieldValue> = {};
  for (const field of fields) if (isFieldVisible(field, shown)) shown[field.key] = values[field.key];
  return shown;
}

/** Messages des règles entre champs qui ne sont pas respectées (`values` passées par `visibleValues`). */
export function ruleProblems(rules: PublishFieldRule[] | undefined, values: Record<string, FieldValue>): string[] {
  const problems: string[] = [];
  for (const rule of rules ?? []) {
    if (!conditionHolds(rule.when, values)) continue;
    const anyOfBroken = rule.anyOf && rule.anyOf.length > 0 && !rule.anyOf.some((key) => values[key] === true);
    const value = rule.field ? values[rule.field] : undefined;
    const notValueBroken = Boolean(rule.field && rule.notValues && typeof value === "string" && rule.notValues.includes(value));
    if (anyOfBroken || notValueBroken) problems.push(rule.message);
  }
  return problems;
}

const utf8 = typeof TextEncoder === "undefined" ? null : new TextEncoder();
export const byteCount = (text: string) => (utf8 ? utf8.encode(text).length : text.length);

/** Longueur des tags telle qu'un service la compte d'ordinaire : séparés par une virgule. */
export const tagsLength = (tags: string[]) => tags.join(",").length;

/**
 * Mesure affichée d'un texte : en octets quand le champ les compte, sinon
 * selon la mesure du service (`limits.text.count`), sinon en caractères.
 */
export function measureField(field: PublishField, text: string, count?: TextCount): { used: number; max: number; unit: "chars" | "bytes" } | null {
  if (field.kind !== "text" && field.kind !== "textarea") return null;
  if (field.maxBytes) return { used: byteCount(text), max: field.maxBytes, unit: "bytes" };
  return { used: countText(text, count ?? "characters"), max: field.maxLength, unit: "chars" };
}

/** Ce qui empêche d'envoyer la valeur d'un champ, ou `null`. */
export function fieldProblem(field: PublishField, value: FieldValue, count?: TextCount): string | null {
  if (field.kind === "text" || field.kind === "textarea") {
    const text = typeof value === "string" ? value : "";
    if (field.kind === "text" && field.required && !text.trim()) return `${field.label} : obligatoire.`;
    const measure = measureField(field, text, count);
    if (measure && measure.used > measure.max) {
      return `${field.label} : ${measure.max.toLocaleString("fr-FR")} ${measure.unit === "bytes" ? "octets" : "caractères"} au plus.`;
    }
  }
  if (field.kind === "tags" && Array.isArray(value) && tagsLength(value) > field.maxTotal) {
    return `${field.label} : ${field.maxTotal.toLocaleString("fr-FR")} caractères au total au plus.`;
  }
  if (field.kind === "select" && field.required && !(typeof value === "string" && field.choices.some((choice) => choice.value === value))) {
    return `${field.label} : choisissez une option.`;
  }
  if (field.kind === "toggle" && field.required && !field.disabled && value !== true) return `${field.label} : à cocher pour envoyer.`;
  if (field.kind === "datetime" && typeof value === "string" && value && new Date(value).getTime() < Date.now() + 60_000) {
    return `${field.label} : la date doit être dans le futur.`;
  }
  return null;
}

/** Compteur « 37/100 » : orange à 90 %, rouge au-delà (texte en plus de la couleur pour un lecteur d'écran). */
export function LimitCounter({ used, max, unit = "chars", className }: { used: number; max: number; unit?: "chars" | "bytes"; className?: string }) {
  const state = used > max ? "over" : used >= max * 0.9 ? "near" : "ok";
  return (
    <span
      data-state={state}
      className={cn(
        "shrink-0 text-xs text-muted-foreground tabular-nums data-[state=near]:text-amber-700 data-[state=over]:font-medium data-[state=over]:text-destructive dark:data-[state=near]:text-amber-400",
        className
      )}
    >
      {used.toLocaleString("fr-FR")}/{max.toLocaleString("fr-FR")}
      {unit === "bytes" ? <span className="text-muted-foreground"> octets</span> : null}
      {state === "over" ? <span className="sr-only">, trop long</span> : null}
    </span>
  );
}

/** Choix courts (visibilité…) en bascules : tout est visible, un clic suffit. */
const SHORT_CHOICES = 4;

export function PublishFieldInput({
  field,
  value,
  onChange,
  idPrefix,
  disabled,
  textCount,
  serverMeasure,
  minDate,
}: {
  field: PublishField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  idPrefix: string;
  disabled?: boolean;
  /** Mesure des textes du service (`limits.text.count`). */
  textCount?: TextCount;
  /** Mesure faite par le serveur quand le service en a une à lui ; affichée si elle diffère. */
  serverMeasure?: { used: number; max: number } | null;
  minDate?: Date;
}) {
  const id = `${idPrefix}-${field.key}`;
  const help = field.help ? <p className="text-xs text-pretty text-muted-foreground">{field.help}</p> : null;

  switch (field.kind) {
    case "text":
    case "textarea": {
      const text = typeof value === "string" ? value : "";
      const measure = measureField(field, text, textCount)!;
      const over = measure.used > measure.max || Boolean(serverMeasure && serverMeasure.used > serverMeasure.max);
      return (
        <div className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <Label htmlFor={id} className="min-w-0">
              {field.label}
              {field.kind === "text" && field.required ? <span className="font-normal text-muted-foreground">(obligatoire)</span> : null}
            </Label>
            <LimitCounter used={measure.used} max={measure.max} unit={measure.unit} />
          </div>
          {field.kind === "text" ? (
            <Input id={id} value={text} onChange={(event) => onChange(event.target.value)} aria-invalid={over || undefined} disabled={disabled} />
          ) : (
            <Textarea
              id={id}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              aria-invalid={over || undefined}
              disabled={disabled}
              rows={6}
              className="max-h-80 min-h-28 [overflow-wrap:anywhere]"
            />
          )}
          {serverMeasure && serverMeasure.used !== measure.used ? (
            <p className={cn("text-xs text-muted-foreground", serverMeasure.used > serverMeasure.max && "text-destructive")}>
              Mesure du service : {serverMeasure.used.toLocaleString("fr-FR")}/{serverMeasure.max.toLocaleString("fr-FR")}
            </p>
          ) : null}
          {help}
        </div>
      );
    }
    case "tags": {
      const tags = Array.isArray(value) ? value : [];
      return (
        <div className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <Label htmlFor={id}>{field.label}</Label>
            <LimitCounter used={tagsLength(tags)} max={field.maxTotal} />
          </div>
          <TagInput id={id} value={tags} onChange={onChange} disabled={disabled} placeholder="Entrée ou virgule pour ajouter" normalize={(tag) => tag.replace(/^#/, "").replace(/\s+/g, " ").trim()} />
          {help}
        </div>
      );
    }
    case "select":
      // Sans choix d'avance : une liste déroulante qui affiche « Choisir » tant que rien n'est pris.
      if (field.noDefault) {
        const current = typeof value === "string" ? value : "";
        return (
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required ? <span className="font-normal text-muted-foreground">(obligatoire)</span> : null}
            </Label>
            <Select value={current || undefined} onValueChange={(next) => onChange(next)} disabled={disabled || field.disabled}>
              <SelectTrigger id={id} className="w-full min-w-0" aria-invalid={(field.required && !current) || undefined}>
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent className="max-w-[min(32rem,calc(100vw-2rem))]">
                {field.choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {help}
          </div>
        );
      }
      return field.choices.length <= SHORT_CHOICES ? (
        <div className="grid min-w-0 gap-1.5">
          <Label id={`${id}-label`}>{field.label}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby={`${id}-label`}
            value={typeof value === "string" ? value : ""}
            onValueChange={(next) => next && onChange(next)}
            disabled={disabled}
            className="flex w-full flex-wrap"
          >
            {field.choices.map((choice) => (
              <ToggleGroupItem key={choice.value} value={choice.value} className="h-auto min-h-9 min-w-min flex-auto px-2 py-1.5 leading-tight whitespace-normal">
                {choice.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {help}
        </div>
      ) : (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={id}>{field.label}</Label>
          <ChoicePalette id={id} choices={field.choices} value={typeof value === "string" ? value : ""} onChange={onChange} disabled={disabled} label={field.label} />
          {help}
        </div>
      );
    case "datetime":
      return (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={id}>{field.label}</Label>
          <DateTimePicker id={id} value={typeof value === "string" ? value : ""} onChange={onChange} disabled={disabled} min={minDate} placeholder="Tout de suite" />
          {help}
        </div>
      );
    case "toggle":
      return (
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="grid min-w-0 gap-0.5">
            <Label htmlFor={id}>{field.label}</Label>
            {help}
          </div>
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} disabled={disabled || field.disabled} />
        </div>
      );
  }
}

/** Longue liste de choix (catégories) : une palette avec recherche plutôt qu'une liste à faire défiler. */
function ChoicePalette({
  id,
  choices,
  value,
  onChange,
  disabled,
  label,
}: {
  id: string;
  choices: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const current = choices.find((choice) => choice.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full min-w-0 justify-between font-normal">
          <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.label ?? "Choisir"}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <Command>
          <CommandInput placeholder={`Chercher : ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {choices.map((choice) => (
                <CommandItem
                  key={choice.value}
                  value={`${choice.label} ${choice.value}`}
                  onSelect={() => {
                    onChange(choice.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", choice.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{choice.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
