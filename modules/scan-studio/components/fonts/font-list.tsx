"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MoreHorizontal, Pencil, Trash2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatDate } from "../../lib/client";
import { BUNDLED_FONTS } from "../../lib/custom-fonts";
import { ensureCustomFonts, forgetCustomFont, setCustomFonts, type FontLoadFailure } from "../../lib/fonts";
import { countLabel, errorMessage } from "../../lib/library-helpers";
import type { CustomFont, FontUsage } from "../../lib/types";

/** Poids d'un fichier accepté, comme le serveur le contrôle. */
const MAX_FONT_BYTES = 5 * 1024 * 1024;
const FONT_ACCEPT = ".ttf,.otf,.woff2";

/** Famille CSS d'une police, prête pour un style en ligne. Le nom est une donnée : il est assaini. */
export function familyStyle(family: string): React.CSSProperties {
  return { fontFamily: `"${family.replace(/["\\;]/g, "")}", sans-serif` };
}

const formatSize = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")}\u00a0Ko`;

function usageText(usage: FontUsage): string {
  return [
    usage.pages > 0 ? countLabel(usage.pages, "page", "pages") : "",
    usage.chapters > 0 ? countLabel(usage.chapters, "chapitre", "chapitres") : "",
    usage.folders > 0 ? countLabel(usage.folders, "dossier", "dossiers") : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Contenu d'un fichier, en base64, pour l'envoyer à une fonction du module. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`« ${file.name} » n’a pas pu être lu.`));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

interface FontListProps {
  /** `null` : la liste n'est pas encore arrivée. */
  fonts: CustomFont[] | null;
  /** Phrase d'essai, écrite dans chaque police. */
  sample: string;
  isAdmin: boolean;
  onChange: (fonts: CustomFont[]) => void;
}

/**
 * Les polices ajoutées : chacune avec une phrase d'essai, son nom modifiable,
 * et son retrait. Une police encore utilisée ne se retire pas sans dire quelle
 * police la remplace.
 */
export function CustomFontList({ fonts, sample, isAdmin, onChange: report }: FontListProps) {
  /** La liste gardée par le navigateur suit celle de la page : l'atelier, ouvert ensuite, la retrouve à jour. */
  const onChange = (next: CustomFont[]) => {
    setCustomFonts(next);
    report(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [failures, setFailures] = useState<FontLoadFailure[]>([]);
  const [renaming, setRenaming] = useState<CustomFont | null>(null);
  const [removing, setRemoving] = useState<CustomFont | null>(null);

  // Chaque police est chargée pour sa phrase d'essai : c'est aussi là qu'on apprend que le navigateur n'en veut pas.
  const families = (fonts ?? []).map((font) => font.family).join("\n");
  useEffect(() => {
    if (!families) return;
    let cancelled = false;
    void ensureCustomFonts(families.split("\n")).then((failed) => {
      if (!cancelled) setFailures(failed);
    });
    return () => {
      cancelled = true;
    };
  }, [families]);

  const addFiles = async (files: File[]) => {
    if (files.length === 0 || adding) return;
    setAdding(true);
    let list = fonts ?? [];
    try {
      for (const file of files) {
        if (file.size > MAX_FONT_BYTES) {
          toast.error(`« ${file.name} » est trop lourde : 5 Mo au plus.`);
          continue;
        }
        try {
          const font = await api.addFont(await readBase64(file));
          const extended = [...list, font].sort((left, right) => left.name.localeCompare(right.name, "fr"));
          // Le serveur a contrôlé le fichier ; reste à savoir si ce navigateur sait le dessiner.
          setCustomFonts(extended);
          const [unreadable] = await ensureCustomFonts([font.family]);
          if (unreadable) {
            await api.removeFont(font.id).catch(() => undefined);
            setCustomFonts(list);
            toast.error(`« ${file.name} » a passé le contrôle du serveur, mais ce navigateur ne sait pas la dessiner : elle n’a pas été gardée.`);
            continue;
          }
          list = extended;
          onChange(list);
          toast.success(`« ${font.name} » ajoutée`);
        } catch (error) {
          toast.error(errorMessage(error, `« ${file.name} » n’a pas pu être ajoutée.`));
        }
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="scan-studio-fonts-added">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 id="scan-studio-fonts-added" className="text-sm font-semibold">
            Polices ajoutées
          </h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Vos polices de lettrage, en TTF, OTF ou WOFF2, 5 Mo au plus. Elles restent dans les données du module et ne sont servies qu’aux comptes
            connectés. N’ajoutez que des polices dont vous avez la licence.
          </p>
        </div>
        {isAdmin && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={FONT_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                void addFiles(files);
              }}
            />
            <Button className="gap-2" disabled={adding || fonts === null} onClick={() => inputRef.current?.click()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Ajouter une police
            </Button>
          </>
        )}
      </div>

      {fonts === null ? (
        <div className="grid gap-3 xl:grid-cols-2" aria-hidden>
          {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-4 rounded-md border p-4">
              <Skeleton className="size-12 rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-6 w-full max-w-md" />
              </div>
            </div>
          ))}
        </div>
      ) : fonts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune police ajoutée pour l’instant.{" "}
          {isAdmin ? "Les polices fournies, plus bas, suffisent à lettrer un chapitre." : "Un administrateur peut en ajouter depuis cette page."}
        </p>
      ) : (
        <ItemGroup className="grid gap-3 xl:grid-cols-2">
          <AnimatePresence initial={false}>
            {fonts.map((font) => {
              const failure = failures.find((entry) => entry.family === font.family);
              return (
                <motion.div key={font.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Item variant="outline" className="h-full items-start">
                    <ItemMedia className="size-12 text-2xl" style={familyStyle(font.family)} aria-hidden>
                      Aa
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle>{font.name}</ItemTitle>
                      <ItemDescription>
                        {font.originalName !== font.name ? `${font.originalName} · ` : ""}
                        {font.format.toUpperCase()} · {formatSize(font.size)} · ajoutée le {formatDate(font.addedAt)}
                      </ItemDescription>
                    </ItemContent>
                    {isAdmin && (
                      <ItemActions>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions de la police ${font.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setRenaming(font)}>
                              <Pencil className="h-4 w-4" />
                              Renommer
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(font)}>
                              <Trash2 className="h-4 w-4" />
                              Retirer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </ItemActions>
                    )}
                    <ItemFooter className="flex-col items-start gap-1">
                      {failure ? (
                        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Ce navigateur n’a pas pu charger cette police ({failure.reason}) : les pages qui la portent sont dessinées avec une police de repli.
                        </p>
                      ) : (
                        <p className="w-full truncate text-2xl leading-snug" style={familyStyle(font.family)}>
                          {sample}
                        </p>
                      )}
                    </ItemFooter>
                  </Item>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </ItemGroup>
      )}

      {renaming && (
        <RenameDialog
          font={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={(renamed) => onChange((fonts ?? []).map((font) => (font.id === renamed.id ? renamed : font)).sort((left, right) => left.name.localeCompare(right.name, "fr")))}
        />
      )}
      {removing && (
        <RemoveDialog
          font={removing}
          others={(fonts ?? []).filter((font) => font.id !== removing.id)}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            forgetCustomFont(removing.family);
            onChange((fonts ?? []).filter((font) => font.id !== removing.id));
          }}
        />
      )}
    </section>
  );
}

function RenameDialog({ font, onClose, onRenamed }: { font: CustomFont; onClose: () => void; onRenamed: (font: CustomFont) => void }) {
  const [name, setName] = useState(font.name);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      onRenamed(await api.renameFont(font.id, name));
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "La police n’a pas pu être renommée."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Renommer la police</DialogTitle>
            <DialogDescription>Seul le nom affiché change : les pages qui portent cette police ne sont pas touchées.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="scan-studio-font-name">Nom</Label>
            <Input id="scan-studio-font-name" value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || name.trim() === font.name}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Renommer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ font, others, onClose, onRemoved }: { font: CustomFont; others: CustomFont[]; onClose: () => void; onRemoved: () => void }) {
  const [usage, setUsage] = useState<FontUsage | null>(null);
  const [failed, setFailed] = useState(false);
  const [replacement, setReplacement] = useState(BUNDLED_FONTS[0].family);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getFontUsage(font.id)
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [font.id]);

  const used = usage !== null && usage.pages + usage.chapters + usage.folders > 0;

  const remove = async () => {
    if (removing || usage === null) return;
    setRemoving(true);
    try {
      const { replaced } = await api.removeFont(font.id, used ? { replaceWith: replacement } : undefined);
      onRemoved();
      const moved = usageText(replaced);
      toast.success(moved ? `« ${font.name} » retirée ; ${moved} passent à la police de remplacement` : `« ${font.name} » retirée`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "La police n’a pas pu être retirée."));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer « {font.name} » ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              {failed ? (
                <p>L’usage de cette police n’a pas pu être lu : fermez cette fenêtre et réessayez.</p>
              ) : usage === null ? (
                <Skeleton className="h-10 w-full" aria-hidden />
              ) : used ? (
                <>
                  <p>
                    Elle est encore utilisée : {usageText(usage)}. Tout ce qui la porte passera à la police que vous choisissez ici, puis son fichier sera
                    effacé. Un atelier resté ouvert sur une de ces pages demandera de la recharger.
                  </p>
                  <div className="grid gap-2">
                    <Label htmlFor="scan-studio-font-replacement" className="text-foreground">
                      Police de remplacement
                    </Label>
                    <Select value={replacement} onValueChange={setReplacement}>
                      <SelectTrigger id="scan-studio-font-replacement" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUNDLED_FONTS.map((entry) => (
                          <SelectItem key={entry.family} value={entry.family} style={familyStyle(entry.family)}>
                            {entry.family}
                          </SelectItem>
                        ))}
                        {others.map((entry) => (
                          <SelectItem key={entry.family} value={entry.family} style={familyStyle(entry.family)}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <p>Aucune page, aucun chapitre et aucun dossier ne l’utilise. Son fichier sera effacé du serveur.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={usage === null || removing}
            onClick={(event) => {
              // La fenêtre se ferme quand le serveur a répondu, pas avant.
              event.preventDefault();
              void remove();
            }}
          >
            {removing && <Loader2 className="h-4 w-4 animate-spin" />}
            {used ? "Remplacer et retirer" : "Retirer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Les polices fournies avec l'application, avec la même phrase d'essai. */
export function BundledFontList({ sample }: { sample: string }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="scan-studio-fonts-bundled">
      <div className="space-y-1">
        <h3 id="scan-studio-fonts-bundled" className="text-sm font-semibold">
          Polices fournies
        </h3>
        <p className="max-w-3xl text-sm text-muted-foreground">Sous licence libre, embarquées avec l’application : elles sont toujours là, à l’aperçu comme à l’export.</p>
      </div>
      <ItemGroup className="grid gap-3 xl:grid-cols-2">
        {BUNDLED_FONTS.map((font) => (
          <Item key={font.family} variant="outline" className="items-start">
            <ItemMedia className="size-12 text-2xl" style={familyStyle(font.family)} aria-hidden>
              Aa
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{font.family}</ItemTitle>
              <ItemDescription>{font.usage}</ItemDescription>
            </ItemContent>
            <ItemFooter>
              <p className="w-full truncate text-2xl leading-snug" style={familyStyle(font.family)}>
                {sample}
              </p>
            </ItemFooter>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
