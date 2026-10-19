"use client";

/**
 * Projets de Clip Studio : toute la bibliothèque, en grille ou en liste.
 *
 * Recherche, filtres (format, marque, origine, étiquette, exporté ou non,
 * période), tri, pagination par 24 : tout vit dans l'adresse
 * (`?q=&sort=&page=&view=`…), qu'un lien ou le bouton Retour rouvrent à
 * l'identique. Chaque projet s'ouvre, se renomme sur place, s'étiquette, se
 * duplique (au même format ou à un autre), change de marque, s'exporte, se
 * télécharge en JSON ou se supprime ; une sélection agit sur plusieurs à la
 * fois (étiqueter, dupliquer, supprimer).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Check,
  Clapperboard,
  Copy,
  Download,
  FileUp,
  FileVideo,
  FolderOpen,
  LayoutGrid,
  List,
  MoreHorizontal,
  Palette,
  PencilLine,
  Plus,
  RectangleHorizontal,
  Search,
  Send,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { ActionStatus, FormStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TagInput } from "@/components/ui/tag-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { applyBrandTheme } from "../engine/brand";
import { ASPECTS, type AspectPreset, type ClipProject } from "../engine/types";
import {
  callModule,
  deleteProjects,
  duplicateProject,
  duplicateProjects,
  fetchBrandTheme,
  importProject,
  searchProjects,
  tagProjects,
  updateProjectDetails,
  useBrandKits,
  type BrandKitChoice,
} from "../lib/client";
import { ensureBrandFonts } from "../lib/fonts";
import {
  ASPECT_LABELS,
  ASPECT_PRESETS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  ORIGIN_LABELS,
  PERIODS,
  PERIOD_LABELS,
  PROJECT_SORTS,
  PROJECT_SORT_LABELS,
  hasProjectFilters,
  parseProjectQuery,
  projectQueryString,
  updateProjectQuery,
  type LibraryView,
  type ProjectPage,
  type ProjectQuery,
  type ProjectSummary,
} from "../lib/library";
import { ScreenHeader } from "../components/screen-header";
import { legacyCreateHref } from "../lib/create-mode";
import { ProjectFrame, ProjectThumbnail } from "../components/project-thumbnail";
import { AspectChip, BrandName, FiltersBar, Pager, SortButton, formatClock, formatRelative } from "../components/library-ui";

const BASE = "/m/clip-studio/projects";
const VIEW_KEY = "clip-studio.projects.view";
const ALL = "__all";

/** Pages déjà vues, par adresse : le retour à une page est instantané. */
const pages = new Map<string, ProjectPage>();

function readStoredView(): LibraryView | null {
  try {
    const value = window.localStorage.getItem(VIEW_KEY);
    return value === "list" || value === "grid" ? value : null;
  } catch {
    return null;
  }
}

function storeView(view: LibraryView) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Stockage refusé (navigation privée) : la vue reste dans l'adresse.
  }
}

const editHref = (id: string) => `/m/clip-studio/edit?id=${encodeURIComponent(id)}`;

export default function ProjectsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // La création a sa page : l'ancienne adresse (`?action=create`) y renvoie, paramètres compris.
  useEffect(() => {
    const target = legacyCreateHref(params);
    if (target) router.replace(target, { scroll: false });
  }, [params, router]);
  const query = useMemo(() => parseProjectQuery(new URLSearchParams(params.toString())), [params]);
  const urlView: LibraryView | null = params.get("view") === "list" ? "list" : params.get("view") === "grid" ? "grid" : null;
  const [storedView, setStoredView] = useState<LibraryView | null>(null);
  useEffect(() => setStoredView(readStoredView()), []);
  const view: LibraryView = urlView ?? storedView ?? "grid";
  const kits = useBrandKits();
  const key = projectQueryString(query);

  const [data, setData] = useState<ProjectPage | null>(() => pages.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const navigate = useCallback(
    (next: ProjectQuery, nextView: LibraryView = view) => {
      router.replace(`${pathname}${projectQueryString(next, nextView)}`, { scroll: false });
    },
    [router, pathname, view]
  );
  const patch = useCallback((change: Partial<ProjectQuery>) => navigate(updateProjectQuery(query, change)), [navigate, query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await searchProjects(query);
      pages.set(key, next);
      setData(next);
      setLoadError(null);
      // Page hors bornes (projets supprimés entre-temps) : l'adresse suit la page rendue.
      if (next.page !== query.page) navigate({ ...query, page: next.page });
    } catch (error) {
      setLoadError(errorMessage(error, "Les projets n’ont pas pu être chargés."));
    } finally {
      setLoading(false);
    }
  }, [query, key, navigate]);

  useEffect(() => {
    const cached = pages.get(key);
    if (cached) setData(cached);
    void load();
    // `load` change avec la requête : une seule lecture par adresse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // La sélection ne survit pas à un changement de filtre : elle porterait sur des projets cachés.
  const filterKey = projectQueryString({ ...query, page: 1 });
  useEffect(() => setSelected(new Set()), [filterKey]);

  // ─── Recherche (différée, pour ne pas relire à chaque touche) ──
  const [search, setSearch] = useState(query.q);
  useEffect(() => setSearch(query.q), [query.q]);
  useEffect(() => {
    if (search.trim() === query.q) return;
    const timer = setTimeout(() => patch({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
  }, [search, query.q, patch]);

  const setView = (next: LibraryView) => {
    storeView(next);
    setStoredView(next);
    navigate(query, next);
  };

  // ─── Retours et actions ───────────────────────────────────────
  const rowFeedback = useFeedback();
  const [rowTarget, setRowTarget] = useState<string | null>(null);
  const rowStatus = (id: string): FeedbackState | null => (rowTarget === id ? rowFeedback.state : null);
  const failOn = (id: string, error: unknown, fallback: string) => {
    setRowTarget(id);
    rowFeedback.error(errorMessage(error, fallback));
  };
  const bulkFeedback = useFeedback();
  const headerFeedback = useFeedback();
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [tagging, setTagging] = useState<ProjectSummary[] | null>(null);
  const [removing, setRemoving] = useState<ProjectSummary[] | null>(null);
  const [formatTarget, setFormatTarget] = useState<ProjectSummary | null>(null);
  const [brandTarget, setBrandTarget] = useState<ProjectSummary | null>(null);

  const replaceItem = (next: ProjectSummary) => {
    setData((current) => (current ? { ...current, items: current.items.map((item) => (item.id === next.id ? next : item)) } : current));
    pages.clear();
  };
  const afterChange = () => {
    pages.clear();
    void load();
  };

  const actions: ProjectActions = {
    rename: (project) => {
      rowFeedback.clear();
      setRenaming(project.id);
    },
    saveName: async (project, name) => {
      const clean = name.replace(/\s+/g, " ").trim();
      if (!clean || clean === project.name) {
        setRenaming(null);
        return;
      }
      try {
        replaceItem(await updateProjectDetails({ id: project.id, name: clean }));
        setRenaming(null);
      } catch (error) {
        failOn(project.id, error, "Le projet n’a pas pu être renommé.");
      }
    },
    cancelRename: () => setRenaming(null),
    tags: (project) => setTagging([project]),
    duplicate: async (project) => {
      rowFeedback.clear();
      try {
        await duplicateProject(project.id);
        afterChange();
      } catch (error) {
        failOn(project.id, error, "Le projet n’a pas pu être dupliqué.");
      }
    },
    copyFormat: (project) => setFormatTarget(project),
    chooseBrand: (project) => setBrandTarget(project),
    download: async (project) => {
      try {
        await downloadProject(project.id);
      } catch (error) {
        failOn(project.id, error, "Le projet n’a pas pu être téléchargé.");
      }
    },
    remove: (project) => setRemoving([project]),
  };

  const items = data?.items ?? [];
  const selectedItems = items.filter((item) => selected.has(item.id));
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.id));
  const someOnPage = items.some((item) => selected.has(item.id));
  const toggle = (id: string, value: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  const togglePage = (value: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (value) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });

  const bulkDuplicate = async () => {
    setBulkBusy("Duplication");
    bulkFeedback.clear();
    try {
      const { created } = await duplicateProjects([...selected]);
      bulkFeedback.success(`${created.length} copie${created.length > 1 ? "s" : ""} créée${created.length > 1 ? "s" : ""}.`);
      setSelected(new Set());
      afterChange();
    } catch (error) {
      bulkFeedback.error(errorMessage(error, "La duplication a échoué."));
    } finally {
      setBulkBusy(null);
    }
  };

  // ─── Import d'un projet (JSON) ────────────────────────────────
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    headerFeedback.clear();
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Fichier trop volumineux : un projet fait 2 Mo au plus.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("Ce fichier n’est pas un projet Clip Studio (JSON illisible).");
      }
      const result = await importProject(parsed);
      headerFeedback.success(
        result.missingMedia > 0
          ? `« ${result.project.name} » importé ; ${result.missingMedia} média${result.missingMedia > 1 ? "s manquent" : " manque"} sur ce serveur.`
          : `« ${result.project.name} » importé.`
      );
      afterChange();
    } catch (error) {
      headerFeedback.error(errorMessage(error, "Le projet n’a pas pu être importé."));
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const filtered = hasProjectFilters(query);
  const facets = data?.facets;
  const kitName = (id: string) => kits?.find((kit) => kit.id === id)?.name ?? "Marque introuvable";
  const hrefFor = (page: number) => `${BASE}${projectQueryString({ ...query, page }, view)}`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full shrink-0 flex-col gap-5">
        <ScreenHeader
          back={{ href: "/m/clip-studio", label: "Accueil de Clip Studio" }}
          icon={FolderOpen}
          title="Projets"
          description={
            data
              ? `${data.libraryTotal.toLocaleString("fr-FR")} projet${data.libraryTotal > 1 ? "s" : ""} : cherchez, filtrez, renommez, étiquetez, dupliquez ou exportez.`
              : "Cherchez, filtrez, renommez, étiquetez, dupliquez ou exportez vos projets."
          }
          actions={
            <>
              <ActionStatus state={headerFeedback.state} className="max-w-full" />
              <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void onImport(event.target.files?.[0])} />
              <Button variant="outline" className="gap-2" loading={importing} onClick={() => fileInput.current?.click()}>
                <FileUp className="size-4" />
                Importer un projet
              </Button>
              <Button asChild className="gap-2">
                <Link href="/m/clip-studio/new">
                  <Plus className="size-4" />
                  Nouveau clip
                </Link>
              </Button>
            </>
          }
        />

        {/* Barre d'outils : recherche, filtres, tri, vue. */}
        <div className="grid min-w-0 gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <InputGroup className="w-full min-w-0 sm:w-72">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom ou étiquette" aria-label="Chercher un projet" />
              {search ? (
                <InputGroupAddon align="inline-end">
                  <Button variant="ghost" size="icon" className="size-6" aria-label="Effacer la recherche" onClick={() => setSearch("")}>
                    <X className="size-3.5" />
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              {loading && data ? <Spinner className="size-4 text-muted-foreground" aria-label="Mise à jour" /> : null}
              <Select value={query.sort} onValueChange={(value) => patch({ sort: value as ProjectQuery["sort"] })}>
                <SelectTrigger size="sm" className="w-auto min-w-0" aria-label="Trier par">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_SORTS.map((sort) => (
                    <SelectItem key={sort} value={sort}>
                      {PROJECT_SORT_LABELS[sort]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="w-28"
                onClick={() => patch({ dir: query.dir === "asc" ? "desc" : "asc", sort: query.sort })}
                aria-label="Inverser l’ordre"
              >
                {sortDirectionLabel(query)}
              </Button>
              <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(value) => value && setView(value as LibraryView)} aria-label="Affichage">
                <ToggleGroupItem value="grid" aria-label="Grille" className="px-2.5">
                  <LayoutGrid className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Liste" className="px-2.5">
                  <List className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <FiltersBar
            activeCount={[query.aspect, query.brand, query.origin, query.tag, query.exported, query.period].filter(Boolean).length}
            onClear={
              filtered
                ? () => {
                    setSearch("");
                    navigate({ ...query, q: "", aspect: "", brand: "", origin: "", tag: "", exported: "", period: "", page: 1 });
                  }
                : undefined
            }
          >
            <FilterSelect
              label="Format"
              value={query.aspect}
              onChange={(value) => patch({ aspect: value as AspectPreset | "" })}
              options={(facets?.aspects ?? []).map((entry) => ({ value: entry.value, label: ASPECT_LABELS[entry.value], count: entry.count }))}
              allLabel="Tous les formats"
            />
            {(facets?.brands.length ?? 0) > 0 || query.brand ? (
              <FilterSelect
                label="Marque"
                value={query.brand}
                onChange={(value) => patch({ brand: value })}
                options={[
                  ...(facets && facets.withoutBrand > 0 ? [{ value: "none", label: "Sans marque", count: facets.withoutBrand }] : []),
                  ...(facets?.brands ?? []).map((entry) => ({ value: entry.id, label: kitName(entry.id), count: entry.count })),
                ]}
                allLabel="Toutes les marques"
              />
            ) : null}
            <FilterSelect
              label="Origine"
              value={query.origin}
              onChange={(value) => patch({ origin: value as ProjectQuery["origin"] })}
              options={(facets?.origins ?? []).map((entry) => ({ value: entry.value, label: entry.value === "other" ? "Non précisée" : ORIGIN_LABELS[entry.value], count: entry.count }))}
              allLabel="Toutes les origines"
            />
            {(facets?.tags.length ?? 0) > 0 || query.tag ? (
              <FilterSelect
                label="Étiquette"
                value={query.tag}
                onChange={(value) => patch({ tag: value })}
                options={(facets?.tags ?? []).map((entry) => ({ value: entry.tag, label: entry.tag, count: entry.count }))}
                allLabel="Toutes les étiquettes"
              />
            ) : null}
            <FilterSelect
              label="Exports"
              value={query.exported}
              onChange={(value) => patch({ exported: value as ProjectQuery["exported"] })}
              options={[
                { value: "yes", label: "Déjà exportés", count: facets?.exported },
                { value: "no", label: "Jamais exportés", count: facets ? data!.libraryTotal - facets.exported : undefined },
              ]}
              allLabel="Exportés ou non"
            />
            <FilterSelect
              label="Période"
              value={query.period}
              onChange={(value) => patch({ period: value as ProjectQuery["period"] })}
              options={PERIODS.map((period) => ({ value: period, label: `Modifiés ces ${PERIOD_LABELS[period]}` }))}
              allLabel="Toutes les dates"
            />
          </FiltersBar>
        </div>

        {/* Sélection : barre d'actions groupées. */}
        <AnimatePresence initial={false}>
          {selected.size > 0 ? (
            <motion.div key="selection" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm" role="toolbar" aria-label="Actions sur la sélection">
                <span className="font-medium tabular-nums">
                  {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
                </span>
                <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={bulkBusy !== null} onClick={() => setTagging(selectedItems)}>
                  <Tags className="size-3.5" />
                  Étiqueter
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={bulkBusy !== null || selected.size > 50} loading={bulkBusy === "Duplication"} onClick={() => void bulkDuplicate()}>
                  <Copy className="size-3.5" />
                  Dupliquer
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-destructive hover:text-destructive" disabled={bulkBusy !== null} onClick={() => setRemoving(selectedItems)}>
                  <Trash2 className="size-3.5" />
                  Supprimer
                </Button>
                {!allOnPage ? (
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => togglePage(true)}>
                    Toute la page
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setSelected(new Set())}>
                  Désélectionner
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="-mt-3 empty:hidden">{bulkFeedback.state ? <FormStatus state={bulkFeedback.state} className="pt-3" /> : null}</div>

        {/* Liste */}
        {data === null ? (
          loadError ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpen />
                </EmptyMedia>
                <EmptyTitle>Projets indisponibles</EmptyTitle>
                <EmptyDescription>{loadError}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void load()}>
                  Réessayer
                </Button>
              </EmptyContent>
            </Empty>
          ) : view === "grid" ? (
            <GridSkeleton />
          ) : (
            <ListSkeleton />
          )
        ) : items.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clapperboard />
              </EmptyMedia>
              <EmptyTitle>{data.libraryTotal === 0 ? "Aucun projet" : "Aucun projet ne correspond"}</EmptyTitle>
              <EmptyDescription>
                {data.libraryTotal === 0 ? "Créez votre premier clip, ou importez un projet enregistré en JSON." : "Changez la recherche ou les filtres pour en voir d’autres."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              {data.libraryTotal === 0 ? (
                <Button asChild className="gap-2">
                  <Link href="/m/clip-studio/new">
                    <Plus className="size-4" />
                    Nouveau clip
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    navigate({ ...query, q: "", aspect: "", brand: "", origin: "", tag: "", exported: "", period: "", page: 1 });
                  }}
                >
                  Retirer les filtres
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : view === "grid" ? (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-[repeat(6,minmax(0,1fr))]">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((project) => (
                <motion.div key={project.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="min-w-0">
                  <ProjectCard
                    project={project}
                    kit={kits?.find((kit) => kit.id === project.brandKitId)}
                    kits={kits ?? []}
                    selected={selected.has(project.id)}
                    selecting={selected.size > 0}
                    onSelect={(value) => toggle(project.id, value)}
                    renaming={renaming === project.id}
                    status={rowStatus(project.id)}
                    actions={actions}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <Checkbox aria-label="Sélectionner la page" checked={allOnPage ? true : someOnPage ? "indeterminate" : false} onCheckedChange={(value) => togglePage(value === true)} />
                  </TableHead>
                  <TableHead className="w-20 sm:w-24">
                    <span className="sr-only">Vignette</span>
                  </TableHead>
                  <TableHead>
                    <SortButton label="Nom" active={query.sort === "name"} desc={query.dir === "desc"} onClick={() => patch(query.sort === "name" ? { dir: query.dir === "asc" ? "desc" : "asc", sort: "name" } : { sort: "name" })} />
                  </TableHead>
                  <TableHead className="hidden w-28 md:table-cell">Format</TableHead>
                  <TableHead className="hidden w-40 xl:table-cell">Marque</TableHead>
                  <TableHead className="hidden w-20 text-right sm:table-cell">
                    <SortButton label="Durée" align="right" active={query.sort === "duration"} desc={query.dir === "desc"} onClick={() => patch(query.sort === "duration" ? { dir: query.dir === "asc" ? "desc" : "asc", sort: "duration" } : { sort: "duration" })} />
                  </TableHead>
                  <TableHead className="hidden w-20 text-right lg:table-cell">Exports</TableHead>
                  <TableHead className="hidden w-36 lg:table-cell">
                    <SortButton label="Modifié" active={query.sort === "updated"} desc={query.dir === "desc"} onClick={() => patch(query.sort === "updated" ? { dir: query.dir === "asc" ? "desc" : "asc", sort: "updated" } : { sort: "updated" })} />
                  </TableHead>
                  <TableHead className="w-12 pr-3">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {items.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      kit={kits?.find((kit) => kit.id === project.brandKitId)}
                      kits={kits ?? []}
                      selected={selected.has(project.id)}
                      onSelect={(value) => toggle(project.id, value)}
                      renaming={renaming === project.id}
                      status={rowStatus(project.id)}
                      actions={actions}
                    />
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}

        {data ? <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={hrefFor} noun="projets" /> : null}
      </div>

      <TagsDialog
        projects={tagging}
        knownTags={(facets?.tags ?? []).map((entry) => entry.tag)}
        onClose={() => setTagging(null)}
        onDone={(message) => {
          setTagging(null);
          if (message) bulkFeedback.success(message);
          afterChange();
        }}
      />
      <DeleteDialog
        projects={removing}
        onClose={() => setRemoving(null)}
        onDone={(count) => {
          setRemoving(null);
          setSelected(new Set());
          if (count > 1) bulkFeedback.success(`${count} projets supprimés.`);
          afterChange();
        }}
      />
      <FormatDialog
        project={formatTarget}
        onClose={() => setFormatTarget(null)}
        onDone={() => {
          setFormatTarget(null);
          afterChange();
        }}
      />
      <BrandDialog
        project={brandTarget}
        kits={kits ?? []}
        onClose={() => setBrandTarget(null)}
        onDone={() => {
          setBrandTarget(null);
          afterChange();
        }}
      />
    </MotionConfig>
  );
}

function sortDirectionLabel(query: ProjectQuery): string {
  if (query.sort === "name") return query.dir === "asc" ? "A → Z" : "Z → A";
  if (query.sort === "duration") return query.dir === "desc" ? "Plus longs" : "Plus courts";
  return query.dir === "desc" ? "Plus récents" : "Plus anciens";
}

/** Un filtre : liste déroulante compacte, avec le nombre de projets de chaque valeur. */
function FilterSelect({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string; count?: number }[]; allLabel: string }) {
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
      <SelectTrigger size="sm" className={cn("w-auto max-w-full min-w-0", value && "border-primary/60")} aria-label={label}>
        <span className="shrink-0 text-muted-foreground">{label}&nbsp;:</span>
        {/* Le nom de l'option choisie et son nombre restent sur une ligne, côte à côte. */}
        <SelectValue className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap [&>span]:truncate" />
      </SelectTrigger>
      <SelectContent className="max-w-[min(24rem,calc(100vw-2rem))]">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="*:[span]:last:min-w-0">
            <span className="truncate" title={option.label}>
              {option.label}
            </span>
            {option.count !== undefined ? <span className="ml-auto pl-2 text-xs text-foreground/60 tabular-nums">{option.count}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Actions d'un projet ─────────────────────────────────────────

interface ProjectActions {
  rename: (project: ProjectSummary) => void;
  saveName: (project: ProjectSummary, name: string) => Promise<void>;
  cancelRename: () => void;
  tags: (project: ProjectSummary) => void;
  duplicate: (project: ProjectSummary) => Promise<void>;
  copyFormat: (project: ProjectSummary) => void;
  chooseBrand: (project: ProjectSummary) => void;
  download: (project: ProjectSummary) => Promise<void>;
  remove: (project: ProjectSummary) => void;
}

/** Applique (ou retire) une marque comme l'éditeur : thème chargé, polices prêtes, projet réenregistré. */
async function changeBrand(id: string, kitId: string | null) {
  const project = await callModule<ClipProject | null>("getProject", id);
  if (!project) throw new Error("Projet introuvable");
  const theme = kitId ? await fetchBrandTheme(kitId) : null;
  if (theme) await ensureBrandFonts(theme.fonts).catch(() => []);
  await callModule("saveProject", applyBrandTheme(project, theme));
}

/** Télécharge le projet en JSON : il se réimporte ici ou sur une autre instance qui a les mêmes médias. */
async function downloadProject(id: string) {
  const project = await callModule<ClipProject | null>("getProject", id);
  if (!project) throw new Error("Projet introuvable");
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "projet"}.clipstudio.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type MenuKind = "dropdown" | "context";

/** Les mêmes entrées pour le menu « … » et le clic droit. */
function ProjectMenuItems({ project, kits, actions, kind }: { project: ProjectSummary; kits: BrandKitChoice[]; actions: ProjectActions; kind: MenuKind }) {
  // Pas de sous-menu : sur un téléphone, il sortirait de l'écran. Format et marque s'ouvrent dans une fenêtre.
  const Item = kind === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator = kind === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;
  return (
    <>
      <Item asChild>
        <Link href={editHref(project.id)}>
          <Clapperboard className="mr-2 size-4" />
          Ouvrir
        </Link>
      </Item>
      <Item onSelect={() => actions.rename(project)}>
        <PencilLine className="mr-2 size-4" />
        Renommer
      </Item>
      <Item onSelect={() => actions.tags(project)}>
        <Tags className="mr-2 size-4" />
        Étiquettes…
      </Item>
      <Separator />
      <Item onSelect={() => void actions.duplicate(project)}>
        <Copy className="mr-2 size-4" />
        Dupliquer
      </Item>
      <Item onSelect={() => actions.copyFormat(project)}>
        <RectangleHorizontal className="mr-2 size-4" />
        Copie dans un autre format…
      </Item>
      {kits.length > 0 ? (
        <Item onSelect={() => actions.chooseBrand(project)}>
          <Palette className="mr-2 size-4" />
          Marque…
        </Item>
      ) : null}
      <Separator />
      <Item asChild>
        <Link href={`/m/clip-studio/export?project=${encodeURIComponent(project.id)}`}>
          <Send className="mr-2 size-4" />
          Exporter
        </Link>
      </Item>
      <Item asChild disabled={project.exportCount === 0}>
        <Link href={`/m/clip-studio/exports?project=${encodeURIComponent(project.id)}`}>
          <FileVideo className="mr-2 size-4" />
          Voir ses exports{project.exportCount > 0 ? ` (${project.exportCount})` : ""}
        </Link>
      </Item>
      <Item onSelect={() => void actions.download(project)}>
        <Download className="mr-2 size-4" />
        Télécharger le projet (JSON)
      </Item>
      <Separator />
      <Item variant="destructive" onSelect={() => actions.remove(project)}>
        <Trash2 className="mr-2 size-4" />
        Supprimer
      </Item>
    </>
  );
}

/** Nom modifiable sur place : Entrée enregistre, Échap annule. */
function RenameField({ project, onSave, onCancel }: { project: ProjectSummary; onSave: (name: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await onSave(value);
    setBusy(false);
  };
  return (
    <form
      className="flex min-w-0 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        autoFocus
        value={value}
        maxLength={200}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => !busy && void submit()}
        aria-label="Nouveau nom du projet"
        className="h-7 min-w-0 px-2 text-sm"
      />
    </form>
  );
}

function ProjectMeta({ project }: { project: ProjectSummary }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
      <span className="shrink-0">{formatClock(project.durationFrames / Math.max(1, project.fps))}</span>
      <span aria-hidden>·</span>
      {project.exportCount > 0 ? (
        <>
          <Link href={`/m/clip-studio/exports?project=${encodeURIComponent(project.id)}`} className="shrink-0 hover:text-foreground hover:underline">
            {project.exportCount} export{project.exportCount > 1 ? "s" : ""}
          </Link>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span className="min-w-0 truncate" title={new Date(project.updatedAt).toLocaleString("fr-FR")}>
        {formatRelative(project.updatedAt)}
      </span>
    </span>
  );
}

// ─── Grille ──────────────────────────────────────────────────────

function ProjectCard({
  project,
  kit,
  kits,
  selected,
  selecting,
  onSelect,
  renaming,
  status,
  actions,
}: {
  project: ProjectSummary;
  kit?: BrandKitChoice;
  kits: BrandKitChoice[];
  selected: boolean;
  selecting: boolean;
  onSelect: (value: boolean) => void;
  renaming: boolean;
  status: FeedbackState | null;
  actions: ProjectActions;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("group grid min-w-0 gap-1.5 rounded-lg", selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
          <div className="relative">
            <Link href={editHref(project.id)} className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ouvrir ${project.name}`}>
              <ProjectFrame project={project}>
                <AspectChip width={project.width} height={project.height} className="absolute bottom-1.5 left-1.5" />
                {project.brandKitId ? (
                  <span className="absolute right-1.5 bottom-1.5 flex max-w-[60%] items-center rounded bg-background/85 px-1.5 py-0.5 text-[10px] backdrop-blur">
                    <BrandName id={project.brandKitId} kit={kit} className="max-w-full" />
                  </span>
                ) : null}
              </ProjectFrame>
            </Link>
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => onSelect(value === true)}
              aria-label={`Sélectionner ${project.name}`}
              className={cn(
                "absolute top-1.5 left-1.5 size-5 bg-background/90 shadow-sm transition-opacity",
                selected || selecting ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              )}
            />
          </div>
          <div className="flex min-w-0 items-start gap-1 px-0.5">
            <div className="grid min-w-0 flex-1 gap-0.5">
              {renaming ? (
                <RenameField project={project} onSave={(name) => actions.saveName(project, name)} onCancel={actions.cancelRename} />
              ) : (
                <Link
                  href={editHref(project.id)}
                  className="truncate text-sm font-medium hover:underline"
                  title={project.name}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    actions.rename(project);
                  }}
                >
                  {project.name}
                </Link>
              )}
              <ProjectMeta project={project} />
              {project.tags.length > 0 ? (
                <span className="truncate text-[11px] text-muted-foreground" title={project.tags.join(", ")}>
                  {project.tags.map((tag) => `#${tag}`).join(" ")}
                </span>
              ) : null}
              <ActionStatus state={status} className="max-w-full empty:hidden" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100" aria-label={`Actions sur ${project.name}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <ProjectMenuItems project={project} kits={kits} actions={actions} kind="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ProjectMenuItems project={project} kits={kits} actions={actions} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-[repeat(6,minmax(0,1fr))]" aria-busy>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Liste ───────────────────────────────────────────────────────

function ProjectRow({
  project,
  kit,
  kits,
  selected,
  onSelect,
  renaming,
  status,
  actions,
}: {
  project: ProjectSummary;
  kit?: BrandKitChoice;
  kits: BrandKitChoice[];
  selected: boolean;
  onSelect: (value: boolean) => void;
  renaming: boolean;
  status: FeedbackState | null;
  actions: ProjectActions;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-state={selected ? "selected" : undefined} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted/40">
          <TableCell className="pl-4">
            <Checkbox checked={selected} onCheckedChange={(value) => onSelect(value === true)} aria-label={`Sélectionner ${project.name}`} />
          </TableCell>
          <TableCell>
            <Link href={editHref(project.id)} className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-muted" tabIndex={-1} aria-hidden>
              <ProjectThumbnail project={project} className="h-full max-w-full" />
            </Link>
          </TableCell>
          <TableCell className="min-w-0">
            <div className="grid min-w-0 gap-0.5">
              {renaming ? (
                <RenameField project={project} onSave={(name) => actions.saveName(project, name)} onCancel={actions.cancelRename} />
              ) : (
                <Link href={editHref(project.id)} className="truncate font-medium hover:underline" title={project.name}>
                  {project.name}
                </Link>
              )}
              <span className="truncate text-xs text-muted-foreground" title={[project.origin ? ORIGIN_LABELS[project.origin] : null, ...project.tags.map((tag) => `#${tag}`)].filter(Boolean).join(" · ")}>
                {[project.origin ? ORIGIN_LABELS[project.origin] : null, ...project.tags.map((tag) => `#${tag}`)].filter(Boolean).join(" · ") || " "}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums lg:hidden">
                {formatClock(project.durationFrames / Math.max(1, project.fps))} · {formatRelative(project.updatedAt)}
              </span>
              <ActionStatus state={status} className="max-w-full empty:hidden" />
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <span className="text-xs">{ASPECT_LABELS[project.aspect]}</span>
          </TableCell>
          <TableCell className="hidden min-w-0 xl:table-cell">
            {project.brandKitId ? <BrandName id={project.brandKitId} kit={kit} className="max-w-full text-xs" /> : <span className="text-xs text-muted-foreground">–</span>}
          </TableCell>
          <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">{formatClock(project.durationFrames / Math.max(1, project.fps))}</TableCell>
          <TableCell className="hidden text-right text-xs tabular-nums lg:table-cell">
            {project.exportCount > 0 ? (
              <Link href={`/m/clip-studio/exports?project=${encodeURIComponent(project.id)}`} className="hover:underline">
                {project.exportCount}
              </Link>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </TableCell>
          <TableCell className="hidden text-xs text-muted-foreground lg:table-cell" title={new Date(project.updatedAt).toLocaleString("fr-FR")}>
            {formatRelative(project.updatedAt)}
          </TableCell>
          <TableCell className="pr-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions sur ${project.name}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <ProjectMenuItems project={project} kits={kits} actions={actions} kind="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </motion.tr>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ProjectMenuItems project={project} kits={kits} actions={actions} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ListSkeleton() {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border" aria-busy>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="aspect-video w-20 rounded-md" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Fenêtres ────────────────────────────────────────────────────

/**
 * Étiquettes d'un projet (liste complète, modifiable) ou d'une sélection
 * (étiquettes à ajouter, étiquettes communes à retirer).
 */
function TagsDialog({ projects, knownTags, onClose, onDone }: { projects: ProjectSummary[] | null; knownTags: string[]; onClose: () => void; onDone: (message: string | null) => void }) {
  const single = projects?.length === 1 ? projects[0] : null;
  const [tags, setTags] = useState<string[]>([]);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  useEffect(() => {
    if (!projects) return;
    setTags(single ? single.tags : []);
    setRemove(new Set());
    feedback.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);
  const present = useMemo(() => {
    const set = new Map<string, string>();
    for (const project of projects ?? []) for (const tag of project.tags) set.set(tag.toLocaleLowerCase("fr"), tag);
    return [...set.values()];
  }, [projects]);
  const suggestions = knownTags.filter((tag) => !tags.some((entry) => entry.toLocaleLowerCase("fr") === tag.toLocaleLowerCase("fr"))).slice(0, 12);

  const save = async () => {
    if (!projects) return;
    setBusy(true);
    feedback.clear();
    try {
      if (single) {
        await updateProjectDetails({ id: single.id, tags });
        onDone(null);
      } else {
        const { updated } = await tagProjects({ ids: projects.map((project) => project.id), add: tags, remove: [...remove] });
        onDone(`Étiquettes mises à jour sur ${updated} projet${updated > 1 ? "s" : ""}.`);
      }
    } catch (error) {
      feedback.error(errorMessage(error, "Les étiquettes n’ont pas pu être enregistrées."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={projects !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{single ? "Étiquettes du projet" : `Étiqueter ${projects?.length ?? 0} projets`}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {single ? `« ${single.name} » : des mots pour ranger et retrouver vos projets.` : "Les étiquettes saisies s’ajoutent à chaque projet sélectionné ; cochez celles à retirer."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="project-tags">{single ? "Étiquettes" : "Ajouter"}</Label>
            <TagInput id="project-tags" value={tags} onChange={setTags} max={MAX_TAGS} maxTagLength={MAX_TAG_LENGTH} placeholder="Entrée ou virgule pour ajouter" showCount />
            {suggestions.length > 0 ? (
              <div className="flex min-w-0 flex-wrap gap-1">
                {suggestions.map((tag) => (
                  <Button key={tag} type="button" variant="outline" size="sm" className="h-6 max-w-full px-2 text-xs" onClick={() => setTags((current) => (current.length < MAX_TAGS ? [...current, tag] : current))}>
                    <span className="truncate">+ {tag}</span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          {!single && present.length > 0 ? (
            <div className="grid min-w-0 gap-1.5">
              <Label>Retirer</Label>
              <div className="flex min-w-0 flex-wrap gap-1">
                {present.map((tag) => {
                  const on = remove.has(tag);
                  return (
                    <Button
                      key={tag}
                      type="button"
                      variant={on ? "destructive" : "outline"}
                      size="sm"
                      className="h-6 max-w-full px-2 text-xs"
                      aria-pressed={on}
                      onClick={() =>
                        setRemove((current) => {
                          const next = new Set(current);
                          if (on) next.delete(tag);
                          else next.add(tag);
                          return next;
                        })
                      }
                    >
                      <span className="truncate">{tag}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <FormStatus state={feedback.state} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!single && tags.length === 0 && remove.size === 0}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ projects, onClose, onDone }: { projects: ProjectSummary[] | null; onClose: () => void; onDone: (count: number) => void }) {
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const count = projects?.length ?? 0;
  const exported = (projects ?? []).reduce((sum, project) => sum + project.exportCount, 0);
  const remove = async () => {
    if (!projects) return;
    setBusy(true);
    feedback.clear();
    try {
      const { deleted } = await deleteProjects(projects.map((project) => project.id));
      onDone(deleted);
    } catch (error) {
      feedback.error(errorMessage(error, "La suppression a échoué. Réessayez."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog
      open={projects !== null}
      onOpenChange={(open) => {
        if (busy) return;
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="[overflow-wrap:anywhere]">{count === 1 ? `Supprimer « ${projects![0].name} » ?` : `Supprimer ${count} projets ?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1 ? "Le montage disparaît ; les médias importés restent dans Mes médias." : "Les montages disparaissent ; les médias importés restent dans Mes médias."}
            {exported > 0 ? ` ${exported > 1 ? `Les ${exported} exports déjà rendus restent` : "L’export déjà rendu reste"} sur la page Exports.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormStatus state={feedback.state} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Garder</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // La fenêtre reste ouverte jusqu'à la fin : un échec s'y affiche.
              event.preventDefault();
              void remove();
            }}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy ? "Suppression…" : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Copie dans un autre format : un aperçu du cadre pour chaque format, l'original reste tel quel. */
function FormatDialog({ project, onClose, onDone }: { project: ProjectSummary | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<AspectPreset | null>(null);
  const feedback = useFeedback();
  useEffect(() => {
    if (project) feedback.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);
  const copy = async (aspect: AspectPreset) => {
    if (!project) return;
    setBusy(aspect);
    feedback.clear();
    try {
      await duplicateProject(project.id, aspect);
      onDone();
    } catch (error) {
      feedback.error(errorMessage(error, "La copie n’a pas pu être créée."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copie dans un autre format</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {project ? `« ${project.name} » reste tel quel ; la copie reprend tout le montage, recadré au format choisi.` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
          {ASPECT_PRESETS.filter((aspect) => aspect !== project?.aspect).map((aspect) => {
            const { width, height } = ASPECTS[aspect];
            return (
              <Button key={aspect} variant="outline" className="h-auto min-w-0 flex-col gap-2 py-3" disabled={busy !== null} onClick={() => void copy(aspect)}>
                <span className="flex h-12 items-center justify-center" aria-hidden>
                  <span className="rounded-sm border-2 border-current/60" style={{ width: width >= height ? 44 : Math.round((44 * width) / height), height: width >= height ? Math.round((44 * height) / width) : 44 }} />
                </span>
                <span className="grid min-w-0 text-center">
                  <span className="truncate text-sm font-medium">{ASPECTS[aspect].label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{busy === aspect ? "Copie…" : aspect}</span>
                </span>
              </Button>
            );
          })}
        </div>
        <FormStatus state={feedback.state} />
      </DialogContent>
    </Dialog>
  );
}

/** Changer la marque d'un projet comme dans l'inspecteur de l'éditeur : couleurs, polices, filigrane et carton de fin suivent. */
function BrandDialog({ project, kits, onClose, onDone }: { project: ProjectSummary | null; kits: BrandKitChoice[]; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const feedback = useFeedback();
  useEffect(() => {
    if (project) feedback.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);
  const apply = async (kitId: string | null) => {
    if (!project) return;
    setBusy(kitId ?? "none");
    feedback.clear();
    try {
      await changeBrand(project.id, kitId);
      onDone();
    } catch (error) {
      feedback.error(errorMessage(error, "La marque n’a pas pu être changée."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marque du projet</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {project ? `« ${project.name} » : couleurs, polices, filigrane et carton de fin suivent la marque choisie.` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] min-w-0 gap-1 overflow-y-auto">
          {kits.map((kit) => {
            const active = kit.id === project?.brandKitId;
            return (
              <Button key={kit.id} variant={active ? "secondary" : "ghost"} className="h-auto min-w-0 justify-start gap-2.5 px-2.5 py-2" disabled={busy !== null || active} onClick={() => void apply(kit.id)} aria-pressed={active}>
                <BrandName id={kit.id} kit={kit} className="min-w-0 flex-1 text-sm" />
                {busy === kit.id ? <Spinner className="size-4" /> : active ? <Check className="size-4 shrink-0 text-primary" /> : null}
              </Button>
            );
          })}
        </div>
        <FormStatus state={feedback.state} />
        {project?.brandKitId ? (
          <DialogFooter>
            <Button variant="outline" loading={busy === "none"} disabled={busy !== null} onClick={() => void apply(null)}>
              Retirer la marque
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
