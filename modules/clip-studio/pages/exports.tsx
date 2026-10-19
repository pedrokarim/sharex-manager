"use client";

/**
 * Exports de Clip Studio (dossier 01 ter, § 2 et § 3.2).
 *
 * - `/m/clip-studio/exports` : tous les exports, en tableau ou en grille,
 *   paginés par 24 : recherche, format, projet, marque, période et, pour
 *   les administrateurs, service et état de publication ; tout vit dans
 *   l'adresse. Chaque ligne ouvre la fiche.
 * - `/m/clip-studio/exports?id=<id>` : la fiche d'un export. Lecteur et
 *   caractéristiques, projet d'origine, couverture, textes de publication
 *   (texte commun et variantes par service), crédits figés au rendu,
 *   publications (une ligne par compte, avec lien et statistiques), envois
 *   retrouvés dans la file par la source, et les actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clapperboard,
  Copy,
  CopyX,
  Download,
  ExternalLink,
  Eye,
  FileVideo,
  History,
  ImageUp,
  LayoutGrid,
  List,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  ThumbsUp,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
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
import { ActionStatus, FormStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { ServiceLogo, formatBytes } from "@/components/connections/shared";
import { formatSchedule } from "@/components/connections/date-time-picker";
import { retryJobAction } from "@/app/(app)/admin/connections/actions";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { PublishJobSummary } from "@/lib/connections/types";
import type { ClipExport } from "../engine/types";
import {
  callModule,
  defaultPostTexts,
  draftPostTexts,
  exportUrl,
  getExport,
  getExportPublications,
  listExportPublications,
  searchExports,
  sendExportToGallery,
  updateExportPost,
  useBrandKits,
  type ExportPage,
  type ExportPublicationDetails,
  type PublicationAccount,
} from "../lib/client";
import { creditsText, emptyPost, mergeDraft, samePost, setPostField } from "../lib/export-screens";
import type { ExportDetails, ExportPost, PostTextField } from "../lib/post-types";
import {
  ASPECT_LABELS,
  ASPECT_PRESETS,
  EXPORT_SORTS,
  EXPORT_SORT_LABELS,
  EXPORT_STATUSES,
  EXPORT_STATUS_LABELS,
  PERIODS,
  PERIOD_LABELS,
  exportQueryString,
  exportTitle,
  hasExportFilters,
  parseExportQuery,
  updateExportQuery,
  type ChannelState,
  type ExportPublications,
  type ExportQuery,
  type LibraryView,
  type PublicationRow,
} from "../lib/library";
import { exportHref, publishHref } from "../components/export-card";
import { ExportCover } from "../components/export-cover";
import { SendToGalleryButton } from "../components/gallery-button";
import { PostTextsEditor } from "../components/post-texts-editor";
import { JobTimeline, MOVING, formatDuration, jobsPending, serviceTargets, type PublishTargets } from "../components/publish-shared";
import { ScreenHeader } from "../components/screen-header";
import { AspectChip, ChannelLogos, ExportPoster, FiltersBar, Pager, SortButton, formatClock, formatCount, formatRelative, formatShortDate, type ConnectorBadge } from "../components/library-ui";

export default function ExportsPage() {
  const params = useSearchParams();
  const id = params.get("id");
  return <MotionConfig reducedMotion="user">{id ? <ExportDetail key={id} id={id} /> : <ExportsList />}</MotionConfig>;
}

function useIsAdmin() {
  const { data: session } = useSession();
  return session?.user?.role === "admin";
}

/** Cibles de publication (services et comptes), lues une fois. */
function usePublishTargets(): PublishTargets | null | undefined {
  const [targets, setTargets] = useState<PublishTargets | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void callModule<PublishTargets>("listPublishTargets")
      .then((next) => alive && setTargets(next))
      .catch(() => alive && setTargets(null));
    return () => {
      alive = false;
    };
  }, []);
  return targets;
}

// ─── Liste ───────────────────────────────────────────────────────

const BASE = "/m/clip-studio/exports";
const VIEW_KEY = "clip-studio.exports.view";
const ALL = "__all";

/** Pages déjà vues, par adresse : le retour à la liste est instantané. */
const pages = new Map<string, ExportPage>();

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
    // Stockage refusé : la vue reste dans l'adresse.
  }
}

/** De quoi afficher les publications : services et comptes. */
interface PublicationContext {
  connectors: ConnectorBadge[];
  accounts: PublicationAccount[];
}

function ExportsList() {
  const { data: session, isPending: sessionPending } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const kits = useBrandKits();
  const targets = usePublishTargets();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useMemo(() => parseExportQuery(new URLSearchParams(params.toString())), [params]);
  const urlView: LibraryView | null = params.get("view") === "grid" ? "grid" : params.get("view") === "list" ? "list" : null;
  const [storedView, setStoredView] = useState<LibraryView | null>(null);
  useEffect(() => setStoredView(readStoredView()), []);
  const view: LibraryView = urlView ?? storedView ?? "list";
  const key = `${isAdmin ? "a" : "u"}${exportQueryString(query)}`;

  const [data, setData] = useState<ExportPage | null>(() => pages.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const navigate = useCallback(
    (next: ExportQuery, nextView: LibraryView = view) => router.replace(`${pathname}${exportQueryString(next, nextView)}`, { scroll: false }),
    [router, pathname, view]
  );
  const patch = useCallback((change: Partial<ExportQuery>) => navigate(updateExportQuery(query, change)), [navigate, query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await searchExports(query, isAdmin);
      pages.set(key, next);
      setData(next);
      setLoadError(null);
      if (next.page !== query.page) navigate({ ...query, page: next.page });
    } catch (error) {
      setLoadError(errorMessage(error, "Les exports n’ont pas pu être chargés."));
    } finally {
      setLoading(false);
    }
  }, [query, key, isAdmin, navigate]);

  useEffect(() => {
    // Le rôle décide des publications : on attend la session plutôt que de lire deux fois.
    if (sessionPending) return;
    const cached = pages.get(key);
    if (cached) setData(cached);
    void load();
    // Une lecture par adresse (et par rôle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sessionPending]);

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

  const rowFeedback = useFeedback();
  const [rowTarget, setRowTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ClipExport | null>(null);
  const afterChange = () => {
    pages.clear();
    void load();
  };
  const sendToGallery = async (entry: ClipExport) => {
    setRowTarget(entry.id);
    rowFeedback.clear();
    try {
      await sendExportToGallery(entry.id);
      rowFeedback.success("Ajouté à la galerie.");
      afterChange();
    } catch (error) {
      rowFeedback.error(errorMessage(error, "L’envoi dans la galerie a échoué."));
    }
  };

  const items = data?.items ?? [];
  const facets = data?.facets;
  const filtered = hasExportFilters(query);
  const clearFilters = () => {
    setSearch("");
    navigate({ ...query, q: "", aspect: "", brand: "", project: "", channel: "", status: "", period: "", page: 1 });
  };
  const connectorList: ConnectorBadge[] = useMemo(() => {
    const known = new Map<string, ConnectorBadge>();
    for (const connector of targets?.connectors ?? []) known.set(connector.id, { id: connector.id, label: connector.label, logo: connector.logo });
    for (const id of facets?.channels ?? []) if (!known.has(id)) known.set(id, { id, label: id, logo: id });
    return [...known.values()];
  }, [targets, facets]);
  const context: PublicationContext = {
    connectors: connectorList,
    accounts: (targets?.accounts ?? []).map((account) => ({ id: account.id, connector: account.connector, connectorLabel: account.connectorLabel, logo: account.logo, displayName: account.displayName })),
  };
  const kitName = (id: string) => kits?.find((kit) => kit.id === id)?.name ?? "Marque introuvable";
  const hrefFor = (page: number) => `${BASE}${exportQueryString({ ...query, page }, view)}`;
  const toggleSort = (sort: ExportQuery["sort"]) => patch(query.sort === sort ? { sort, dir: query.dir === "asc" ? "desc" : "asc" } : { sort });

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-5">
      <ScreenHeader
        back={{ href: "/m/clip-studio", label: "Accueil de Clip Studio" }}
        icon={FileVideo}
        title="Exports"
        description={
          data
            ? `${data.libraryTotal.toLocaleString("fr-FR")} clip${data.libraryTotal > 1 ? "s" : ""} rendu${data.libraryTotal > 1 ? "s" : ""}, avec leur couverture, leurs textes et ${isAdmin ? "les comptes où ils sont publiés" : "leurs crédits"}.`
            : "Chaque clip rendu, avec sa couverture, ses textes de publication et l’endroit où il a été publié."
        }
      />

      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <InputGroup className="w-full min-w-0 sm:w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Titre ou projet" aria-label="Chercher un export" />
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
            <Select value={query.sort} onValueChange={(value) => patch({ sort: value as ExportQuery["sort"] })}>
              <SelectTrigger size="sm" className="w-auto min-w-0" aria-label="Trier par">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {EXPORT_SORT_LABELS[sort]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="w-28" onClick={() => patch({ sort: query.sort, dir: query.dir === "asc" ? "desc" : "asc" })} aria-label="Inverser l’ordre">
              {query.sort === "name" ? (query.dir === "asc" ? "A → Z" : "Z → A") : query.sort === "date" ? (query.dir === "desc" ? "Plus récents" : "Plus anciens") : query.dir === "desc" ? "Décroissant" : "Croissant"}
            </Button>
            <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(value) => value && setView(value as LibraryView)} aria-label="Affichage">
              <ToggleGroupItem value="list" aria-label="Liste" className="px-2.5">
                <List className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grille" className="px-2.5">
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <FiltersBar activeCount={[query.status, query.channel, query.aspect, query.project, query.brand, query.period].filter(Boolean).length} onClear={filtered ? clearFilters : undefined}>
          {isAdmin ? (
            <>
              <FilterSelect
                label="État"
                value={query.status}
                onChange={(value) => patch({ status: value as ExportQuery["status"] })}
                options={EXPORT_STATUSES.map((status) => ({ value: status, label: EXPORT_STATUS_LABELS[status] }))}
                allLabel="Tous les états"
              />
              {(facets?.channels.length ?? 0) > 0 || query.channel ? (
                <FilterSelect
                  label="Publié sur"
                  value={query.channel}
                  onChange={(value) => patch({ channel: value })}
                  options={(facets?.channels ?? []).map((id) => {
                    const connector = connectorList.find((entry) => entry.id === id);
                    return { value: id, label: connector?.label ?? id, logo: connector?.logo };
                  })}
                  allLabel="Tous les services"
                />
              ) : null}
            </>
          ) : null}
          <FilterSelect
            label="Format"
            value={query.aspect}
            onChange={(value) => patch({ aspect: value as ExportQuery["aspect"] })}
            options={ASPECT_PRESETS.map((aspect) => ({ value: aspect, label: ASPECT_LABELS[aspect] }))}
            allLabel="Tous les formats"
          />
          {(facets?.projects.length ?? 0) > 1 || query.project ? (
            <FilterSelect
              label="Projet"
              value={query.project}
              onChange={(value) => patch({ project: value })}
              options={(facets?.projects ?? []).map((project) => ({ value: project.id, label: project.name, count: project.count }))}
              allLabel="Tous les projets"
            />
          ) : null}
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
            label="Période"
            value={query.period}
            onChange={(value) => patch({ period: value as ExportQuery["period"] })}
            options={PERIODS.map((period) => ({ value: period, label: `Rendus ces ${PERIOD_LABELS[period]}` }))}
            allLabel="Toutes les dates"
          />
        </FiltersBar>
      </div>

      {data === null ? (
        loadError ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileVideo />
              </EmptyMedia>
              <EmptyTitle>Exports indisponibles</EmptyTitle>
              <EmptyDescription>{loadError}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void load()}>
                Réessayer
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border" aria-busy>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="aspect-video w-24 rounded-md" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="hidden h-4 w-20 sm:block" />
              </div>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileVideo />
            </EmptyMedia>
            <EmptyTitle>{data.libraryTotal === 0 ? "Aucun export" : "Aucun export ne correspond"}</EmptyTitle>
            <EmptyDescription>{data.libraryTotal === 0 ? "Ouvrez un projet puis « Exporter » : le clip rendu arrive ici." : "Changez la recherche ou les filtres pour en voir d’autres."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {data.libraryTotal === 0 ? (
              <Button asChild variant="outline">
                <Link href="/m/clip-studio/projects">Voir les projets</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={clearFilters}>
                Retirer les filtres
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-[repeat(6,minmax(0,1fr))]">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((entry) => (
              <motion.div key={entry.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="min-w-0">
                <ExportGridCard
                  entry={entry}
                  publications={data.publications?.[entry.id]}
                  context={context}
                  isAdmin={isAdmin}
                  status={rowTarget === entry.id ? rowFeedback.state : null}
                  onGallery={() => void sendToGallery(entry)}
                  onRemove={() => setRemoving(entry)}
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
                <TableHead className="w-24 pl-4 sm:w-32">
                  <span className="sr-only">Affiche</span>
                </TableHead>
                <TableHead>
                  <SortButton label="Titre" active={query.sort === "name"} desc={query.dir === "desc"} onClick={() => toggleSort("name")} />
                </TableHead>
                {isAdmin ? <TableHead className="hidden w-36 md:table-cell">Publications</TableHead> : null}
                <TableHead className="hidden w-20 lg:table-cell">Format</TableHead>
                <TableHead className="hidden w-20 text-right sm:table-cell">
                  <SortButton label="Durée" align="right" active={query.sort === "duration"} desc={query.dir === "desc"} onClick={() => toggleSort("duration")} />
                </TableHead>
                <TableHead className="hidden w-24 text-right xl:table-cell">
                  <SortButton label="Poids" align="right" active={query.sort === "size"} desc={query.dir === "desc"} onClick={() => toggleSort("size")} />
                </TableHead>
                <TableHead className="hidden w-32 lg:table-cell">
                  <SortButton label="Rendu" active={query.sort === "date"} desc={query.dir === "desc"} onClick={() => toggleSort("date")} />
                </TableHead>
                <TableHead className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {items.map((entry) => (
                  <ExportRow
                    key={entry.id}
                    entry={entry}
                    publications={data.publications?.[entry.id]}
                    context={context}
                    isAdmin={isAdmin}
                    status={rowTarget === entry.id ? rowFeedback.state : null}
                    onGallery={() => void sendToGallery(entry)}
                    onRemove={() => setRemoving(entry)}
                  />
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      )}

      {data ? <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} hrefFor={hrefFor} noun="exports" /> : null}

      <DeleteExportDialog
        entry={removing}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          afterChange();
        }}
      />
    </div>
  );
}

/** Un filtre : liste déroulante compacte, avec le nombre d'éléments de chaque valeur et le logo d'un service. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count?: number; logo?: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
      <SelectTrigger size="sm" className={cn("w-auto max-w-full min-w-0", value && "border-primary/60")} aria-label={label}>
        <span className="shrink-0 text-muted-foreground">{label}&nbsp;:</span>
        {/* Le logo et le nom de l'option choisie restent sur une ligne, côte à côte. */}
        <SelectValue className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap [&>span]:truncate" />
      </SelectTrigger>
      <SelectContent className="max-w-[min(24rem,calc(100vw-2rem))]">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="*:[span]:last:min-w-0">
            {option.logo ? <ServiceLogo logo={option.logo} /> : null}
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

/** Les mêmes entrées pour le menu « … » et le clic droit d'un export. */
function ExportMenuItems({ entry, isAdmin, kind, onGallery, onRemove }: { entry: ClipExport; isAdmin: boolean; kind: "dropdown" | "context"; onGallery: () => void; onRemove: () => void }) {
  const Item = kind === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator = kind === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;
  return (
    <>
      <Item asChild>
        <Link href={exportHref(entry.id)}>
          <FileVideo className="mr-2 size-4" />
          Ouvrir la fiche
        </Link>
      </Item>
      {isAdmin ? (
        <Item asChild>
          <Link href={publishHref(entry.id)}>
            <Send className="mr-2 size-4" />
            Publier
          </Link>
        </Item>
      ) : null}
      <Item asChild>
        <a href={exportUrl(entry.file)} download={`${entry.projectName}.mp4`}>
          <Download className="mr-2 size-4" />
          Télécharger
        </a>
      </Item>
      {entry.galleryFile ? (
        <Item asChild>
          <Link href="/gallery">
            <ImageUp className="mr-2 size-4" />
            Voir dans la galerie
          </Link>
        </Item>
      ) : (
        <Item onSelect={onGallery}>
          <ImageUp className="mr-2 size-4" />
          Envoyer dans la galerie
        </Item>
      )}
      <Item asChild>
        <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`}>
          <Clapperboard className="mr-2 size-4" />
          Ouvrir le projet
        </Link>
      </Item>
      <Separator />
      <Item variant="destructive" onSelect={onRemove}>
        <Trash2 className="mr-2 size-4" />
        Supprimer l’export
      </Item>
    </>
  );
}

interface ExportItemProps {
  entry: ClipExport;
  publications?: ExportPublications;
  context: PublicationContext;
  isAdmin: boolean;
  status: FeedbackState | null;
  onGallery: () => void;
  onRemove: () => void;
}

function PublicationCell({ publications, context }: { publications?: ExportPublications; context: PublicationContext }) {
  if (!publications) return <Skeleton className="h-4 w-16" />;
  if (publications.rows.length === 0) return <span className="text-xs text-muted-foreground">{EXPORT_STATUS_LABELS.none}</span>;
  const failedCount = publications.rows.filter((row) => row.state === "failed").length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <ChannelLogos rows={publications.rows} connectors={context.connectors} accounts={context.accounts} />
      {failedCount > 0 ? <span className="text-[11px] text-destructive">{failedCount > 1 ? `${failedCount} échecs` : "1 échec"}</span> : null}
    </span>
  );
}

function ExportRow({ entry, publications, context, isAdmin, status, onGallery, onRemove }: ExportItemProps) {
  const title = exportTitle(entry);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-b transition-colors hover:bg-muted/50">
          <TableCell className="pl-4">
            <Link href={exportHref(entry.id)} className="relative block aspect-video w-full overflow-hidden rounded-md bg-black" tabIndex={-1} aria-hidden>
              <ExportPoster entry={entry} />
            </Link>
          </TableCell>
          <TableCell className="min-w-0">
            <div className="grid min-w-0 gap-0.5">
              <Link href={exportHref(entry.id)} className="truncate font-medium hover:underline" title={title}>
                {title}
              </Link>
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Clapperboard className="size-3 shrink-0" aria-hidden />
                <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`} className="min-w-0 truncate hover:text-foreground hover:underline" title={entry.projectName}>
                  {entry.projectName}
                </Link>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums lg:hidden">
                {formatClock(entry.durationMs / 1000)} · {formatShortDate(entry.createdAt)}
              </span>
              {isAdmin ? (
                <span className="md:hidden">
                  <PublicationCell publications={publications} context={context} />
                </span>
              ) : null}
              <ActionStatus state={status} className="max-w-full empty:hidden" />
            </div>
          </TableCell>
          {isAdmin ? (
            <TableCell className="hidden md:table-cell">
              <PublicationCell publications={publications} context={context} />
            </TableCell>
          ) : null}
          <TableCell className="hidden lg:table-cell">
            <AspectChip width={entry.width} height={entry.height} className="bg-muted" />
          </TableCell>
          <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">{formatClock(entry.durationMs / 1000)}</TableCell>
          <TableCell className="hidden text-right text-xs tabular-nums xl:table-cell">{formatBytes(entry.sizeBytes)}</TableCell>
          <TableCell className="hidden text-xs text-muted-foreground lg:table-cell" title={new Date(entry.createdAt).toLocaleString("fr-FR")}>
            {formatShortDate(entry.createdAt)}
          </TableCell>
          <TableCell className="pr-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions sur ${title}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <ExportMenuItems entry={entry} isAdmin={isAdmin} kind="dropdown" onGallery={onGallery} onRemove={onRemove} />
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </motion.tr>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ExportMenuItems entry={entry} isAdmin={isAdmin} kind="context" onGallery={onGallery} onRemove={onRemove} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ExportGridCard({ entry, publications, context, isAdmin, status, onGallery, onRemove }: ExportItemProps) {
  const title = exportTitle(entry);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group grid min-w-0 gap-1.5">
          <Link href={exportHref(entry.id)} className="relative block aspect-video w-full overflow-hidden rounded-lg bg-black focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ouvrir la fiche de ${title}`}>
            <ExportPoster entry={entry} />
            <AspectChip width={entry.width} height={entry.height} className="absolute top-1.5 left-1.5" />
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">{formatClock(entry.durationMs / 1000)}</span>
          </Link>
          <div className="flex min-w-0 items-start gap-1 px-0.5">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <Link href={exportHref(entry.id)} className="truncate text-sm font-medium hover:underline" title={title}>
                {title}
              </Link>
              <span className="truncate text-[11px] text-muted-foreground tabular-nums">
                {formatShortDate(entry.createdAt)} · {formatBytes(entry.sizeBytes)}
              </span>
              {isAdmin ? (
                <span className="min-h-5">
                  <PublicationCell publications={publications} context={context} />
                </span>
              ) : null}
              <ActionStatus state={status} className="max-w-full empty:hidden" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100" aria-label={`Actions sur ${title}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <ExportMenuItems entry={entry} isAdmin={isAdmin} kind="dropdown" onGallery={onGallery} onRemove={onRemove} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ExportMenuItems entry={entry} isAdmin={isAdmin} kind="context" onGallery={onGallery} onRemove={onRemove} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Confirmation de suppression d'un export depuis la liste ; un échec reste dans la fenêtre. */
function DeleteExportDialog({ entry, onClose, onDone }: { entry: ClipExport | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  useEffect(() => {
    if (entry) feedback.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  const remove = async () => {
    if (!entry) return;
    setBusy(true);
    feedback.clear();
    try {
      await callModule("deleteExport", entry.id);
      onDone();
    } catch (error) {
      feedback.error(errorMessage(error, "L’export n’a pas pu être supprimé. Réessayez."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={entry !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="[overflow-wrap:anywhere]">{entry ? `Supprimer « ${exportTitle(entry)} » ?` : "Supprimer cet export ?"}</AlertDialogTitle>
          <AlertDialogDescription>La vidéo, sa couverture, ses sous-titres et ses textes disparaissent. Les publications déjà faites restent en ligne chez chaque service.</AlertDialogDescription>
        </AlertDialogHeader>
        <FormStatus state={feedback.state} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Garder</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
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

// ─── Fiche ───────────────────────────────────────────────────────

const DETAIL_TABS = ["texts", "publications", "credits"] as const;

function ExportDetail({ id }: { id: string }) {
  const router = useRouter();
  // Onglet gardé dans l'adresse (?tab=) : un lien ou le bouton Retour rouvrent le même.
  const [detailTab, setDetailTab] = useQueryState("tab", parseAsStringLiteral(DETAIL_TABS).withDefault("texts").withOptions({ history: "push" }));
  const isAdmin = useIsAdmin();
  const targets = usePublishTargets();
  const [details, setDetails] = useState<ExportDetails | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    getExport(id)
      .then((next) => alive && setDetails(next))
      .catch((reason) => {
        if (!alive) return;
        setDetails(null);
        setError(reason instanceof Error ? reason.message : "Export introuvable");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // ─── Publications ──────────────────────────────────────────────
  const [jobs, setJobs] = useState<PublishJobSummary[] | null>(null);
  const loadJobs = useCallback(async () => {
    const next = await listExportPublications(id).catch(() => null);
    if (next) setJobs([...next].sort((a, b) => b.createdAt - a.createdAt));
    return next;
  }, [id]);
  useEffect(() => {
    if (isAdmin) void loadJobs();
  }, [isAdmin, loadJobs]);
  useEffect(() => {
    if (!jobs || !jobsPending(jobs)) return;
    const timer = setTimeout(() => void loadJobs(), jobs.some((job) => MOVING.has(job.state)) ? 2000 : 15000);
    return () => clearTimeout(timer);
  }, [jobs, loadJobs]);

  // ─── Textes ────────────────────────────────────────────────────
  const entry = details?.export ?? null;
  const [post, setPost] = useState<ExportPost | null>(null);
  const [saved, setSaved] = useState<ExportPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("base");
  useEffect(() => {
    if (!entry) return;
    let alive = true;
    // Un export d'avant les textes de publication part de ceux de la marque, comme sa publication.
    const initial = entry.post ? Promise.resolve(entry.post) : defaultPostTexts(entry.id).catch(() => emptyPost(0));
    void initial.then((value) => {
      if (!alive) return;
      setPost(value);
      setSaved(value);
    });
    return () => {
      alive = false;
    };
    // Une seule fois par export : les rechargements suivants ne doivent pas écraser une saisie en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);
  const dirty = Boolean(post && saved && !samePost(post, saved));

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const services = useMemo(() => (entry && targets ? serviceTargets(targets.connectors, entry, details?.hashtagRules ?? {}) : []), [entry, targets, details?.hashtagRules]);

  // Retours de l'onglet Textes : l'enregistrement répond dans sa barre, la
  // reprise de la marque au bout de la rangée de boutons.
  const saveFeedback = useFeedback();
  const toolbarFeedback = useFeedback();
  const creditsCopy = useCopyToClipboard();
  const editPost = (next: ExportPost) => {
    setPost(next);
    if (saveFeedback.state?.tone === "error") saveFeedback.clear();
  };

  const save = async () => {
    if (!post || !entry) return;
    setSaving(true);
    saveFeedback.clear();
    try {
      const next = await updateExportPost(entry.id, post, saved?.updatedAt || undefined);
      setPost(next);
      setSaved(next);
      saveFeedback.success("Textes enregistrés.");
    } catch (reason) {
      saveFeedback.error(errorMessage(reason, "Les textes n’ont pas pu être enregistrés. Réessayez."));
    } finally {
      setSaving(false);
    }
  };

  const [brandBusy, setBrandBusy] = useState(false);
  const fromBrand = async () => {
    if (!post || !entry) return;
    setBrandBusy(true);
    toolbarFeedback.clear();
    try {
      const previous = post;
      const next = await defaultPostTexts(entry.id);
      setPost({ ...next, updatedAt: post.updatedAt });
      // Le toast reste : il porte « Annuler », qui rend les textes d'avant.
      toast.success(details?.brand ? `Textes repris de la marque « ${details.brand.name} ».` : "Textes repris du projet.", {
        description: "Rien n’est enregistré tant que vous n’enregistrez pas.",
        action: { label: "Annuler", onClick: () => setPost(previous) },
      });
    } catch (reason) {
      toolbarFeedback.error(errorMessage(reason, "La marque n’a pas pu être relue. Réessayez dans un instant."));
    } finally {
      setBrandBusy(false);
    }
  };

  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const [draftOpen, setDraftOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const draft = async (field?: { connectorId: string | null; kind: PostTextField }) => {
    if (!entry) return;
    const key = field ? `${field.connectorId ?? "base"}.${field.kind}` : "all";
    setDrafting((current) => new Set([...current, key]));
    setDraftOpen(false);
    try {
      const result = await draftPostTexts(entry.id, {
        connectors: services.map((service) => service.connector.id),
        ...(field ? { fields: [field.kind] } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      });
      setPost((current) => {
        if (!current) return current;
        if (field?.connectorId) {
          // Un seul champ d'un service : sa variante proposée, sinon le texte commun proposé, devient la sienne.
          const value = result.post.variants[field.connectorId]?.[field.kind] ?? result.post.base[field.kind];
          const next = setPostField(current, field.connectorId, field.kind, value as never);
          const key = `${field.connectorId}.${field.kind}`;
          return { ...next, unreviewed: [...new Set([...(next.unreviewed ?? []), key])] };
        }
        const keys = field ? result.unreviewed.filter((entryKey) => entryKey === `base.${field.kind}`) : result.unreviewed;
        return mergeDraft(current, { base: result.post.base, variants: result.post.variants, unreviewed: keys }, keys);
      });
      // L'assistant rédige en fond (jusqu'à une minute) : sa fin se notifie, où que l'on soit.
      toast.success(field ? "Proposition prête, à relire." : "Propositions prêtes, à relire.", { description: "Rien n’est enregistré sans votre accord." });
    } catch (reason) {
      toast.error(errorMessage(reason, "L’assistant n’a pas pu rédiger. Réessayez dans un instant."));
    } finally {
      setDrafting((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Un échec reste dans la fenêtre de confirmation, qui ne se ferme qu'une fois l'export supprimé.
  const deleteFeedback = useFeedback();
  const remove = async () => {
    if (!entry) return;
    setDeleting(true);
    deleteFeedback.clear();
    try {
      await callModule("deleteExport", entry.id);
      // La fiche disparaît : le toast confirme sur la liste.
      toast.success("Export supprimé.");
      router.push("/m/clip-studio/exports");
    } catch (reason) {
      deleteFeedback.error(errorMessage(reason, "L’export n’a pas pu être supprimé. Réessayez."));
      setDeleting(false);
    }
  };

  if (details === undefined) return <DetailSkeleton />;
  if (!details || !entry) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileVideo />
          </EmptyMedia>
          <EmptyTitle>Export introuvable</EmptyTitle>
          <EmptyDescription>{error ?? "Il a peut-être été supprimé."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href="/m/clip-studio/exports">Tous les exports</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const url = exportUrl(entry.file);
  const ratio = entry.width && entry.height ? entry.width / entry.height : 16 / 9;
  const credits = entry.credits ?? [];
  const allDrafting = drafting.has("all");

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6">
      <ScreenHeader
        back={{ href: "/m/clip-studio/exports", label: "Tous les exports" }}
        icon={FileVideo}
        title={entry.projectName}
        fullTitle={entry.projectName}
        description={`Rendu le ${formatSchedule(entry.createdAt)}${details.brand ? ` · marque « ${details.brand.name} »` : ""}`}
        actions={
          <>
            {isAdmin ? (
              <Button asChild className="gap-2">
                <Link href={publishHref(entry.id)}>
                  <Send className="size-4" />
                  Publier
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="gap-2">
              <a href={url} download={`${entry.projectName}.mp4`}>
                <Download className="size-4" />
                Télécharger
              </a>
            </Button>
            <SendToGalleryButton entry={entry} onSent={(fileName) => setDetails((current) => (current ? { ...current, export: { ...current.export, galleryFile: fileName } } : current))} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Autres actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {details.project.exists ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`}>
                      <Clapperboard className="mr-2 size-4" />
                      Ouvrir le projet
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-2 size-4" />
                  Supprimer l’export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <aside className="grid min-w-0 content-start gap-6 lg:sticky lg:top-0 lg:self-start" aria-label="Le fichier rendu">
          <div className="flex min-w-0 justify-center rounded-lg bg-muted/40 p-2">
            <video
              ref={videoRef}
              src={url}
              controls
              playsInline
              preload="metadata"
              style={{ aspectRatio: `${ratio}`, ["--ratio" as string]: ratio }}
              className="block w-[min(100%,calc(40vh*var(--ratio)))] max-w-full rounded-md bg-black object-contain lg:w-[min(100%,calc(56vh*var(--ratio)))]"
            />
          </div>

          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Format</dt>
            <dd className="min-w-0 tabular-nums">
              MP4 · {entry.width} × {entry.height}
            </dd>
            <dt className="text-muted-foreground">Durée</dt>
            <dd className="tabular-nums">{formatDuration(entry.durationMs)}</dd>
            <dt className="text-muted-foreground">Poids</dt>
            <dd className="tabular-nums">{formatBytes(entry.sizeBytes)}</dd>
            <dt className="text-muted-foreground">Volume</dt>
            <dd className="min-w-0 tabular-nums">
              {entry.loudness ? `${entry.loudness.lufs.toLocaleString("fr-FR")} LUFS, crête ${entry.loudness.peakDb.toLocaleString("fr-FR")} dB` : "non mesuré"}
            </dd>
            <dt className="text-muted-foreground">Sous-titres</dt>
            <dd className="min-w-0">
              {entry.subtitles ? (
                <a href={exportUrl(entry.subtitles.file)} download className="underline underline-offset-2">
                  Fichier .srt ({entry.subtitles.language})
                </a>
              ) : (
                "aucun"
              )}
            </dd>
          </dl>

          <OriginProject details={details} />

          <Separator />

          <ExportCover entry={entry} video={() => videoRef.current} onChanged={(next) => setDetails((current) => (current ? { ...current, export: next } : current))} />
        </aside>

        <div className="grid min-w-0 content-start gap-6">
          {isAdmin ? <PublicationsPanel entryId={entry.id} jobsKey={(jobs ?? []).map((job) => `${job.id}:${job.state}`).join(",")} onChanged={() => void loadJobs()} /> : null}
        <Tabs value={detailTab} onValueChange={(next) => void setDetailTab(next === "texts" ? null : (next as (typeof DETAIL_TABS)[number]))} className="min-w-0 gap-4">
          {/* Onglets sur plusieurs lignes : hauteur fixe, sinon la hauteur en pourcentage des onglets s'étire et ils passent sur les champs. */}
          <TabsList className="h-auto w-full min-w-0 flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
            <TabsTrigger value="texts" className="flex-none px-3">
              Textes
            </TabsTrigger>
            <TabsTrigger value="publications" className="flex-none px-3">
              Envois{jobs && jobs.length > 0 ? ` (${jobs.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex-none px-3">
              Crédits{credits.length > 0 ? ` (${credits.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="texts" className="grid min-w-0 content-start gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void fromBrand()} loading={brandBusy} disabled={saving}>
                <History className="size-4" />
                Reprendre la marque
              </Button>
              <Popover open={draftOpen} onOpenChange={setDraftOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" loading={allDrafting} disabled={saving}>
                    <Wand2 className="size-4" />
                    {allDrafting ? "Rédaction…" : "Rédiger avec l’assistant"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="grid w-[min(22rem,calc(100vw-2rem))] gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-instructions">Consigne (facultative)</Label>
                    <Textarea id="draft-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} maxLength={1000} placeholder="Plus court, tutoie, insiste sur…" className="[overflow-wrap:anywhere]" />
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground">
                    Tout le jeu est proposé d’un coup, avec une variante courte pour chaque service dont les limites l’exigent. Les propositions arrivent marquées «&nbsp;à relire&nbsp;».
                  </p>
                  <Button size="sm" className="gap-2" onClick={() => void draft()}>
                    <Sparkles className="size-4" />
                    Rédiger
                  </Button>
                </PopoverContent>
              </Popover>
              <ActionStatus state={toolbarFeedback.state} className="max-w-full" />
            </div>

            {post ? (
              <PostTextsEditor
                post={post}
                onChange={editPost}
                services={services}
                showBase
                tab={tab}
                onTabChange={setTab}
                regenerating={drafting}
                onRegenerate={(connectorId, kind) => void draft({ connectorId, kind })}
                disabled={saving || allDrafting}
                idPrefix={`export-${entry.id}`}
              />
            ) : null}

            <AnimatePresence initial={false}>
              {/* La barre reste le temps de dire « Textes enregistrés », puis s'en va. */}
              {dirty || saveFeedback.state?.tone === "success" ? (
                <motion.div
                  key="save"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-3 backdrop-blur"
                >
                  <div className="min-w-0 basis-full empty:hidden">
                    <FormStatus state={saveFeedback.state?.tone === "error" ? saveFeedback.state : null} />
                  </div>
                  {dirty ? (
                    <>
                      <p className="text-sm text-muted-foreground">Modifications non enregistrées</p>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            saveFeedback.clear();
                            setPost(saved);
                          }}
                          disabled={saving}
                        >
                          <Undo2 className="size-4" />
                          Annuler
                        </Button>
                        <Button size="sm" className="gap-1.5" onClick={() => void save()} loading={saving}>
                          Enregistrer
                        </Button>
                      </div>
                    </>
                  ) : (
                    <ActionStatus state={saveFeedback.state} className="text-sm" />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="publications" className="grid min-w-0 content-start gap-4">
            {!isAdmin ? (
              <p className="text-sm text-muted-foreground">Les publications sont réservées aux administrateurs.</p>
            ) : jobs === null ? (
              <div className="grid gap-3" aria-busy>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : jobs.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Send />
                  </EmptyMedia>
                  <EmptyTitle>Pas encore publié</EmptyTitle>
                  <EmptyDescription>Chaque envoi de cet export apparaîtra ici, compte par compte, avec son état et son lien.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild className="gap-2">
                    <Link href={publishHref(entry.id)}>
                      <Send className="size-4" />
                      Publier
                    </Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {jobs.length > 1 ? `${jobs.length} envois` : "1 envoi"}, les plus récents d’abord.
                  </p>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void loadJobs()}>
                    <RefreshCw className="size-3.5" />
                    Actualiser
                  </Button>
                </div>
                <JobTimeline jobs={jobs} accounts={targets?.accounts ?? []} connectors={targets?.connectors ?? []} onChanged={() => void loadJobs()} authorizeReturn={exportHref(entry.id)} showDate />
              </>
            )}
          </TabsContent>

          <TabsContent value="credits" className="grid min-w-0 content-start gap-3">
            {credits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune mention relevée au rendu : le clip n’utilise que vos médias.</p>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-pretty text-muted-foreground">Relevés dans le projet au moment du rendu.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void creditsCopy.copyToClipboard(creditsText(credits))}
                    aria-live="polite"
                  >
                    {creditsCopy.hasCopied ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : creditsCopy.copyFailed ? (
                      <CopyX className="size-3.5 text-destructive" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {creditsCopy.hasCopied ? "Copié" : creditsCopy.copyFailed ? "Copie impossible" : "Copier"}
                  </Button>
                </div>
                <ul className="grid min-w-0 gap-1.5 text-sm">
                  {credits.map((credit) => (
                    <li key={credit} className="min-w-0 [overflow-wrap:anywhere]">
                      {credit}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TabsContent>
        </Tabs>
        </div>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (deleting) return;
          if (open) deleteFeedback.clear();
          setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet export ?</AlertDialogTitle>
            <AlertDialogDescription>
              La vidéo, sa couverture, ses sous-titres et ses textes disparaissent. Les publications déjà faites restent en ligne chez chaque service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormStatus state={deleteFeedback.state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // La fenêtre reste ouverte jusqu'à la fin : un échec s'y affiche.
                event.preventDefault();
                void remove();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Projet d'origine : lien, et « le projet a changé depuis » avec « Exporter à nouveau ». */
function OriginProject({ details }: { details: ExportDetails }) {
  const entry = details.export;
  if (!details.project.exists) {
    return <p className="text-sm text-muted-foreground">Le projet d’origine a été supprimé.</p>;
  }
  const name = details.project.name ?? entry.projectName;
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        <Clapperboard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="shrink-0 text-muted-foreground">Projet</span>
        <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(entry.projectId)}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline" title={name}>
          {name}
        </Link>
      </p>
      {details.projectChanged ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
          <span>Le projet a changé depuis cet export.</span>
          <Link href={`/m/clip-studio/export?project=${encodeURIComponent(entry.projectId)}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
            Exporter à nouveau
            <ArrowRight className="size-3" />
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6" aria-busy>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-64 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Publications d'un export ────────────────────────────────────

const ROW_STATE: Record<ChannelState, { icon: typeof CircleCheck; className: string }> = {
  published: { icon: CircleCheck, className: "text-emerald-700 dark:text-emerald-400" },
  scheduled: { icon: CalendarClock, className: "text-primary" },
  pending: { icon: CircleDashed, className: "text-amber-700 dark:text-amber-400" },
  failed: { icon: CircleAlert, className: "text-destructive" },
  cancelled: { icon: CircleSlash, className: "text-muted-foreground" },
};

/** Ce que dit la ligne d'un compte : état et date. */
function rowStateText(row: PublicationRow): string {
  if (row.state === "published") return `Publié ${formatRelative(row.at)}`;
  if (row.state === "scheduled") return `Programmé pour le ${formatSchedule(row.publishAt ?? row.at)}`;
  if (row.state === "pending") return "Envoi en cours";
  if (row.state === "failed") return `Échec ${formatRelative(row.at)}`;
  return `Annulé ${formatRelative(row.at)}`;
}

/**
 * Où en est l'export, compte par compte : logo et nom du compte, état, lien
 * vers la publication, date, statistiques lues chez le service ; reprendre un
 * envoi raté, publier sur un autre compte. Le détail de chaque envoi (suites,
 * progression) reste dans l'onglet « Envois ».
 */
function PublicationsPanel({ entryId, jobsKey, onChanged }: { entryId: string; jobsKey: string; onChanged: () => void }) {
  const [details, setDetails] = useState<ExportPublicationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rowFeedback = useFeedback();
  const [rowTarget, setRowTarget] = useState<string | null>(null);
  const headerFeedback = useFeedback();

  const load = useCallback(
    async (refresh = false) => {
      try {
        const next = await getExportPublications(entryId, refresh);
        setDetails(next);
        setError(null);
        return next;
      } catch (reason) {
        setError(errorMessage(reason, "Les publications n’ont pas pu être lues."));
        return null;
      }
    },
    [entryId]
  );
  // Relue quand la file change (un envoi avance, une reprise part).
  useEffect(() => {
    void load();
  }, [load, jobsKey]);

  const refreshStats = async () => {
    setRefreshing(true);
    headerFeedback.clear();
    const next = await load(true);
    setRefreshing(false);
    if (next?.statsErrors.length) headerFeedback.error(next.statsErrors[0]);
    else if (next) headerFeedback.success("Statistiques à jour.");
  };

  const retry = async (row: PublicationRow) => {
    setBusy(row.jobId);
    rowFeedback.clear();
    const result = await retryJobAction(row.jobId);
    setBusy(null);
    if (!result.ok) {
      setRowTarget(row.accountId);
      rowFeedback.error(result.error || "La reprise n’a pas abouti. Réessayez dans un instant.");
    }
    onChanged();
    void load();
  };

  const rows = details?.rows ?? [];
  const accountOf = (id: string) => details?.accounts.find((account) => account.id === id);
  const connectorOf = (id: string) => details?.connectors.find((connector) => connector.id === id);
  const hasStats = rows.some((row) => row.state === "published" && row.externalId);

  return (
    <Panel aria-labelledby="export-publications">
      <PanelHeader
        icon={Send}
        titleId="export-publications"
        title="Publications"
        description="Un compte par ligne : état, lien vers la publication et statistiques."
        actions={
          <>
            <ActionStatus state={headerFeedback.state} className="max-w-full" />
            {hasStats ? (
              <Button variant="ghost" size="sm" className="gap-1.5" loading={refreshing} onClick={() => void refreshStats()}>
                <RefreshCw className="size-3.5" />
                Statistiques
              </Button>
            ) : null}
            <Button asChild size="sm" variant={rows.length > 0 ? "outline" : "default"} className="gap-1.5">
              <Link href={publishHref(entryId)}>
                <Send className="size-3.5" />
                {rows.length > 0 ? "Publier ailleurs" : "Publier"}
              </Link>
            </Button>
          </>
        }
      />
      {details === null && !error ? (
        <PanelRows aria-busy>
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </PanelRows>
      ) : error && !details ? (
        <PanelBody>
          <p className="text-sm text-destructive">{error}</p>
        </PanelBody>
      ) : rows.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-pretty text-muted-foreground">Pas encore publié. Chaque compte où l’export partira aura sa ligne ici, avec son état, son lien et ses statistiques.</p>
        </PanelBody>
      ) : (
        <PanelRows>
          <AnimatePresence initial={false}>
            {rows.map((row) => {
              const account = accountOf(row.accountId);
              const connector = connectorOf(row.connector);
              const tone = ROW_STATE[row.state];
              const Icon = tone.icon;
              return (
                <motion.div key={row.accountId} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {connector ? <ServiceLogo logo={connector.logo} className="size-4" /> : null}
                    </span>
                    <div className="grid min-w-0 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        <span className="min-w-0 truncate font-medium" title={account?.displayName ?? row.accountId}>
                          {account?.displayName ?? "Compte retiré"}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{connector?.label ?? row.connector}</span>
                      </span>
                      <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", tone.className)}>
                        <Icon className="size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {rowStateText(row)}
                          {row.attempts > 1 ? <span className="text-muted-foreground"> · {row.attempts} envois</span> : null}
                        </span>
                      </span>
                      {row.error && row.state !== "published" ? <span className="text-xs text-pretty text-destructive [overflow-wrap:anywhere]">{row.error}</span> : null}
                      {row.stats ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="size-3.5" aria-hidden />
                            {formatCount(row.stats.views)} vue{(row.stats.views ?? 0) > 1 ? "s" : ""}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ThumbsUp className="size-3.5" aria-hidden />
                            {formatCount(row.stats.likes)}
                          </span>
                          {row.stats.comments !== undefined ? (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="size-3.5" aria-hidden />
                              {formatCount(row.stats.comments)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      <ActionStatus state={rowTarget === row.accountId ? rowFeedback.state : null} className="max-w-full empty:hidden" />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
                    {row.url ? (
                      <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
                        <a href={row.url} target="_blank" rel="noreferrer noopener">
                          Voir
                          <ExternalLink className="size-3" />
                        </a>
                      </Button>
                    ) : null}
                    {row.retryable ? (
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" loading={busy === row.jobId} onClick={() => void retry(row)}>
                        <RotateCcw className="size-3.5" />
                        Reprendre
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                      <Link href={`/admin/connections/${encodeURIComponent(row.accountId)}`}>Fiche du compte</Link>
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </PanelRows>
      )}
      {details?.statsFetchedAt ? <PanelFooter>Statistiques lues {formatRelative(details.statsFetchedAt)}, gardées dix minutes avant d’être relues chez le service.</PanelFooter> : null}
    </Panel>
  );
}
