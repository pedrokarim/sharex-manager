"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AnalyzePages } from "../../lib/analysis/contract";
import { startAnalysisJob } from "../../lib/chapter-jobs";
import { countLabel } from "../../lib/library-helpers";
import type { PageSummary } from "../../lib/types";
import { PagePicker } from "./page-picker";

interface AnalyzeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  /** Toutes les pages du chapitre, dans l'ordre de lecture : leur rang donne leur numéro. */
  pages: PageSummary[];
  /** L'analyse du module (`lib/analysis`), passée par la page. */
  analyze: AnalyzePages;
}

/**
 * « Analyser » un chapitre : on choisit les pages, puis l'analyse part en
 * arrière-plan (repérage des zones de texte et lecture, page par page, dans le
 * navigateur). La fenêtre se ferme aussitôt : la planche du chapitre montre où
 * en est chaque page, et c'est là qu'on arrête le traitement.
 */
export function AnalyzeDialog({ open, onOpenChange, chapterId, pages, analyze }: AnalyzeDialogProps) {
  // Les pages « laissées telles quelles » ne s'analysent pas : elles ne sont pas proposées.
  const candidates = useMemo(() => pages.map((page, index) => ({ page, number: index + 1 })).filter((entry) => !entry.page.skipped), [pages]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);

  // Ouverture : tout est coché, rien n'est remplacé.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(candidates.map((entry) => entry.page.id)));
    setReplace(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à l'ouverture seulement : cocher une page ne doit pas tout recocher
  }, [open]);

  const start = () => {
    // Dans l'ordre de lecture, quel que soit l'ordre des clics.
    const ids = candidates.filter((entry) => selected.has(entry.page.id)).map((entry) => entry.page.id);
    if (ids.length === 0) return;
    if (!startAnalysisJob(chapterId, ids, { replace }, analyze)) {
      toast.info("Un traitement tourne déjà sur ce chapitre", { description: "Attendez sa fin, ou arrêtez-le depuis la planche." });
      return;
    }
    onOpenChange(false);
    toast.message(`Analyse lancée sur ${countLabel(ids.length, "page", "pages")}`, { description: "Elle tourne en arrière-plan : la planche montre où en est chaque page." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Analyser le chapitre</DialogTitle>
          <DialogDescription>Repérer les zones de texte des pages cochées et lire ce qu’elles contiennent. Décochez celles qui n’ont rien à traduire.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune page à analyser dans ce chapitre.</p>
          ) : (
            <PagePicker pages={candidates} selected={selected} onChange={setSelected} purpose="à analyser" />
          )}
          <div className="flex items-start justify-between gap-4">
            <Label htmlFor="scan-studio-analysis-replace" className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">Remplacer les zones déjà présentes</span>
              <span className="text-xs leading-snug text-muted-foreground">
                Sans cette option, les zones existantes sont conservées et seules les nouvelles s’ajoutent. Une zone corrigée à la main n’est jamais écrasée.
              </span>
            </Label>
            <Switch id="scan-studio-analysis-replace" checked={replace} onCheckedChange={setReplace} />
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              L’analyse tourne dans ce navigateur, avec des moteurs locaux : aucune image et aucun texte ne partent chez un service extérieur. Elle continue
              en arrière-plan tant que cet onglet reste ouvert.
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={selected.size === 0} onClick={start}>
            {selected.size === 0 ? "Analyser" : `Analyser ${countLabel(selected.size, "page", "pages")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
