"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterCount } from "@/components/ui/character-count";
import { ColorPicker } from "@/components/ui/color-picker";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from "@/components/ui/input-group";
import { Slider } from "@/components/ui/slider";
import { SliderWithStops } from "@/components/ui/slider-with-stops";
import { cn } from "@/lib/utils";

// ─── Mise en page d'un champ ─────────────────────────────────────

/** Titre d'une section de l'éditeur : un titre et une phrase, sans encadré. */
export function SectionHeading({ title, text }: { title: string; text?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

/** Groupe de réglages à l'intérieur d'une section, séparé par un simple filet. */
export function FieldGroup({ title, text, children, className }: { title?: string; text?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 border-t pt-5 first:border-t-0 first:pt-0", className)}>
      {(title || text) && (
        <div className="space-y-0.5">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {text && <p className="text-xs text-muted-foreground">{text}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Couleurs ────────────────────────────────────────────────────

export { toHex } from "@/components/ui/color-picker";

/** Une pastille qui ouvre le sélecteur commun, et le code hexadécimal modifiable. */
export function ColorField({
  value,
  onChange,
  label,
  compact = false,
  swatches,
  children,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Nom accessible de la pastille. */
  label: string;
  /** Pastille seule, sans le champ du code. */
  compact?: boolean;
  /** Teintes proposées d'un clic : le reste de la palette. */
  swatches?: { color: string; label: string }[];
  /** Ajouté sous le nuancier : le contraste, par exemple. */
  children?: React.ReactNode;
}) {
  return (
    <ColorPicker value={value} onChange={onChange} label={label} showInput={!compact} swatches={swatches}>
      {children}
    </ColorPicker>
  );
}

// ─── Champs avec compteur ────────────────────────────────────────

/** Champ d'une ligne avec le compteur de sa limite au bout. */
export function CountedInput({ value, maxLength, className, ...props }: Omit<React.ComponentProps<"input">, "value"> & { value: string; maxLength: number }) {
  return (
    <InputGroup className={className}>
      <InputGroupInput value={value} maxLength={maxLength} {...props} />
      <InputGroupAddon align="inline-end">
        <CharacterCount value={value} max={maxLength} />
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Zone de texte avec le compteur de sa limite dessous. */
export function CountedTextarea({ value, maxLength, className, ...props }: Omit<React.ComponentProps<"textarea">, "value"> & { value: string; maxLength: number }) {
  return (
    <InputGroup className={className}>
      <InputGroupTextarea value={value} maxLength={maxLength} className="text-sm" {...props} />
      <InputGroupAddon align="block-end" className="justify-end pt-0">
        <CharacterCount value={value} max={maxLength} />
      </InputGroupAddon>
    </InputGroup>
  );
}

// ─── Curseur avec valeur ─────────────────────────────────────────

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} />
    </div>
  );
}

/** Curseur à paliers : les repères nommés (« 4 % », « 8 s ») disent où l'on en est sans lire la valeur. */
export function SteppedSliderField({
  label,
  value,
  min,
  max,
  step,
  stops,
  format,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  stops: number[];
  format: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{format(value)}</span>
      </div>
      <SliderWithStops
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        stops={stops}
        formatStop={format}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

const frenchNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const formatNumber = (value: number) => frenchNumber.format(value);
export const formatPercent = (value: number) => `${frenchNumber.format(Math.round(value * 100))} %`;
export const formatSeconds = (value: number) => `${frenchNumber.format(value)} s`;

// ─── Listes ──────────────────────────────────────────────────────

/** Liste de phrases modifiables : règles « toujours » et « jamais ». */
export function StringListEditor({
  label,
  items,
  onChange,
  max,
  itemMax,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
  itemMax: number;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const add = () => {
    const value = draft.replace(/\s+/g, " ").trim();
    if (!value || items.length >= max) return;
    onChange([...items, value.slice(0, itemMax)]);
    setDraft("");
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId} className="text-xs font-medium">
        {label}
      </Label>
      <ul className="grid gap-1.5">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.li
              key={index}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5"
            >
              <Input
                aria-label={`${label}, règle ${index + 1}`}
                value={item}
                maxLength={itemMax}
                onChange={(event) => onChange(items.map((entry, position) => (position === index ? event.target.value : entry)))}
                onBlur={(event) => {
                  if (!event.target.value.trim()) onChange(items.filter((_, position) => position !== index));
                }}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Retirer « ${item} »`}
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                <X className="size-4" />
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {items.length < max && (
        <div className="flex items-center gap-1.5">
          <Input
            id={inputId}
            value={draft}
            maxLength={itemMax}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            className="h-8 text-sm"
          />
          <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" aria-label="Ajouter la règle" onClick={add} disabled={!draft.trim()}>
            <Plus className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Confirmation ────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          {/* La variante, pas une classe : passée par asChild, une classe bg-destructive ne l'emporte pas sur bg-primary. */}
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
