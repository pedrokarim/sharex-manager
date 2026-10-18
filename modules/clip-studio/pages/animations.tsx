"use client";

/**
 * Animations de Clip Studio : la galerie de tout ce que le moteur sait
 * animer, pour le voir avant de le poser.
 *
 * - `/m/clip-studio/animations?tab=<onglet>` : un onglet par famille
 *   (éléments, texte, effets, mises en avant, transitions, caméra, effets de
 *   plan), des sections par catégorie, une carte vivante par animation ;
 * - une carte ouverte donne sa fiche : grand aperçu, réglages, détails et le
 *   chemin pour la poser dans l'éditeur.
 *
 * Les favoris sont ceux du sélecteur de l'éditeur (mêmes clés de stockage).
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowLeftRight,
  Blend,
  CaseSensitive,
  Focus,
  Grid3x3,
  Hash,
  Heading,
  Keyboard,
  Maximize2,
  Megaphone,
  Move,
  MoveRight,
  Palette,
  Repeat,
  RotateCw,
  Search,
  Shapes,
  SquareDashed,
  Star,
  Sun,
  Vibrate,
  WandSparkles,
  WholeWord,
  Wind,
  X,
  Zap,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { cn } from "@/lib/utils";
import { AnimationCard } from "../components/animation-card";
import { AnimationSheet } from "../components/animation-sheet";
import { useMotionFavorites } from "../components/motion-picker";
import { ScreenHeader } from "../components/screen-header";
import {
  GALLERY_TABS,
  filterGallery,
  galleryEntries,
  galleryFavoritesKey,
  gallerySectionsOf,
  galleryTabParser,
  galleryTotal,
  groupGallery,
  type GalleryEntry,
  type GalleryTab,
} from "../lib/motion-gallery";

/** Icône d'une section : par catégorie d'animation, de transition, de caméra ou d'effet. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  fade: Blend,
  slide: MoveRight,
  scale: Maximize2,
  rotate: RotateCw,
  mask: SquareDashed,
  "blur-light": Sun,
  "by-letter": CaseSensitive,
  "by-word": WholeWord,
  typing: Keyboard,
  glitch: Zap,
  impact: Vibrate,
  counter: Hash,
  title: Heading,
  attention: Megaphone,
  loop: Repeat,
  grid: Grid3x3,
  fades: Blend,
  slides: ArrowLeftRight,
  wipes: SquareDashed,
  zooms: ZoomIn,
  fast: Wind,
  light: Sun,
  pans: Move,
  impacts: Zap,
  mood: Focus,
  flashes: Sun,
  hits: Vibrate,
  color: Palette,
};

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("fr-FR")} ${count > 1 ? many : one}`;

export default function AnimationsPage() {
  const [tab, setTab] = useQueryState("tab", galleryTabParser);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<Partial<Record<GalleryTab, string>>>({});
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { favorites, toggle } = useMotionFavorites(galleryFavoritesKey(tab));

  const total = useMemo(() => galleryTotal(), []);
  const section = sections[tab] ?? "all";
  const entries = useMemo(() => galleryEntries(tab), [tab]);
  const sectionChoices = useMemo(() => gallerySectionsOf(tab), [tab]);
  const searching = query.trim().length > 0;
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

  const shown = useMemo(
    () => filterGallery(entries, { query, section, favoritesOnly, favorites }),
    [entries, query, section, favoritesOnly, favorites]
  );
  const groups = useMemo(() => (searching ? null : groupGallery(shown, tab)), [searching, shown, tab]);
  // Ordre de lecture de la fiche (précédente, suivante) : celui de l'écran.
  const order = useMemo(() => (groups ? groups.flatMap((group) => group.entries) : shown), [groups, shown]);

  // Pendant une recherche, chaque onglet dit combien de ses animations répondent.
  const tabCounts = useMemo(
    () =>
      Object.fromEntries(GALLERY_TABS.map((entry) => [entry.id, searching ? filterGallery(galleryEntries(entry.id), { query }).length : galleryEntries(entry.id).length])) as Record<
        GalleryTab,
        number
      >,
    [searching, query]
  );

  const favoriteCount = useMemo(() => entries.filter((entry) => favoriteIds.has(entry.id)).length, [entries, favoriteIds]);
  const openIndex = openKey ? order.findIndex((entry) => entry.key === openKey) : -1;
  const openEntry = openIndex >= 0 ? order[openIndex] : openKey ? (entries.find((entry) => entry.key === openKey) ?? null) : null;

  const openCard = useCallback((entry: GalleryEntry) => setOpenKey(entry.key), []);
  const setSection = (value: string) => setSections((current) => ({ ...current, [tab]: value }));
  const changeTab = (value: string) => {
    setOpenKey(null);
    void setTab(value as GalleryTab);
  };

  const filtersKey = `${tab}|${section}|${favoritesOnly}|${searching}`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full min-w-0 shrink-0 flex-col gap-6">
        <ScreenHeader
          back={{ href: "/m/clip-studio", label: "Projets" }}
          icon={WandSparkles}
          title="Animations"
          description={`Les ${total.toLocaleString("fr-FR")} animations intégrées à Clip Studio, telles qu’elles se posent depuis l’éditeur : une carte ouverte dit où les trouver.`}
        />

        <Tabs value={tab} onValueChange={changeTab} className="min-w-0 gap-4">
          <TabsList className="h-auto w-full min-w-0 flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5 sm:w-fit">
            {GALLERY_TABS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} className="min-w-0 flex-none gap-1.5 px-2.5">
                {entry.label}
                {/* Sur le fond de la barre, le gris atténué passait sous 4,5:1 : le texte à 70 % reste lisible. */}
                <span className="text-xs text-foreground/70 tabular-nums">{tabCounts[entry.id]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Barre d'outils : recherche, favoris, lecture de toutes les vignettes visibles. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
            <InputGroup className="min-w-0 flex-1 basis-60 sm:max-w-md">
              <InputGroupAddon align="inline-start">
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une animation…"
                aria-label="Rechercher une animation"
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <Toggle variant="outline" pressed={favoritesOnly} onPressedChange={setFavoritesOnly} aria-label="Favoris seulement" className="gap-1.5 px-3">
              <Star className={cn("size-4", favoritesOnly && "fill-amber-400 text-amber-500")} />
              Favoris
              <span className="text-xs text-muted-foreground tabular-nums">{favoriteCount}</span>
            </Toggle>
            <div className="flex items-center gap-2">
              <Switch id="animations-play-all" checked={playAll} onCheckedChange={setPlayAll} />
              <Label htmlFor="animations-play-all" className="font-normal">
                Tout lire
              </Label>
            </div>
          </div>

          {GALLERY_TABS.map((entry) => (
            <TabsContent key={entry.id} value={entry.id} className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 flex-wrap gap-1.5" role="toolbar" aria-label="Catégories">
                {[{ key: "all", label: "Toutes", count: entries.length }, ...sectionChoices].map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    aria-pressed={section === choice.key}
                    onClick={() => setSection(choice.key)}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      section === choice.key ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    )}
                  >
                    <span className="min-w-0 truncate" title={choice.label}>
                      {choice.label}
                    </span>
                    <span className="shrink-0 tabular-nums">{choice.count}</span>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={filtersKey}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex min-w-0 flex-col gap-4"
                >
                  {shown.length === 0 ? (
                    <Empty className="border border-dashed">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">{favoritesOnly && !searching ? <Star /> : <Search />}</EmptyMedia>
                        <EmptyTitle>{favoritesOnly && !searching ? "Pas encore de favori ici" : "Aucune animation ne correspond"}</EmptyTitle>
                        <EmptyDescription>
                          {favoritesOnly && !searching
                            ? "L’étoile d’une carte en ajoute un. Ce sont les mêmes favoris que dans le sélecteur de l’éditeur."
                            : "La recherche lit le nom, la catégorie, la phase et le découpage, sans tenir compte des accents."}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent className="flex-row flex-wrap justify-center">
                        {searching ? (
                          <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                            Effacer la recherche
                          </Button>
                        ) : null}
                        {favoritesOnly ? (
                          <Button variant="outline" size="sm" onClick={() => setFavoritesOnly(false)}>
                            Tout afficher
                          </Button>
                        ) : null}
                        {section !== "all" ? (
                          <Button variant="outline" size="sm" onClick={() => setSection("all")}>
                            Toutes les catégories
                          </Button>
                        ) : null}
                      </EmptyContent>
                    </Empty>
                  ) : groups ? (
                    groups.map((group) => (
                      <GallerySectionPanel
                        key={group.key}
                        icon={SECTION_ICONS[group.key] ?? Shapes}
                        title={group.label}
                        entries={group.entries}
                        favoriteIds={favoriteIds}
                        playAll={playAll}
                        onOpen={openCard}
                        onToggleFavorite={toggle}
                      />
                    ))
                  ) : (
                    <GallerySectionPanel
                      icon={Search}
                      title={plural(shown.length, "résultat", "résultats")}
                      entries={shown}
                      favoriteIds={favoriteIds}
                      playAll={playAll}
                      onOpen={openCard}
                      onToggleFavorite={toggle}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <AnimationSheet
        entry={openEntry}
        onOpenChange={(open) => !open && setOpenKey(null)}
        favorite={openEntry ? favoriteIds.has(openEntry.id) : false}
        onToggleFavorite={toggle}
        position={openIndex >= 0 ? { index: openIndex, total: order.length } : undefined}
        onPrevious={openIndex > 0 ? () => setOpenKey(order[openIndex - 1].key) : undefined}
        onNext={openIndex >= 0 && openIndex < order.length - 1 ? () => setOpenKey(order[openIndex + 1].key) : undefined}
      />
    </MotionConfig>
  );
}

/** Une catégorie : panneau à en-tête (icône, nom, nombre) et grille de cartes. */
function GallerySectionPanel({
  icon,
  title,
  entries,
  favoriteIds,
  playAll,
  onOpen,
  onToggleFavorite,
}: {
  icon: LucideIcon;
  title: string;
  entries: GalleryEntry[];
  favoriteIds: ReadonlySet<string>;
  playAll: boolean;
  onOpen: (entry: GalleryEntry) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <Panel>
      <PanelHeader icon={icon} title={title} description={plural(entries.length, "animation", "animations")} />
      <PanelBody className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-3 p-3 sm:p-4">
        {entries.map((entry) => (
          <AnimationCard key={entry.key} entry={entry} favorite={favoriteIds.has(entry.id)} playAll={playAll} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />
        ))}
      </PanelBody>
    </Panel>
  );
}
