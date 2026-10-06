"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggestedFormat } from "../../lib/analysis/languages";
import { AUTOMATION_LEVELS, READING_FORMATS, SOURCE_LANGUAGES, TARGET_LANGUAGES, errorMessage } from "../../lib/library-helpers";
import type { AutomationLevel, ChapterSettings, ReadingFormat, SourceLanguage } from "../../lib/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  value: ChapterSettings;
  /** Lève en cas d'échec : la fenêtre reste ouverte. */
  onSave: (settings: ChapterSettings) => Promise<void>;
}

/**
 * Réglages d'un chapitre, ou réglages par défaut d'un dossier : langues,
 * format de lecture, niveau d'automatisation maximal. Les styles de texte,
 * réglés dans l'atelier, sont conservés tels quels.
 */
export function SettingsDialog({ open, onOpenChange, title, description, value, onSave }: SettingsDialogProps) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Une langue cible saisie ailleurs, absente de la liste, reste proposée.
  const targets = useMemo(
    () => (TARGET_LANGUAGES.some((entry) => entry.value === draft.targetLanguage) ? TARGET_LANGUAGES : [...TARGET_LANGUAGES, { value: draft.targetLanguage, label: draft.targetLanguage }]),
    [draft.targetLanguage]
  );
  const format = READING_FORMATS.find((entry) => entry.value === draft.format);

  // Choisir une langue d'origine propose le format qui va le plus souvent avec elle :
  // manga pour le japonais, webtoon pour le coréen, manhua pour le chinois. Il reste modifiable.
  const chooseSource = (sourceLanguage: SourceLanguage) => {
    setDraft({ ...draft, sourceLanguage, format: suggestedFormat(sourceLanguage) ?? draft.format });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement des réglages impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="scan-studio-source">Langue d’origine</Label>
              <Select value={draft.sourceLanguage} onValueChange={(next) => chooseSource(next as SourceLanguage)}>
                <SelectTrigger id="scan-studio-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_LANGUAGES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scan-studio-target">Langue de traduction</Label>
              <Select value={draft.targetLanguage} onValueChange={(next) => setDraft({ ...draft, targetLanguage: next })}>
                <SelectTrigger id="scan-studio-target" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="scan-studio-format">Format de lecture</Label>
            <Select value={draft.format} onValueChange={(next) => setDraft({ ...draft, format: next as ReadingFormat })}>
              <SelectTrigger id="scan-studio-format" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {READING_FORMATS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {format && <p className="text-xs text-muted-foreground">{format.description}</p>}
          </div>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label id="scan-studio-level">Niveau d’automatisation maximal</Label>
              <p className="text-xs text-muted-foreground">Rien ne dépasse ce niveau sans que vous le changiez ici.</p>
            </div>
            <RadioGroup
              aria-labelledby="scan-studio-level"
              value={String(draft.maxLevel)}
              onValueChange={(next) => setDraft({ ...draft, maxLevel: Number(next) as AutomationLevel })}
              className="gap-3"
            >
              {AUTOMATION_LEVELS.map((level) => (
                <div key={level.value} className="flex items-start gap-3">
                  <RadioGroupItem id={`scan-studio-level-${level.value}`} value={String(level.value)} className="mt-0.5" />
                  <Label htmlFor={`scan-studio-level-${level.value}`} className="flex flex-col items-start gap-0.5 font-normal">
                    <span className="font-medium">
                      {level.value} – {level.label}
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">{level.description}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
