"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "../../lib/client";
import { BUNDLED_FONTS, STYLE_ROWS, fontLabel, isMissingFont, styleRowFont, withStyleRowFont, type StyleRow } from "../../lib/custom-fonts";
import { nearestWeight } from "../../lib/fonts";
import { countLabel, errorMessage } from "../../lib/library-helpers";
import type { CustomFont, FolderSummary, FolderView, RegionKind, TextStyle } from "../../lib/types";
import { familyStyle } from "./font-list";

interface StyleTableProps {
  /** Polices ajoutées, proposées à côté des polices fournies. */
  fonts: CustomFont[];
  sample: string;
}

/** Applique à une table de styles les polices choisies pour chaque registre. */
function applyRows(styles: Partial<Record<RegionKind, TextStyle>>, choices: Record<StyleRow["id"], string>): Record<RegionKind, TextStyle> {
  let next = styles;
  for (const row of STYLE_ROWS) next = withStyleRowFont(next, row, choices[row.id], nearestWeight);
  return next as Record<RegionKind, TextStyle>;
}

const choicesOf = (styles: Partial<Record<RegionKind, TextStyle>>) =>
  Object.fromEntries(STYLE_ROWS.map((row) => [row.id, styleRowFont(styles, row)])) as Record<StyleRow["id"], string>;

/**
 * Table des styles d'un dossier (§ 8 du dossier de conception) : une police par
 * registre de texte, tenue sur toute la série. C'est elle qui habille un bloc
 * de texte à sa création, selon le type de sa zone.
 */
export function StyleTable({ fonts, sample }: StyleTableProps) {
  const [folders, setFolders] = useState<FolderSummary[] | null>(null);
  const [folderId, setFolderId] = useState("");
  const [view, setView] = useState<FolderView | null>(null);
  const [choices, setChoices] = useState<Record<StyleRow["id"], string> | null>(null);
  const [spread, setSpread] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listFolders()
      .then((list) => {
        if (cancelled) return;
        setFolders(list);
        setFolderId((current) => current || list[0]?.id || "");
      })
      .catch((error) => {
        if (cancelled) return;
        setFolders([]);
        toast.error(errorMessage(error, "La liste des dossiers n’a pas pu être lue."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!folderId) return;
    let cancelled = false;
    setView(null);
    setChoices(null);
    api
      .getFolder(folderId)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setChoices(choicesOf(next.folder.defaults.styles));
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorMessage(error, "Ce dossier n’a pas pu être lu."));
      });
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const saved = view ? choicesOf(view.folder.defaults.styles) : null;
  const dirty = Boolean(choices && saved && STYLE_ROWS.some((row) => choices[row.id] !== saved[row.id]));

  const save = async () => {
    if (!view || !choices || saving) return;
    setSaving(true);
    try {
      const folder = await api.updateFolder(view.folder.id, { defaults: { ...view.folder.defaults, styles: applyRows(view.folder.defaults.styles, choices) } });
      let updated = 0;
      if (spread) {
        // Chaque chapitre porte sa propre copie des styles : elle est relue juste avant d'être réécrite.
        for (const summary of view.chapters) {
          const { chapter } = await api.getChapter(summary.id);
          await api.updateChapter(chapter.id, { settings: { ...chapter.settings, styles: applyRows(chapter.settings.styles, choices) } });
          updated++;
        }
      }
      setView({ ...view, folder });
      setChoices(choicesOf(folder.defaults.styles));
      toast.success(
        updated > 0
          ? `Styles enregistrés pour le dossier et ${countLabel(updated, "chapitre", "chapitres")}`
          : "Styles enregistrés : ils habilleront les prochains chapitres du dossier",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Les styles n’ont pas pu être enregistrés."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="scan-studio-fonts-styles">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 id="scan-studio-fonts-styles" className="text-sm font-semibold">
            Styles par type de texte
          </h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Une police par registre, tenue sur toute la série : un bloc de texte prend à sa création celle du type de sa zone. Chaque zone peut ensuite
            s’en écarter dans l’atelier.
          </p>
        </div>
        {folders && folders.length > 0 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="scan-studio-style-folder" className="text-sm text-muted-foreground">
              Dossier
            </Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger id="scan-studio-style-folder" className="w-64">
                <SelectValue placeholder="Choisir un dossier" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {folders === null || (folderId && !choices) ? (
        <div className="grid gap-3 xl:grid-cols-2" aria-hidden>
          {STYLE_ROWS.map((row) => (
            <div key={row.id} className="flex items-center gap-4 rounded-md border p-4">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-full max-w-sm" />
              </div>
              <Skeleton className="h-9 w-48" />
            </div>
          ))}
        </div>
      ) : folders.length === 0 || !choices ? (
        <p className="text-sm text-muted-foreground">Aucun dossier pour l’instant : créez-en un dans la bibliothèque, ses styles se régleront ici.</p>
      ) : (
        <>
          <ItemGroup className="grid gap-3 xl:grid-cols-2">
            {STYLE_ROWS.map((row) => {
              const family = choices[row.id];
              const missing = isMissingFont(family, fonts);
              return (
                <Item key={row.id} variant="outline" className="items-start">
                  <ItemContent className="min-w-0">
                    <ItemTitle>{row.label}</ItemTitle>
                    <ItemDescription>{row.hint}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Select value={family} onValueChange={(next) => setChoices({ ...choices, [row.id]: next })}>
                      <SelectTrigger className="w-52" aria-label={`Police pour : ${row.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUNDLED_FONTS.map((font) => (
                          <SelectItem key={font.family} value={font.family} style={familyStyle(font.family)}>
                            {font.family}
                          </SelectItem>
                        ))}
                        {fonts.map((font) => (
                          <SelectItem key={font.family} value={font.family} style={familyStyle(font.family)}>
                            {font.name}
                          </SelectItem>
                        ))}
                        {/* Police d'un dossier qui n'est plus dans la liste : gardée proposée, plutôt que remplacée en silence. */}
                        {!BUNDLED_FONTS.some((font) => font.family === family) && !fonts.some((font) => font.family === family) && (
                          <SelectItem value={family}>{fontLabel(family, fonts)}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </ItemActions>
                  <ItemFooter>
                    {missing ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">Cette police a été retirée du module : choisissez-en une autre.</p>
                    ) : (
                      <p className="w-full truncate text-2xl leading-snug" style={familyStyle(family)}>
                        {sample}
                      </p>
                    )}
                  </ItemFooter>
                </Item>
              );
            })}
          </ItemGroup>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button disabled={!dirty || saving} onClick={() => void save()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer les styles
            </Button>
            {view && view.chapters.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={spread} onCheckedChange={setSpread} />
                Reporter aussi sur les {countLabel(view.chapters.length, "chapitre déjà créé", "chapitres déjà créés")}
              </label>
            )}
          </div>
        </>
      )}
    </section>
  );
}
