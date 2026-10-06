"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { VISIBILITY_OPTIONS, countLabel, errorMessage } from "../../lib/library-helpers";
import type { ChapterVisibility } from "../../lib/types";

interface VisibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  value: ChapterVisibility;
  /**
   * Pages qui seraient lues en public : exportées, et pas « laissées telles
   * quelles ». Absent : la fenêtre règle un défaut (dossier), pas un chapitre.
   */
  publishablePages?: number;
  /** Adresse de lecture publique du chapitre, s'il est déjà public. */
  publicPath?: string;
  /** Lève en cas d'échec : la fenêtre reste ouverte. */
  onSave: (visibility: ChapterVisibility) => Promise<void>;
}

/**
 * Visibilité d'un chapitre, ou visibilité donnée aux nouveaux chapitres d'un
 * dossier : privé, public par son lien, listé au catalogue. Rien ne devient
 * public sans le bouton de cette fenêtre, et elle dit ce qui sera montré.
 */
export function VisibilityDialog({ open, onOpenChange, title, description, value, publishablePages, publicPath, onSave }: VisibilityDialogProps) {
  const [draft, setDraft] = useState<ChapterVisibility>(value);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setCopied(false);
  }, [open, value]);

  const forChapter = publishablePages !== undefined;
  const nothingToShow = forChapter && publishablePages === 0;
  const blocked = nothingToShow && draft !== "private";
  const link = publicPath && typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || blocked) return;
    setBusy(true);
    try {
      await onSave(draft);
      // Devenu public : la fenêtre reste ouverte pour montrer l'adresse à partager.
      if (!forChapter || draft === "private") onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Visibilité non enregistrée."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Adresse copiée");
    } catch {
      toast.error("Copie impossible : sélectionnez l’adresse à la main.");
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

          <RadioGroup aria-label="Visibilité" value={draft} onValueChange={(next) => setDraft(next as ChapterVisibility)} className="gap-3">
            {VISIBILITY_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-start gap-3">
                <RadioGroupItem id={`scan-studio-visibility-${option.value}`} value={option.value} className="mt-0.5" />
                <Label htmlFor={`scan-studio-visibility-${option.value}`} className="flex flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{option.description}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>

          {forChapter ? (
            nothingToShow ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Ce chapitre n’a aucune page exportée : il ne peut pas être publié. Exportez au moins une page depuis l’atelier, puis revenez ici.
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Seules les pages exportées sont montrées, dans leur version traduite : {countLabel(publishablePages ?? 0, "page", "pages")} pour
                  l’instant. Les images d’origine, les zones, les textes lus et le glossaire ne sortent jamais. Les pages « laissées telles quelles » et
                  celles qui ne sont pas exportées n’apparaissent pas. Repasser en privé coupe l’accès tout de suite et efface l’adresse.
                </span>
              </p>
            )
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Ce réglage ne vaut que pour les chapitres créés ensuite : les chapitres existants gardent leur visibilité. Un chapitre créé public n’a
                rien à montrer avant l’export de sa première page.
              </span>
            </p>
          )}

          {forChapter && link && value !== "private" && (
            <div className="grid gap-2">
              <Label htmlFor="scan-studio-public-link">Adresse de lecture</Label>
              <div className="flex items-center gap-2">
                <input
                  id="scan-studio-public-link"
                  readOnly
                  value={link}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label="Copier l’adresse" title="Copier l’adresse">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button asChild type="button" variant="outline" size="icon" aria-label="Ouvrir la lecture publique" title="Ouvrir la lecture publique">
                  <a href={publicPath} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            <Button type="submit" disabled={busy || blocked || draft === value}>
              {!forChapter ? "Enregistrer" : draft === "private" ? "Rendre privé" : "Publier ainsi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
