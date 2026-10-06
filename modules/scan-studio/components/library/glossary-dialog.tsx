"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookA, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { GLOSSARY_ISSUE_LABELS, GLOSSARY_LIMITS, cleanGlossary, matchesGlossarySearch, validateGlossary } from "../../lib/glossary-helpers";
import { countLabel, errorMessage } from "../../lib/library-helpers";
import type { GlossaryEntry } from "../../lib/types";

interface GlossaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  value: GlossaryEntry[];
  /** Lève en cas d'échec : la fenêtre reste ouverte. */
  onSave: (glossary: GlossaryEntry[]) => Promise<void>;
}

/** Une ligne en cours d'édition : la clé reste stable pendant qu'on tape. */
interface Row extends GlossaryEntry {
  key: number;
}

const COLUMNS = "grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center";

/**
 * Glossaire d'un dossier : noms propres et termes dont la traduction est
 * imposée, quel que soit le moteur (§ 6.5 du dossier).
 */
export function GlossaryDialog({ open, onOpenChange, folderName, value, onSave }: GlossaryDialogProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  /** Après une tentative d'enregistrement, les lignes fautives disent pourquoi. */
  const [checked, setChecked] = useState(false);
  const nextKey = useRef(0);
  /** Ligne tout juste ajoutée : elle prend le curseur et échappe à la recherche. */
  const [freshKey, setFreshKey] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(value.map((entry) => ({ ...entry, key: nextKey.current++ })));
    setSearch("");
    setFreshKey(null);
    setChecked(false);
  }, [open, value]);

  const issues = useMemo(() => validateGlossary(rows), [rows]);
  const issueByKey = useMemo(() => new Map(rows.map((row, index) => [row.key, issues[index]])), [rows, issues]);
  const invalid = issues.filter((issue) => issue !== null).length;
  // Une ligne qu'on vient d'ajouter, ou fautive, reste visible même si la recherche ne la trouve pas.
  const visible = rows.filter((row) => matchesGlossarySearch(row, search) || row.key === freshKey || (checked && issueByKey.get(row.key)));

  const patch = (key: number, change: Partial<GlossaryEntry>) => setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const add = () => {
    const key = nextKey.current++;
    setFreshKey(key);
    setRows((previous) => [{ key, source: "", target: "" }, ...previous]);
  };

  const remove = (key: number) => setRows((previous) => previous.filter((row) => row.key !== key));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (invalid > 0) {
      setChecked(true);
      toast.error(invalid < 2 ? "Une ligne du glossaire est à corriger." : `${invalid} lignes du glossaire sont à corriger.`);
      return;
    }
    setBusy(true);
    try {
      await onSave(cleanGlossary(rows));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement du glossaire impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Glossaire de « {folderName} »</DialogTitle>
            <DialogDescription>
              Un terme du glossaire ne se traduit pas, il se remplace : il est protégé avant l’envoi et rétabli au retour, quel que soit le moteur.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setFreshKey(null);
                  setSearch(event.target.value);
                }}
                placeholder="Chercher un terme, une traduction, une note"
                aria-label="Chercher dans le glossaire"
                className="h-9 pl-8"
                autoComplete="off"
              />
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">{countLabel(rows.length, "terme", "termes")}</p>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={add}>
              <Plus className="h-4 w-4" />
              Ajouter un terme
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <BookA aria-hidden className="h-8 w-8 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Aucun terme pour l’instant. Ajoutez les noms des personnages, des lieux et des techniques pour qu’ils restent les mêmes d’un chapitre à
                  l’autre.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Aucun terme ne correspond à « {search.trim()} ».</p>
            ) : (
              <>
                <div className={cn(COLUMNS, "hidden pb-1 text-xs font-medium text-muted-foreground sm:grid")} aria-hidden>
                  <span>Terme d’origine</span>
                  <span>Traduction imposée</span>
                  <span>Note</span>
                  <span className="w-24 text-center">Nom propre</span>
                  <span className="w-8" />
                </div>
                <ul className="flex flex-col divide-y">
                  <AnimatePresence initial={false}>
                    {visible.map((row) => {
                      const issue = issueByKey.get(row.key) ?? null;
                      // Un doublon se voit tout de suite ; les autres défauts attendent la première tentative.
                      const shown = issue !== null && (checked || issue === "duplicate");
                      const position = rows.indexOf(row) + 1;
                      return (
                        <motion.li
                          key={row.key}
                          layout="position"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.16 }}
                          className="overflow-hidden"
                        >
                          <div className={cn(COLUMNS, "px-0.5 py-2")}>
                            <Input
                              value={row.source}
                              onChange={(event) => patch(row.key, { source: event.target.value })}
                              placeholder="Terme d’origine"
                              aria-label={`Terme d’origine, ligne ${position}`}
                              aria-invalid={shown && (issue === "empty-source" || issue === "duplicate")}
                              maxLength={GLOSSARY_LIMITS.term}
                              autoFocus={row.key === freshKey}
                              autoComplete="off"
                              className="h-9"
                            />
                            <Input
                              value={row.target}
                              onChange={(event) => patch(row.key, { target: event.target.value })}
                              placeholder={row.keep ? "Transcription (facultative)" : "Traduction imposée"}
                              aria-label={`Traduction imposée, ligne ${position}`}
                              aria-invalid={shown && issue === "empty-target"}
                              maxLength={GLOSSARY_LIMITS.term}
                              autoComplete="off"
                              className="h-9"
                            />
                            <Input
                              value={row.note ?? ""}
                              onChange={(event) => patch(row.key, { note: event.target.value })}
                              placeholder="Note (facultative)"
                              aria-label={`Note, ligne ${position}`}
                              maxLength={GLOSSARY_LIMITS.note}
                              autoComplete="off"
                              className="h-9"
                            />
                            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:w-24 sm:justify-center" title="Nom propre, ne pas traduire">
                              <Switch
                                checked={Boolean(row.keep)}
                                onCheckedChange={(keep) => patch(row.key, { keep })}
                                aria-label={`Nom propre, ne pas traduire, ligne ${position}`}
                              />
                              <span className="sm:hidden">Nom propre, ne pas traduire</span>
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(row.key)}
                              aria-label={`Supprimer le terme ${row.source.trim() || `de la ligne ${position}`}`}
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {shown && issue && <p className="px-0.5 pb-2 text-xs text-destructive">{GLOSSARY_ISSUE_LABELS[issue]}</p>}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              Enregistrer le glossaire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
