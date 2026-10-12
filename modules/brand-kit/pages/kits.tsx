"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowDownAZ, ArrowUpDown, Clock, Copy, Download, FolderOpen, LayoutGrid, List, Plus, RefreshCw, Search, SearchX, Sparkles, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import illustration from "../branding/logo.png";
import { AssistantJobs } from "../components/assistant-jobs";
import { ConfirmDialog } from "../components/fields";
import { GalleryAssetsDialog } from "../components/gallery-assets-dialog";
import { KitCommandPalette, PaletteButton, usePaletteShortcut } from "../components/kit-command-palette";
import { KitHoverPreview } from "../components/kit-hover-preview";
import { ModuleShell } from "../components/module-shell";
import { NewKitSheet, type CreateTab } from "../components/new-kit-sheet";
import { ObjectContextMenu, ObjectMenuButton, type MenuEntry } from "../components/object-menu";
import { AccountAvatar } from "../components/sections/publishing-section";
import { api, downloadBase64, editorHref, errorMessage, type PublishAccount } from "../lib/client";
import { MODULE_PATH, type KitSummary } from "../lib/types";
import { useAssistantJobs } from "../lib/use-assistant-jobs";

/** Marques gardées entre deux visites : le retour à la liste est instantané. */
let snapshot: KitSummary[] | null = null;

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-x-5 gap-y-7";
/** En dessous de ce nombre, chercher et trier n'apportent rien : la barre d'outils reste cachée. */
const TOOLBAR_FROM = 5;
const VIEW_KEY = "brand-kit:view";

type Sort = "recent" | "name";
type View = "grid" | "list";

const fold = (text: string) => text.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export default function KitsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [kits, setKits] = useState<KitSummary[] | null>(snapshot);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; tab: CreateTab; duplicateFrom?: string }>({ open: false, tab: "manual" });
  const [doomed, setDoomed] = useState<KitSummary | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<string[] | null>(null);
  const [accounts, setAccounts] = useState<PublishAccount[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<View>("grid");
  const [paletteOpen, setPaletteOpen] = useState(false);

  usePaletteShortcut(setPaletteOpen);

  // Grille ou liste : un choix de confort, propre à ce navigateur.
  useEffect(() => setView(readView()), []);
  const changeView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sans stockage, le choix vaut pour cette visite.
    }
  };

  const refresh = useCallback(async () => {
    try {
      const next = await api.listKits();
      snapshot = next;
      setKits(next);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "Images de marque indisponibles."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const assistant = useAssistantJobs(() => void refresh());

  // Comptes connectés, pour les avatars : absents tant que le cœur ne les fournit pas.
  useEffect(() => {
    api.listPublishAccounts().then(setAccounts, () => undefined);
  }, []);

  // Arrivée depuis la galerie (« Ajouter à une image de marque ») ou depuis la palette de l'éditeur (« créer »).
  useEffect(() => {
    const action = params.get("action");
    const create = params.get("create");
    if (action !== "add-assets" && create !== "manual" && create !== "assistant") return;
    if (action === "add-assets") {
      const names = (params.get("files") ?? "").split(",").map((name) => name.trim()).filter(Boolean);
      if (names.length > 0) setGalleryFiles(names);
    } else {
      setSheet({ open: true, tab: create as CreateTab });
    }
    router.replace(MODULE_PATH, { scroll: false });
  }, [params, router]);

  const openSheet = (tab: CreateTab, duplicateFrom?: string) => setSheet({ open: true, tab, duplicateFrom });

  const duplicate = async (kit: KitSummary) => {
    try {
      await api.createKit({ name: `${kit.name} (copie)`.slice(0, 80), from: kit.id });
      toast.success("Image de marque dupliquée");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Duplication impossible."));
    }
  };

  const makeDefault = async (kit: KitSummary) => {
    try {
      const next = await api.setDefaultKit(kit.id);
      snapshot = next;
      setKits(next);
      toast.success(`« ${kit.name} » est la marque par défaut`);
    } catch (error) {
      toast.error(errorMessage(error, "Changement impossible."));
    }
  };

  const exportZip = async (kit: KitSummary) => {
    const pending = toast.loading("Préparation de l’archive…");
    try {
      const archive = await api.exportKit(kit.id);
      downloadBase64(archive.fileName, archive.data);
      toast.success("Archive téléchargée", { id: pending });
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."), { id: pending });
    }
  };

  const remove = async (kit: KitSummary) => {
    try {
      await api.deleteKit(kit.id);
      setKits((previous) => {
        const next = previous && previous.filter((entry) => entry.id !== kit.id);
        snapshot = next;
        return next;
      });
      toast.success("Image de marque supprimée");
      // Une autre marque a pu devenir celle par défaut.
      void refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    }
  };

  /** Les mêmes entrées derrière « … » et au clic droit, en grille comme en liste. */
  const entriesFor = (kit: KitSummary): MenuEntry[] => [
    { key: "open", label: "Ouvrir", icon: FolderOpen, href: editorHref(kit.id) },
    { key: "duplicate", label: "Dupliquer", icon: Copy, onSelect: () => void duplicate(kit) },
    { key: "default", label: "Définir par défaut", icon: Star, onSelect: () => void makeDefault(kit), disabled: kit.isDefault },
    { key: "export", label: "Exporter (ZIP)", icon: Download, onSelect: () => void exportZip(kit) },
    { key: "delete", label: "Supprimer", icon: Trash2, onSelect: () => setDoomed(kit), destructive: true, separatorBefore: true },
  ];

  const accountsOf = (kit: KitSummary) => accounts.filter((account) => kit.accountIds.includes(account.id));

  const showToolbar = (kits?.length ?? 0) >= TOOLBAR_FROM;
  const visible = useMemo(() => {
    if (!kits) return null;
    const needle = fold(query.trim());
    const list = showToolbar && needle ? kits.filter((kit) => fold(`${kit.name} ${kit.tagline ?? ""}`).includes(needle)) : [...kits];
    return list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) : b.updatedAt - a.updatedAt));
  }, [kits, query, sort, showToolbar]);
  const listView = showToolbar && view === "list";

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        description="Palette, polices, logos et ton d’une chaîne, appliqués aux vidéos et aux captures."
        actions={
          <>
            <PaletteButton onClick={() => setPaletteOpen(true)} />
            <Button className="gap-2" onClick={() => openSheet("manual")}>
              <Plus className="size-4" />
              Nouvelle image de marque
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6 pb-4">
          <AssistantJobs jobs={assistant.jobs} onCancel={(id) => void assistant.cancel(id)} onDismiss={assistant.dismiss} />

          {showToolbar && (
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup className="w-full sm:w-72">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput aria-label="Chercher une image de marque" placeholder="Chercher une marque…" value={query} onChange={(event) => setQuery(event.target.value)} />
                {query && (
                  <InputGroupAddon align="inline-end" className="pr-1.5 has-[>button]:mr-0">
                    <InputGroupButton size="icon-xs" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                      <X />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
              <ToggleGroup type="single" variant="outline" size="sm" value={sort} onValueChange={(value) => value && setSort(value as Sort)} aria-label="Ordre">
                <ToggleGroupItem value="recent" className="gap-1.5">
                  <Clock />
                  Récentes
                </ToggleGroupItem>
                <ToggleGroupItem value="name" className="gap-1.5">
                  <ArrowDownAZ />
                  Nom
                </ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(value) => value && changeView(value as View)} aria-label="Affichage" className="ml-auto">
                <ToggleGroupItem value="grid" aria-label="Grille" title="Grille">
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Liste" title="Liste">
                  <List />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {visible === null ? (
            failed ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Images de marque indisponibles</EmptyTitle>
                  <EmptyDescription>La liste n’a pas pu être chargée.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
                    <RefreshCw className="size-4" />
                    Réessayer
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className={GRID} aria-hidden>
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="flex flex-col gap-2">
                    <Skeleton className="aspect-video rounded-xl" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
              </div>
            )
          ) : kits!.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader className="max-w-md">
                <EmptyMedia>
                  <Image src={illustration} alt="" width={160} height={160} className="size-36 object-contain" priority />
                </EmptyMedia>
                <EmptyTitle>Créez votre première image de marque</EmptyTitle>
                <EmptyDescription>
                  Une marque réunit la palette, les polices, les logos et le ton d’une chaîne. Clip Studio et le filigrane des captures la suivent ensuite sans retouche.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="max-w-md flex-row flex-wrap justify-center">
                <Button className="gap-2" onClick={() => openSheet("manual")}>
                  <Plus className="size-4" />
                  Créer à la main
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => openSheet("assistant")}>
                  <Sparkles className="size-4" />
                  Créer avec l’assistant
                </Button>
              </EmptyContent>
            </Empty>
          ) : visible.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>Aucune marque ne correspond</EmptyTitle>
                <EmptyDescription className="break-words">Rien pour « {query.trim()} ».</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  Effacer la recherche
                </Button>
              </EmptyContent>
            </Empty>
          ) : listView ? (
            <KitsTable kits={visible} sort={sort} onSort={setSort} accountsOf={accountsOf} entriesFor={entriesFor} />
          ) : (
            <ul className={GRID}>
              <AnimatePresence initial={false}>
                {visible.map((kit) => (
                  <motion.li
                    key={kit.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.18 }}
                    className="min-w-0"
                  >
                    <KitCard kit={kit} accounts={accountsOf(kit)} entries={entriesFor(kit)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </ModuleShell>

      <NewKitSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((previous) => ({ ...previous, open }))}
        tab={sheet.tab}
        kits={kits ?? []}
        duplicateFrom={sheet.duplicateFrom}
        jobs={assistant.jobs}
        onCreated={(kit) => {
          void refresh();
          router.push(editorHref(kit.id));
        }}
        onAssistantStarted={() => void assistant.refresh()}
        onCancelJob={(id) => void assistant.cancel(id)}
      />

      <KitCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} kits={kits} onCreate={() => openSheet("manual")} onAssistant={() => openSheet("assistant")} />

      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(open) => !open && setDoomed(null)}
        title={`Supprimer « ${doomed?.name ?? ""} » ?`}
        description="La fiche, ses images, ses polices et ses formats exportés seront supprimés. Les vidéos déjà montées gardent leur rendu. C’est définitif."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (doomed) void remove(doomed);
          setDoomed(null);
        }}
      />

      <GalleryAssetsDialog
        files={galleryFiles}
        kits={kits}
        onClose={() => setGalleryFiles(null)}
        onDone={(kitId) => {
          setGalleryFiles(null);
          router.push(editorHref(kitId));
        }}
      />
    </MotionConfig>
  );
}

function swatchesOf(kit: KitSummary) {
  const { palette } = kit;
  return [palette.background, palette.ink, palette.accent, palette.accentSecondary, palette.surface, ...palette.extras].filter(
    (color, index, list): color is string => Boolean(color) && list.indexOf(color) === index
  );
}

function Swatches({ kit, max = 7 }: { kit: KitSummary; max?: number }) {
  return (
    <span className="flex shrink-0 -space-x-1" aria-label="Palette">
      {swatchesOf(kit)
        .slice(0, max)
        .map((color) => (
          <span key={color} className="size-3.5 rounded-full border border-background ring-1 ring-border" style={{ backgroundColor: color }} />
        ))}
    </span>
  );
}

function AccountStack({ accounts }: { accounts: PublishAccount[] }) {
  if (accounts.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-label={`Comptes liés : ${accounts.map((account) => account.label ?? account.name).join(", ")}`}>
      {accounts.slice(0, 4).map((account) => (
        <span key={account.id} title={account.label ?? account.name} className="rounded-full ring-2 ring-background">
          <AccountAvatar account={account} size="sm" />
        </span>
      ))}
      {accounts.length > 4 && (
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background tabular-nums">+{accounts.length - 4}</span>
      )}
    </span>
  );
}

/** Vignette d'une marque : sa bannière exportée, sinon son logo, sinon son nom. */
function KitThumbnail({ kit, compact = false, className }: { kit: KitSummary; compact?: boolean; className?: string }) {
  const { palette } = kit;
  return (
    <span className={cn("relative block overflow-hidden", className)} style={{ backgroundColor: palette.background }}>
      {kit.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- bannière exportée, servie par le module
        <img src={kit.bannerUrl} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : kit.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo de la marque, servi par le module
        <img src={kit.logoUrl} alt="" loading="lazy" draggable={false} className="absolute inset-0 m-auto h-1/2 w-2/3 object-contain transition-transform duration-300 group-hover:scale-[1.04]" />
      ) : compact ? (
        // Trop petite pour un nom : l'initiale, dans l'encre de la marque.
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold uppercase" style={{ color: palette.ink }}>
          {kit.name.trim().charAt(0) || "?"}
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xl font-bold tracking-tight" style={{ color: palette.ink }}>
          {/* Un nom long passe à la ligne, même sans espace, et s'arrête à trois lignes. */}
          <span className="line-clamp-3 [overflow-wrap:anywhere]">{kit.name}</span>
        </span>
      )}
    </span>
  );
}

function KitCard({ kit, accounts, entries }: { kit: KitSummary; accounts: PublishAccount[]; entries: MenuEntry[] }) {
  const href = editorHref(kit.id);
  return (
    <ObjectContextMenu entries={entries}>
      <div className="group flex min-w-0 flex-col gap-2">
        <HoverCard openDelay={450} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Link
              href={href}
              aria-label={`Ouvrir ${kit.name}`}
              className="block aspect-video overflow-hidden rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <KitThumbnail kit={kit} className="h-full w-full" />
            </Link>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" align="start" className="w-[22rem] max-w-[calc(100vw-2rem)] p-3">
            <KitHoverPreview summary={kit} />
          </HoverCardContent>
        </HoverCard>
        <div className="flex min-w-0 items-start gap-1 px-0.5">
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-sm font-medium hover:underline" title={kit.name}>
              {kit.name}
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <Swatches kit={kit} />
              <AccountStack accounts={accounts} />
              {kit.isDefault && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <Star aria-hidden className="size-3 shrink-0 fill-current" />
                  <span className="truncate">par défaut</span>
                </span>
              )}
            </div>
          </div>
          <ObjectMenuButton
            entries={entries}
            label={`Actions de ${kit.name}`}
            className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          />
        </div>
      </div>
    </ObjectContextMenu>
  );
}

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

function sinceLabel(time: number) {
  const seconds = Math.round((time - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "à l’instant";
}

/** La liste : comparer les marques d'un coup d'œil (palette, comptes liés, fraîcheur), triée d'un clic sur l'en-tête. */
function KitsTable({
  kits,
  sort,
  onSort,
  accountsOf,
  entriesFor,
}: {
  kits: KitSummary[];
  sort: Sort;
  onSort: (sort: Sort) => void;
  accountsOf: (kit: KitSummary) => PublishAccount[];
  entriesFor: (kit: KitSummary) => MenuEntry[];
}) {
  const router = useRouter();
  const sortButton = (value: Sort, label: string) => (
    <button
      type="button"
      onClick={() => onSort(value)}
      aria-pressed={sort === value}
      className={cn("inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", sort === value && "text-foreground")}
    >
      {label}
      <ArrowUpDown aria-hidden className={cn("size-3.5", sort === value ? "opacity-100" : "opacity-40")} />
    </button>
  );
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{sortButton("name", "Marque")}</TableHead>
          <TableHead className="hidden w-40 md:table-cell">Palette</TableHead>
          <TableHead className="hidden w-36 lg:table-cell">Comptes liés</TableHead>
          <TableHead className="hidden w-36 sm:table-cell">{sortButton("recent", "Modifiée")}</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kits.map((kit) => {
          const entries = entriesFor(kit);
          return (
            <ObjectContextMenu key={kit.id} entries={entries}>
              <TableRow className="group cursor-pointer" onClick={(event) => !(event.target as HTMLElement).closest("a,button") && router.push(editorHref(kit.id))}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <KitThumbnail kit={kit} compact className="aspect-video w-16 shrink-0 rounded-md border" />
                    <div className="min-w-0">
                      <Link href={editorHref(kit.id)} className="flex min-w-0 items-center gap-1.5 font-medium hover:underline" title={kit.name}>
                        <span className="truncate">{kit.name}</span>
                        {kit.isDefault && <Star aria-label="par défaut" className="size-3 shrink-0 fill-current text-muted-foreground" />}
                      </Link>
                      {kit.tagline && (
                        <p className="truncate text-xs text-muted-foreground" title={kit.tagline}>
                          {kit.tagline}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Swatches kit={kit} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {accountsOf(kit).length > 0 ? <AccountStack accounts={accountsOf(kit)} /> : <span className="text-xs text-muted-foreground">Aucun</span>}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground sm:table-cell" title={fullDate.format(kit.updatedAt)}>
                  {sinceLabel(kit.updatedAt)}
                </TableCell>
                <TableCell>
                  <ObjectMenuButton entries={entries} label={`Actions de ${kit.name}`} />
                </TableCell>
              </TableRow>
            </ObjectContextMenu>
          );
        })}
      </TableBody>
    </Table>
  );
}
