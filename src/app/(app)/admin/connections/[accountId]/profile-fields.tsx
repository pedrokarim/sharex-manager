"use client";

/**
 * Éléments du profil d'un compte, dessinés d'après leur déclaration
 * (`ProfileField`) sans connaître le service : éditeur de la valeur
 * proposée, valeur actuelle chez le service, différence lisible, et ligne
 * d'un élément à changer à la main.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronsUpDown, Copy, Download, ExternalLink, KeyRound, Loader2, Plus, RotateCcw, Send, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterCount } from "@/components/ui/character-count";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PROFILE_COUNTRIES,
  PROFILE_LANGUAGES,
  countryLabel,
  formatKeywords,
  languageLabel,
  listDiff,
  wordDiff,
  type DiffPart,
} from "@/lib/connections/profile";
import type { ProfileChoice, ProfileField, ProfileLocalization, ProfileValue } from "@/lib/connections/types";

export type LoadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string };

/** Accès à un élément modifiable pour ce compte. */
export type FieldAccess = { state: "ok" } | { state: "authorize"; href: string } | { state: "role" } | { state: "reconnect" };

// ─── Valeurs ──────────────────────────────────────────────────────

/** Valeur vide d'un élément, selon sa nature. */
export function emptyValue(field: ProfileField): ProfileValue {
  if (field.kind === "keywords") return [];
  if (field.kind === "localizations") return {};
  return "";
}

/** Une valeur vide ne propose rien : la marque ne doit pas effacer ce qui existe. */
export function isEmptyValue(value: ProfileValue | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

const asText = (value: ProfileValue | undefined) => (typeof value === "string" ? value : "");
const asList = (value: ProfileValue | undefined) => (Array.isArray(value) ? value : []);
const asLocalizations = (value: ProfileValue | undefined): Record<string, ProfileLocalization> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

function choiceLabel(choices: ProfileChoice[] | undefined, value: string): string {
  return choices?.find((choice) => choice.value === value)?.label ?? value;
}

/** Libellé lisible d'une valeur simple (langue, pays, vidéo, texte). */
function simpleLabel(field: ProfileField, value: string, choices?: ProfileChoice[]): string {
  if (!value) return field.kind === "video" ? "Aucune" : field.kind === "country" ? "Aucun" : "Vide";
  if (field.kind === "language") return languageLabel(value);
  if (field.kind === "country") return countryLabel(value);
  if (field.kind === "video") return choiceLabel(choices, value);
  return value;
}

// ─── Différence ───────────────────────────────────────────────────

function DiffText({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="max-h-48 min-w-0 overflow-y-auto text-sm break-words whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.kind === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.kind === "added" ? (
          <ins key={index} className="rounded-sm bg-emerald-500/15 text-emerald-800 no-underline dark:text-emerald-300">
            {part.text}
          </ins>
        ) : (
          <del key={index} className="rounded-sm bg-destructive/10 text-destructive">
            {part.text}
          </del>
        )
      )}
    </p>
  );
}

/** Ce qui change, en clair : mots ajoutés et retirés, langues traduites, ancienne et nouvelle valeur. */
export function ValueDiff({ field, before, after, choices }: { field: ProfileField; before: ProfileValue | undefined; after: ProfileValue; choices?: ProfileChoice[] }) {
  const parts = useMemo(
    () => (field.kind === "text" || field.kind === "textarea" || field.kind === "url" ? wordDiff(asText(before), asText(after)) : []),
    [field.kind, before, after]
  );
  if (field.kind === "text" || field.kind === "textarea" || field.kind === "url") return <DiffText parts={parts} />;
  if (field.kind === "keywords") {
    const { added, removed } = listDiff(asList(before), asList(after));
    return (
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {added.map((word) => (
          <Badge key={`+${word}`} variant="outline" className="max-w-full border-emerald-500/40 text-emerald-800 dark:text-emerald-300">
            <Plus aria-hidden />
            <span className="truncate" title={word}>
              {word}
            </span>
          </Badge>
        ))}
        {removed.map((word) => (
          <Badge key={`-${word}`} variant="outline" className="max-w-full border-destructive/40 text-destructive">
            <X aria-hidden />
            <span className="truncate line-through" title={word}>
              {word}
            </span>
          </Badge>
        ))}
        {added.length === 0 && removed.length === 0 ? <span className="text-sm text-muted-foreground">Même liste, dans un autre ordre.</span> : null}
      </div>
    );
  }
  if (field.kind === "localizations") {
    const old = asLocalizations(before);
    const next = asLocalizations(after);
    const languages = [...new Set([...Object.keys(old), ...Object.keys(next)])];
    const lines = languages
      .map((language) => {
        if (!old[language]) return { language, label: "ajoutée" };
        if (!next[language]) return { language, label: "retirée" };
        const same = old[language].title === next[language].title && old[language].description.trim() === next[language].description.trim();
        return same ? null : { language, label: "modifiée" };
      })
      .filter((line): line is { language: string; label: string } => Boolean(line));
    return (
      <ul className="grid min-w-0 gap-0.5 text-sm">
        {lines.map((line) => (
          <li key={line.language} className="min-w-0 break-words">
            <span className="font-medium">{languageLabel(line.language)}</span> <span className="text-muted-foreground">{line.label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <del className="min-w-0 break-words text-destructive">{simpleLabel(field, asText(before), choices)}</del>
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <ins className="min-w-0 break-words text-emerald-800 no-underline dark:text-emerald-300">{simpleLabel(field, asText(after), choices)}</ins>
    </p>
  );
}

// ─── Valeur actuelle ──────────────────────────────────────────────

/** Valeur actuelle chez le service, en lecture seule. */
export function CurrentValue({ field, value, choices }: { field: ProfileField; value: ProfileValue | undefined; choices?: ProfileChoice[] }) {
  if (value === undefined) return <p className="text-sm text-muted-foreground italic">Non lue</p>;
  if (field.kind === "image") {
    const url = asText(value);
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element -- image servie par le service
      <img src={url} alt="" referrerPolicy="no-referrer" className={cn("max-w-full bg-muted object-cover", field.imageFormat === "avatar" ? "size-16 rounded-full" : "aspect-[3/1] w-full max-w-sm rounded-md")} />
    ) : (
      <p className="text-sm text-muted-foreground italic">Aucune</p>
    );
  }
  if (field.kind === "keywords") {
    const list = asList(value);
    if (list.length === 0) return <p className="text-sm text-muted-foreground italic">Aucun</p>;
    return (
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {list.map((word) => (
          <Badge key={word} variant="secondary" className="max-w-full">
            <span className="truncate" title={word}>
              {word}
            </span>
          </Badge>
        ))}
      </div>
    );
  }
  if (field.kind === "localizations") {
    const entries = Object.entries(asLocalizations(value));
    if (entries.length === 0) return <p className="text-sm text-muted-foreground italic">Aucune traduction</p>;
    return (
      <ul className="grid min-w-0 gap-1.5 text-sm">
        {entries.map(([language, entry]) => (
          <li key={language} className="min-w-0">
            <span className="font-medium">{languageLabel(language)}</span>
            <span className="block truncate" title={entry.title}>
              {entry.title || <span className="text-muted-foreground italic">sans nom</span>}
            </span>
            {entry.description ? (
              <span className="line-clamp-2 text-xs break-words text-muted-foreground" title={entry.description}>
                {entry.description}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  const text = asText(value);
  if (field.kind === "text" || field.kind === "textarea" || field.kind === "url") {
    return text ? (
      <p className="max-h-48 min-w-0 overflow-y-auto text-sm break-words whitespace-pre-wrap">{text}</p>
    ) : (
      <p className="text-sm text-muted-foreground italic">Vide</p>
    );
  }
  return <p className={cn("min-w-0 text-sm break-words", !text && "text-muted-foreground italic")}>{simpleLabel(field, text, choices)}</p>;
}

// ─── Éditeurs ─────────────────────────────────────────────────────

function LanguageSelect({ id, value, onChange, disabled, exclude = [], placeholder }: { id?: string; value: string; onChange: (value: string) => void; disabled?: boolean; exclude?: string[]; placeholder?: string }) {
  const options = useMemo(() => {
    const codes = new Set<string>(PROFILE_LANGUAGES);
    if (value) codes.add(value);
    return [...codes].filter((code) => code === value || !exclude.includes(code)).map((code) => ({ code, label: languageLabel(code) })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [value, exclude]);
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue placeholder={placeholder ?? "Choisir une langue"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CountrySelect({ id, value, onChange, disabled, clearable }: { id?: string; value: string; onChange: (value: string) => void; disabled?: boolean; clearable?: boolean }) {
  const options = useMemo(() => PROFILE_COUNTRIES.map((code) => ({ code, label: countryLabel(code) })).sort((a, b) => a.label.localeCompare(b.label, "fr")), []);
  return (
    <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {clearable || !value ? <SelectItem value="none">Aucun</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Choix d'une vidéo du compte, avec recherche ; la liste est lue à la première ouverture. */
function VideoPicker({
  id,
  value,
  onChange,
  disabled,
  clearable,
  choices,
  onLoad,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  clearable?: boolean;
  choices: LoadState<ProfileChoice[]> | undefined;
  onLoad: () => void;
}) {
  const [open, setOpen] = useState(false);
  const list = choices?.status === "ready" ? choices.data : undefined;
  const selected = list?.find((choice) => choice.value === value);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !choices) onLoad();
      }}
    >
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full min-w-0 justify-between gap-2 font-normal">
          <span className={cn("min-w-0 truncate", !value && "text-muted-foreground")} title={selected?.label ?? value}>
            {value ? (selected?.label ?? value) : "Aucune vidéo"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Chercher une vidéo…" />
          <CommandList className="max-h-72">
            {choices?.status === "loading" || !choices ? (
              <div className="grid gap-2 p-2" aria-hidden>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : choices.status === "error" ? (
              <div className="grid gap-2 p-3 text-sm">
                <p className="text-destructive">{choices.error}</p>
                <div>
                  <Button type="button" size="sm" variant="outline" onClick={onLoad}>
                    Réessayer
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <CommandEmpty>Aucune vidéo publique ou non répertoriée.</CommandEmpty>
                <CommandGroup>
                  {clearable ? (
                    <CommandItem
                      value="__none"
                      keywords={["aucune"]}
                      onSelect={() => {
                        onChange("");
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                      Aucune vidéo
                    </CommandItem>
                  ) : null}
                  {choices.data.map((choice) => (
                    <CommandItem
                      key={choice.value}
                      value={choice.value}
                      keywords={[choice.label]}
                      onSelect={() => {
                        onChange(choice.value);
                        setOpen(false);
                      }}
                      className="min-w-0 gap-2"
                    >
                      <Check className={cn("size-4 shrink-0", value === choice.value ? "opacity-100" : "opacity-0")} />
                      {choice.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniature servie par le service
                        <img src={choice.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="aspect-video w-16 shrink-0 rounded-sm bg-muted object-cover" />
                      ) : null}
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate" title={choice.label}>
                          {choice.label}
                        </span>
                        {choice.detail ? <span className="truncate text-xs text-muted-foreground">{choice.detail}</span> : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Traductions : une ligne par langue, nom et description, ajout et retrait animés. */
function LocalizationsEditor({ field, value, onChange, disabled }: { field: ProfileField; value: Record<string, ProfileLocalization>; onChange: (value: Record<string, ProfileLocalization>) => void; disabled?: boolean }) {
  const entries = Object.entries(value);
  const set = (language: string, patch: Partial<ProfileLocalization>) => onChange({ ...value, [language]: { ...value[language], ...patch } });
  const remove = (language: string) => {
    const next = { ...value };
    delete next[language];
    onChange(next);
  };
  return (
    <div className="grid min-w-0 gap-3">
      <ul className="grid min-w-0 gap-3">
        <AnimatePresence initial={false}>
          {entries.map(([language, entry]) => (
            <motion.li
              key={language}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid min-w-0 gap-1.5 overflow-hidden"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-medium">{languageLabel(language)}</span>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Retirer la traduction en ${languageLabel(language)}`} disabled={disabled} onClick={() => remove(language)}>
                  <X />
                </Button>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  aria-label={`Nom en ${languageLabel(language)}`}
                  value={entry.title}
                  disabled={disabled}
                  onChange={(event) => set(language, { title: event.target.value })}
                  placeholder="Nom traduit"
                  className="min-w-0"
                />
                {field.itemLimits?.title ? <CharacterCount value={entry.title} max={field.itemLimits.title} /> : null}
              </div>
              <Textarea
                aria-label={`Description en ${languageLabel(language)}`}
                rows={3}
                value={entry.description}
                disabled={disabled}
                onChange={(event) => set(language, { description: event.target.value })}
                placeholder="Description traduite"
                className="max-h-60 min-w-0"
              />
              {field.itemLimits?.description ? (
                <div className="flex justify-end">
                  <CharacterCount value={entry.description} max={field.itemLimits.description} />
                </div>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {entries.length === 0 ? <p className="text-sm text-muted-foreground">Aucune traduction.</p> : null}
      <div className="max-w-full sm:max-w-64">
        {/* Remonté à chaque ajout : le choix précédent ne reste pas affiché. */}
        <LanguageSelect
          key={entries.length}
          value=""
          exclude={Object.keys(value)}
          disabled={disabled}
          placeholder="Ajouter une langue…"
          onChange={(language) => onChange({ ...value, [language]: { title: "", description: "" } })}
        />
      </div>
    </div>
  );
}

/** Éditeur de la valeur proposée, selon la nature de l'élément. */
export function FieldEditor({
  field,
  value,
  onChange,
  disabled,
  choices,
  onLoadChoices,
}: {
  field: ProfileField;
  value: ProfileValue;
  onChange: (value: ProfileValue) => void;
  disabled?: boolean;
  choices?: LoadState<ProfileChoice[]>;
  onLoadChoices: () => void;
}) {
  const id = `profile-${field.key}`;
  switch (field.kind) {
    case "text":
    case "url":
      return (
        <div className="flex min-w-0 items-center gap-2">
          <Input id={id} value={asText(value)} disabled={disabled} type={field.kind === "url" ? "url" : "text"} inputMode={field.kind === "url" ? "url" : undefined} onChange={(event) => onChange(event.target.value)} className="min-w-0" />
          {field.maxLength ? <CharacterCount value={asText(value)} max={field.maxLength} /> : null}
        </div>
      );
    case "textarea":
      return (
        <div className="grid min-w-0 gap-1">
          <Textarea id={id} rows={4} value={asText(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="max-h-80 min-w-0" />
          {field.maxLength ? (
            <div className="flex justify-end">
              <CharacterCount value={asText(value)} max={field.maxLength} />
            </div>
          ) : null}
        </div>
      );
    case "keywords":
      return (
        <div className="grid min-w-0 gap-1">
          <TagInput id={id} value={asList(value)} disabled={disabled} onChange={onChange} normalize={(tag) => tag.replace(/["<>]/g, "").replace(/\s+/g, " ").trim()} placeholder="Ajouter un mot-clé…" />
          {field.maxLength ? (
            <div className="flex justify-end">
              <CharacterCount value={formatKeywords(asList(value))} max={field.maxLength} title="Longueur de la liste telle que le service la compte" />
            </div>
          ) : null}
        </div>
      );
    case "language":
      return <LanguageSelect id={id} value={asText(value)} onChange={onChange} disabled={disabled} />;
    case "country":
      return <CountrySelect id={id} value={asText(value)} onChange={onChange} disabled={disabled} clearable={field.clearable} />;
    case "video":
      return <VideoPicker id={id} value={asText(value)} onChange={onChange} disabled={disabled} clearable={field.clearable} choices={choices} onLoad={onLoadChoices} />;
    case "localizations":
      return <LocalizationsEditor field={field} value={asLocalizations(value)} onChange={onChange} disabled={disabled} />;
    case "image":
      return null;
  }
}

// ─── Ligne d'un élément modifiable ────────────────────────────────

export interface EditableRowProps {
  field: ProfileField;
  serviceLabel: string;
  /** Valeur chez le service : `undefined` tant qu'elle n'est pas lue. */
  current: ProfileValue | undefined;
  currentState: "loading" | "ready" | "error" | "none";
  proposed: ProfileValue;
  /** Valeur de la marque, quand elle en propose une. */
  brandValue?: ProfileValue;
  changed: boolean;
  error: string | null;
  access: FieldAccess;
  sending: boolean;
  choices?: LoadState<ProfileChoice[]>;
  onLoadChoices: () => void;
  onChange: (value: ProfileValue) => void;
  onUseBrand: () => void;
  onKeepCurrent: () => void;
  onSend: () => void;
}

function AccessNote({ access, serviceLabel }: { access: FieldAccess; serviceLabel: string }) {
  if (access.state === "ok") return null;
  if (access.state === "authorize") {
    return (
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href={access.href}>
          <KeyRound />
          Autoriser…
        </a>
      </Button>
    );
  }
  return (
    <span className="text-xs text-pretty text-amber-700 dark:text-amber-400">
      {access.state === "reconnect" ? "Compte à reconnecter." : `Le rôle de ce compte chez ${serviceLabel} ne permet pas de le modifier.`}
    </span>
  );
}

export function EditableFieldRow(props: EditableRowProps) {
  const { field, serviceLabel, current, currentState, proposed, brandValue, changed, error, access, sending, choices } = props;
  const fromBrand = brandValue !== undefined && !isEmptyValue(brandValue);
  const differsFromBrand = fromBrand && JSON.stringify(brandValue) !== JSON.stringify(proposed);
  const canSend = access.state === "ok" && changed && !error && currentState === "ready" && !sending;
  const status =
    currentState === "loading" ? null : currentState !== "ready" ? null : changed ? (
      <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-300">
        À envoyer
      </Badge>
    ) : (
      <Badge variant="secondary" className="gap-1">
        <Check aria-hidden />
        À jour
      </Badge>
    );

  return (
    <div className="grid min-w-0 gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="min-w-0 text-sm font-medium break-words">{field.label}</h4>
          {status}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {differsFromBrand ? (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={sending} onClick={props.onUseBrand}>
              <RotateCcw />
              Reprendre la marque
            </Button>
          ) : null}
          {changed && currentState === "ready" ? (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={sending} onClick={props.onKeepCurrent}>
              <Undo2 />
              Garder l’actuel
            </Button>
          ) : null}
          {access.state === "ok" ? (
            <Button type="button" size="sm" className="gap-1.5" disabled={!canSend} onClick={props.onSend}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Envoyer
            </Button>
          ) : (
            <AccessNote access={access} serviceLabel={serviceLabel} />
          )}
        </div>
      </div>
      {field.help ? <p className="-mt-1.5 text-xs text-pretty text-muted-foreground">{field.help}</p> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-1.5">
          <span className="text-xs text-muted-foreground">Actuellement chez {serviceLabel}</span>
          {currentState === "loading" ? (
            <div className="grid gap-1.5" aria-hidden>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : currentState === "error" || currentState === "none" ? (
            <p className="text-sm text-muted-foreground italic">Non lue</p>
          ) : (
            <CurrentValue field={field} value={current ?? emptyValue(field)} choices={choices?.status === "ready" ? choices.data : undefined} />
          )}
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <label htmlFor={`profile-${field.key}`} className="text-xs text-muted-foreground">
            {fromBrand && !differsFromBrand ? "Proposé par la marque" : "Proposé"}
          </label>
          <FieldEditor field={field} value={proposed} onChange={props.onChange} disabled={sending || access.state === "reconnect"} choices={choices} onLoadChoices={props.onLoadChoices} />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {changed && currentState === "ready" ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid min-w-0 gap-1.5 overflow-hidden">
            <span className="text-xs text-muted-foreground">Ce qui change</span>
            <div className="min-w-0 rounded-md bg-muted/50 px-3 py-2">
              <ValueDiff field={field} before={current ?? emptyValue(field)} after={proposed} choices={choices?.status === "ready" ? choices.data : undefined} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ─── Ligne d'un élément à changer chez le service ─────────────────

/** Bouton de copie d'un texte, avec retour visible. */
export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Copie impossible : sélectionnez le texte et copiez-le à la main.");
        }
      }}
    >
      {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
      {copied ? "Copié" : label}
    </Button>
  );
}

export function ManualFieldRow({
  field,
  serviceLabel,
  current,
  currentState,
  brandText,
  brandImage,
  link,
  downloading,
  onDownload,
}: {
  field: ProfileField;
  serviceLabel: string;
  current: ProfileValue | undefined;
  currentState: "loading" | "ready" | "error" | "none";
  /** Texte fourni par la marque, à copier. */
  brandText: string;
  /** Aperçu de l'image de la marque (dernier export), quand l'élément est une image. */
  brandImage?: string;
  /** Page du service où le faire. */
  link: string | null;
  downloading: boolean;
  /** Absent : pas d'image à télécharger (aucune marque). */
  onDownload?: () => void;
}) {
  const reason = field.manual?.reason ?? `${serviceLabel} ne permet pas de le changer par son API.`;
  const hasCurrent = currentState === "ready" && current !== undefined && !isEmptyValue(current);
  const isImage = field.kind === "image";
  return (
    <div className="grid min-w-0 gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h4 className="min-w-0 text-sm font-medium break-words">{field.label}</h4>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {isImage && onDownload ? (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={downloading} onClick={onDownload}>
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              Télécharger
            </Button>
          ) : null}
          {!isImage && brandText ? <CopyButton text={brandText} /> : null}
          {link ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <a href={link} target="_blank" rel="noreferrer noopener">
                    <ExternalLink />
                    Ouvrir
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{field.manual?.linkLabel ?? `Ouvrir ${serviceLabel}`}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">{reason}</p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-1.5">
          <span className="text-xs text-muted-foreground">Actuellement chez {serviceLabel}</span>
          {currentState === "loading" ? (
            <Skeleton className={isImage ? "size-16 rounded-full" : "h-4 w-2/3"} aria-hidden />
          ) : hasCurrent ? (
            <CurrentValue field={field} value={current} />
          ) : (
            <p className="text-sm text-muted-foreground italic">{currentState === "ready" ? "Non rendu par l’API" : "Non lu"}</p>
          )}
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <span className="text-xs text-muted-foreground">Depuis la marque</span>
          {isImage ? (
            brandImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- format exporté par la marque
              <img
                src={brandImage}
                alt=""
                className={cn("max-w-full bg-muted object-cover", field.imageFormat === "avatar" ? "size-16 rounded-full" : "aspect-[3/1] w-full max-w-sm rounded-md")}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{onDownload ? "Rendue depuis la marque au téléchargement." : "Aucune marque choisie."}</p>
            )
          ) : brandText ? (
            <p className="max-h-40 min-w-0 overflow-y-auto text-sm break-words whitespace-pre-wrap">{brandText}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">{field.brand ? "Vide dans la marque" : "Rien à proposer"}</p>
          )}
          {!isImage && brandText && field.maxLength ? (
            <div>
              <CharacterCount value={brandText} max={field.maxLength} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
