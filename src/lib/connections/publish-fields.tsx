"use client";

/**
 * Dessin d'un champ de publication (`PublishField`) sans connaître le service :
 * la fenêtre de publication de Clip Studio et la modification d'une
 * publication dans « Comptes connectés » s'en servent toutes les deux. Un
 * connecteur ajouté plus tard est pris en charge sans toucher à ce fichier.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PublishField } from "./types";
import { byteLength } from "./templates";

export type FieldValue = string | string[] | boolean | undefined;

/** Valeur de départ d'un champ, avant tout préremplissage. */
export function defaultFieldValue(field: PublishField): FieldValue {
  switch (field.kind) {
    case "tags":
      return [];
    case "toggle":
      return field.defaultValue ?? false;
    case "select":
      return field.defaultValue ?? field.choices[0]?.value ?? "";
    default:
      return "";
  }
}

/** « 2026-10-12T18:30 » (heure locale) ↔ ISO. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
}

function Counter({ value, max, unit }: { value: number; max: number; unit?: string }) {
  return (
    <span className={cn("text-[11px] tabular-nums text-muted-foreground", value > max && "text-destructive")}>
      {value.toLocaleString("fr-FR")}/{max.toLocaleString("fr-FR")}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

export function PublishFieldControl({
  field,
  value,
  onChange,
  idPrefix,
  disabled,
}: {
  field: PublishField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  const id = `${idPrefix}-${field.key}`;
  const [tagsText, setTagsText] = useState(() => (Array.isArray(value) ? value.join(", ") : ""));

  // Une valeur changée de l'extérieur (préremplissage) remplace le texte saisi.
  useEffect(() => {
    if (field.kind !== "tags") return;
    const next = Array.isArray(value) ? value : [];
    setTagsText((current) => (parseTags(current).join("\u0000") === next.join("\u0000") ? current : next.join(", ")));
  }, [field.kind, value]);

  const help = field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null;

  switch (field.kind) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      return (
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={id}>{field.label}</Label>
            <Counter value={Array.from(text).length} max={field.maxLength} />
          </div>
          <Input id={id} value={text} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />
          {help}
        </div>
      );
    }
    case "textarea": {
      const text = typeof value === "string" ? value : "";
      return (
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={id}>{field.label}</Label>
            {field.maxBytes ? <Counter value={byteLength(text)} max={field.maxBytes} unit="octets" /> : <Counter value={text.length} max={field.maxLength} />}
          </div>
          <Textarea id={id} value={text} onChange={(event) => onChange(event.target.value)} rows={6} disabled={disabled} className="field-sizing-fixed" />
          {help}
        </div>
      );
    }
    case "tags": {
      const tags = Array.isArray(value) ? value : [];
      return (
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={id}>{field.label}</Label>
            <Counter value={tags.join(",").length} max={field.maxTotal} />
          </div>
          <Input
            id={id}
            value={tagsText}
            placeholder="Séparés par des virgules"
            onChange={(event) => {
              setTagsText(event.target.value);
              onChange(parseTags(event.target.value));
            }}
            disabled={disabled}
          />
          {help}
        </div>
      );
    }
    case "select":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{field.label}</Label>
          <Select value={typeof value === "string" ? value : ""} onValueChange={(next) => onChange(next)} disabled={disabled}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
    case "datetime":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{field.label}</Label>
          <Input
            id={id}
            type="datetime-local"
            value={typeof value === "string" && value ? toLocalInput(value) : ""}
            onChange={(event) => onChange(fromLocalInput(event.target.value))}
            disabled={disabled}
          />
          {help}
        </div>
      );
    case "toggle":
      return (
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-0.5">
            <Label htmlFor={id}>{field.label}</Label>
            {help}
          </div>
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} disabled={disabled} />
        </div>
      );
  }
}
