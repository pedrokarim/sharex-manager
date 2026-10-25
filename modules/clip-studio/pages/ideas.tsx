"use client";

/**
 * Idées de vidéos (dossier 01, « Idées de vidéos »).
 *
 * - « Chercher des idées » : un sujet en mots-clés ou en phrase entière
 *   (Codex en dégage le sujet et l'angle), et les réglages de la série à
 *   côté (marque, nombre, part d'actualité, formes, format, web). Codex
 *   propose des sujets avec titre, accroche, angle, concept, « pourquoi
 *   maintenant » et les options de création (forme, durée, découpage,
 *   format, vidéo source).
 * - Chaque idée : « Créer depuis cette idée » (page « Nouveau clip »
 *   préremplie, tout reste modifiable), « Garder », « Écarter »,
 *   « Autres accroches ».
 * - Banque de concepts de la marque, nourrie par l'écran « Niche »
 *   (`pages/niche.tsx` : comptes de référence, mesure, vidéos qui sortent
 *   du lot).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  BookMarked,
  Check,
  ChevronDown,
  Clock,
  Copy,
  CopyX,
  ExternalLink,
  Film,
  Lightbulb,
  Newspaper,
  Plus,
  Repeat,
  RotateCcw,
  Shapes,
  Sparkles,
  Settings2,
  Telescope,
  ThumbsDown,
  Trash2,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionStatus, FormStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ThinkingStatus, type OrbState } from "@/components/loading";
import { ScreenHeader } from "../components/screen-header";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { IDEA_TEMPLATE_LABELS, IdeaOptionChips } from "../components/idea-chips";
import { BrandKitMark } from "../components/inspector";
import { callModule, useBrandKits, type BrandKitChoice } from "../lib/client";
import { createHref, ideaBrief, prefillFromIdea } from "../lib/idea-prefill";
import { conceptStatus, formatScore } from "../lib/idea-scoring";
import {
  DEFAULT_IDEA_SETTINGS,
  IDEA_ASPECTS,
  IDEA_LIMITS,
  IDEA_CHECK_LABELS,
  IDEA_TEMPLATES,
  NEWS_SHARES,
  type ConceptBank,
  type Idea,
  type IdeaChecks,
  type IdeaKind,
  type IdeaSettings,
  type IdeaStatus,
  type IdeaTask,
  type IdeaTaskKind,
  type IdeaTemplate,
} from "../lib/idea-types";
import type { IdeasBoard } from "../lib/idea-service";

const SETTINGS_KEY = "clip-studio:idea-settings";

const TEMPLATE_LABELS = IDEA_TEMPLATE_LABELS;

const KIND_INFO: Record<IdeaKind, { label: string; icon: typeof Plus; help: string }> = {
  proven: { label: "Concept prouvé", icon: TrendingUp, help: "Une forme de sujet qui a déjà sur-performé (banque de concepts)." },
  news: { label: "Actualité", icon: Newspaper, help: "Un fait de moins de 72 heures, source datée et vérifiée le jour même." },
  remake: { label: "Reprise d'un succès", icon: Repeat, help: "Un de vos succès des deux dernières semaines, avec une autre accroche." },
  fresh: { label: "Nouveau sujet", icon: Sparkles, help: "Une forme sans preuve mesurée\u00a0: un pari." },
};

const TABS: { id: IdeaStatus; label: string }[] = [
  { id: "new", label: "Nouvelles" },
  { id: "kept", label: "Gardées" },
  { id: "done", label: "Faites" },
  { id: "dismissed", label: "Écartées" },
];

const EMPTY_TEXT: Record<IdeaStatus, { title: string; description: string }> = {
  new: {
    title: "Aucune idée nouvelle",
    description: "Réglez la série, puis «\u00a0Trouver des idées\u00a0». Avec une banque de concepts («\u00a0Étudier la niche\u00a0»), les idées partent de ce qui a déjà marché.",
  },
  kept: { title: "Rien de gardé", description: "«\u00a0Garder\u00a0» met une idée de côté pour plus tard, sans la créer tout de suite." },
  done: { title: "Aucune vidéo faite depuis une idée", description: "Une idée passe ici dès que l'assistant a créé son projet." },
  dismissed: { title: "Rien d'écarté", description: "Une idée écartée n'est plus proposée et montre à Codex ce qui ne vous plaît pas." },
};

/** Réglages gardés dans ce navigateur. */
function readSettings(): IdeaSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      return {
        ...DEFAULT_IDEA_SETTINGS,
        count: Number.isInteger(stored.count) && stored.count >= 3 && stored.count <= 10 ? stored.count : DEFAULT_IDEA_SETTINGS.count,
        newsShare: NEWS_SHARES.includes(stored.newsShare) ? stored.newsShare : DEFAULT_IDEA_SETTINGS.newsShare,
        templates: Array.isArray(stored.templates) ? stored.templates.filter((template: IdeaTemplate) => IDEA_TEMPLATES.includes(template)) : DEFAULT_IDEA_SETTINGS.templates,
        aspect: IDEA_ASPECTS.includes(stored.aspect) ? stored.aspect : "9:16",
        topic: typeof stored.topic === "string" ? stored.topic.slice(0, IDEA_LIMITS.topic) : "",
        web: stored.web !== false,
      };
    }
  } catch {
    // Stockage indisponible : réglages par défaut.
  }
  return { ...DEFAULT_IDEA_SETTINGS };
}

function writeSettings(settings: IdeaSettings) {
  try {
    const { kitId: _kit, ...rest } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  } catch {
    // Rien à faire : les réglages valent pour cette visite.
  }
}

// ─── Suivi des travaux ───────────────────────────────────────────

function useTasks(onFinished: (task: IdeaTask) => void) {
  const [tasks, setTasks] = useState<IdeaTask[]>([]);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  });

  const track = useCallback((task: IdeaTask) => setTasks((current) => [task, ...current.filter((entry) => entry.id !== task.id)]), []);

  const running = tasks.filter((task) => task.status === "running");
  const runningKey = running.map((task) => task.id).join(",");
  useEffect(() => {
    if (!runningKey) return;
    const timer = setInterval(async () => {
      for (const id of runningKey.split(",")) {
        const next = await callModule<IdeaTask | null>("getIdeaTask", id).catch(() => null);
        if (!next) {
          setTasks((current) => current.filter((task) => task.id !== id));
          continue;
        }
        if (next.status !== "running") finishedRef.current(next);
        setTasks((current) => current.map((task) => (task.id === id ? next : task)));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [runningKey]);

  return { tasks, track, running };
}

// ─── Page ────────────────────────────────────────────────────────

export default function IdeasPage() {
  const kits = useBrandKits();
  const [settings, setSettings] = useState<IdeaSettings>(DEFAULT_IDEA_SETTINGS);
  const [kitReady, setKitReady] = useState(false);
  const [board, setBoard] = useState<IdeasBoard | null>(null);
  const [tab, setTab] = useState<IdeaStatus>("new");
  const [lastNotes, setLastNotes] = useState<string[]>([]);

  // Réglages du navigateur, puis la marque par défaut dès que la liste des marques est connue.
  useEffect(() => {
    if (kits === undefined) return;
    const stored = readSettings();
    setSettings({ ...stored, kitId: kits?.find((kit) => kit.isDefault)?.id ?? null });
    setKitReady(true);
  }, [kits]);

  const update = (patch: Partial<IdeaSettings>) =>
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeSettings(next);
      return next;
    });

  const kitId = settings.kitId;
  const refresh = useCallback(async () => {
    const next = await callModule<IdeasBoard>("getIdeasBoard", { kitId });
    setBoard(next);
    return next;
  }, [kitId]);

  // Travaux de fond (étude, propositions de chaînes, accroches) : leur fin se
  // notifie par un toast, l'utilisateur a pu changer d'écran entre-temps. La
  // recherche d'idées, elle, répond dans son panneau (bilan ou erreur).
  const { track, running } = useTasks((task) => {
    if (task.status === "canceled") {
      // Une étude annulée depuis l'écran Niche : rien n'a changé, rien à annoncer ici.
    } else if (task.kind === "ideas") {
      if (task.status === "error") searchFeedback.error(task.error ?? "La recherche n’a pas abouti. Réessayez dans un instant.");
      else {
        setLastNotes(task.notes ?? []);
        setTab("new");
      }
    } else if (task.status === "error") toast.error(task.error ?? "Le travail n’a pas abouti. Réessayez dans un instant.");
    else if (task.kind === "study") toast.success(task.notes?.[0] ?? "Étude terminée.");
    else if (task.kind === "channels") toast.success(task.notes?.[0] ?? "Chaînes proposées.");
    void refresh().catch(() => undefined);
  });

  // Un état local plutôt que `useFeedback` : l'effet de chargement ne doit dépendre d'aucune fonction qui change.
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!kitReady) return;
    let alive = true;
    void callModule<IdeasBoard>("getIdeasBoard", { kitId })
      .then((next) => {
        if (!alive) return;
        setLoadError(null);
        setBoard(next);
        for (const task of next.tasks) track(task);
      })
      .catch((error) => {
        if (alive) setLoadError(errorMessage(error, "Les idées n’ont pas pu être chargées. Rechargez la page dans un instant."));
      });
    return () => {
      alive = false;
    };
  }, [kitReady, kitId, track]);

  const searchFeedback = useFeedback();
  const router = useRouter();
  const kit = kits?.find((entry) => entry.id === kitId);
  // L'écran Niche s'ouvre sur la marque de la série.
  const nicheHref = `/m/clip-studio/niche?kit=${encodeURIComponent(kitId ?? "none")}`;
  const searching = running.find((task) => task.kind === "ideas" && (task.kitId ?? null) === kitId);
  const ideas = board?.kitId === kitId ? board.ideas : null;
  const counts = useMemo(() => Object.fromEntries(TABS.map((entry) => [entry.id, ideas?.filter((idea) => idea.status === entry.id).length ?? 0])) as Record<IdeaStatus, number>, [ideas]);
  const shown = ideas?.filter((idea) => idea.status === tab) ?? null;

  // Un lancement refusé s'écrit là où la recherche aurait affiché son avancement.
  const findIdeas = async () => {
    searchFeedback.clear();
    try {
      const task = await callModule<IdeaTask>("startIdeaSearch", settings);
      track(task);
      setLastNotes([]);
    } catch (error) {
      searchFeedback.error(errorMessage(error, "La recherche d’idées n’a pas pu démarrer. Réessayez dans un instant."));
    }
  };

  const replaceIdea = (next: Idea) => setBoard((current) => (current ? { ...current, ideas: current.ideas.map((idea) => (idea.id === next.id ? next : idea)) } : current));

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-w-0 flex-col gap-6">
        <ScreenHeader
          back={{ href: "/m/clip-studio", label: "Accueil de Clip Studio" }}
          icon={Lightbulb}
          title="Idées"
          description="Des sujets de vidéos partis de ce qui a déjà marché, avec titre, accroche et prompt prêt pour l'assistant."
          actions={
            <>
              <Button asChild variant="outline" className="gap-2">
                <Link href={nicheHref}>
                  <Telescope className="size-4" />
                  Étudier la niche
                  {board?.studyDue ? <span className="size-2 rounded-full bg-primary" aria-label="Étude conseillée" /> : null}
                </Link>
              </Button>
              <Button asChild variant="ghost" className="gap-2">
                <Link href="/m/clip-studio/new">
                  <Plus className="size-4" />
                  Nouveau clip
                </Link>
              </Button>
            </>
          }
        />

        <SearchPanel
          settings={settings}
          kits={kits}
          kit={kit}
          onChange={update}
          onSearch={findIdeas}
          searching={searching}
          disabled={!kitReady || settings.templates.length === 0}
          feedback={searchFeedback.state}
          notes={lastNotes}
          onCloseNotes={() => setLastNotes([])}
          aside={<ConceptPanel bank={board?.bank ?? null} kitName={kit?.name} studyDue={board?.studyDue ?? false} onStudy={() => router.push(nicheHref)} onChanged={(bank) => setBoard((current) => (current ? { ...current, bank } : current))} />}
        >
          <section className="flex min-w-0 flex-col gap-4">
            <FormStatus state={loadError ? { tone: "error", message: loadError, id: 0 } : null} />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              {/* Une seule ligne : sur un téléphone, les quatre onglets se partagent la largeur. */}
              <Tabs value={tab} onValueChange={(value) => setTab(value as IdeaStatus)} className="w-full min-w-0 sm:w-auto">
                <TabsList className="w-full min-w-0 sm:w-fit">
                  {TABS.map((entry) => (
                    <TabsTrigger key={entry.id} value={entry.id} className="min-w-0 gap-1 px-1.5 sm:gap-1.5 sm:px-2">
                      {entry.label}
                      <span className="text-xs text-foreground/70 tabular-nums">{counts[entry.id]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {shown === null ? (
              <div className="grid min-w-0 gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
                {Array.from({ length: 2 }, (_, index) => (
                  <Skeleton key={index} className="h-72 rounded-xl" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Lightbulb />
                  </EmptyMedia>
                  <EmptyTitle>{EMPTY_TEXT[tab].title}</EmptyTitle>
                  <EmptyDescription>{EMPTY_TEXT[tab].description}</EmptyDescription>
                </EmptyHeader>
                {tab === "new" ? (
                  <EmptyContent>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button className="gap-2" onClick={findIdeas} loading={Boolean(searching)} disabled={!kitReady || settings.templates.length === 0}>
                        <Sparkles className="size-4" />
                        Trouver des idées
                      </Button>
                      {board && board.bank.concepts.length === 0 ? (
                        <Button asChild variant="outline" className="gap-2">
                          <Link href={nicheHref}>
                            <Telescope className="size-4" />
                            Étudier la niche
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : (
              <div className="grid min-w-0 gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))] 2xl:grid-cols-[repeat(3,minmax(0,1fr))]">
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.map((idea) => (
                    <motion.div
                      key={idea.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className="min-w-0"
                    >
                      <IdeaCard
                        idea={idea}
                        hooksTask={running.find((task) => task.kind === "hooks" && task.ideaId === idea.id)}
                        onChanged={replaceIdea}
                        onTask={track}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </SearchPanel>
      </div>

    </MotionConfig>
  );
}

// ─── Recherche ───────────────────────────────────────────────────

/** Une ligne de réglage de la série : intitulé à gauche, contrôle à droite (dessous sur un écran étroit). */
function SettingRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="min-w-0">
          {label}
        </Label>
      ) : (
        <span className="min-w-0 text-sm font-medium">{label}</span>
      )}
      <div className="flex max-w-full min-w-0 justify-end">{children}</div>
    </div>
  );
}

/** Exemples de sujets : une phrase entière, ou quelques mots-clés. */
const TOPIC_EXAMPLES = [
  "Les secrets de fabrication des sabres japonais et pourquoi ils coupent si bien",
  "Pourquoi le ciel est bleu le jour et rouge au coucher du soleil",
  "jeux mobiles gratuits",
  "cuisine rapide, recettes en 10 minutes",
];

function SearchPanel({
  settings,
  kits,
  kit,
  onChange,
  onSearch,
  searching,
  disabled,
  feedback,
  notes,
  onCloseNotes,
  aside,
  children,
}: {
  settings: IdeaSettings;
  kits: BrandKitChoice[] | null | undefined;
  kit: BrandKitChoice | undefined;
  onChange: (patch: Partial<IdeaSettings>) => void;
  onSearch: () => void;
  searching: IdeaTask | undefined;
  disabled: boolean;
  feedback: FeedbackState | null;
  notes: string[];
  onCloseNotes: () => void;
  /** Colonne de droite, sous les réglages (banque de concepts). */
  aside?: ReactNode;
  /** Sous la recherche, dans la même colonne : la liste des idées. Sans cela, elle attendrait la fin de la colonne de droite. */
  children?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-6">
      <Panel aria-labelledby="ideas-search">
        <PanelHeader
          icon={Sparkles}
          titleId="ideas-search"
          title="Chercher des idées"
          description="Des mots-clés ou une phrase entière : Codex en dégage le sujet et l’angle, puis cherche autour. Laissé vide, il cherche des sujets pour la marque."
        />
        <PanelBody className="flex min-w-0 flex-col gap-3">
          <Textarea
            id="ideas-topic"
            value={settings.topic}
            maxLength={IDEA_LIMITS.topic}
            rows={4}
            placeholder="Par exemple : les secrets de fabrication des sabres japonais et pourquoi ils coupent si bien ; ou : jeux mobiles, cuisine rapide"
            aria-label="Sujet, en mots-clés ou en phrase"
            className="resize-none text-[15px]"
            onChange={(event) => onChange({ topic: event.target.value.slice(0, IDEA_LIMITS.topic) })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !disabled && !searching) onSearch();
            }}
          />
          <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Exemples">
            {TOPIC_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onChange({ topic: example })}
                className="max-w-full rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {settings.topic.length}&nbsp;/&nbsp;{IDEA_LIMITS.topic}
            </span>
            <Button className="gap-2" onClick={onSearch} loading={Boolean(searching)} disabled={disabled}>
              <Sparkles className="size-4" />
              Trouver des idées
            </Button>
          </div>
          <FormStatus state={feedback} />
          <AnimatePresence initial={false}>
            {searching ? (
              <motion.div key="searching" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <TaskLine task={searching} />
              </motion.div>
            ) : notes.length > 0 ? (
              <motion.div key="notes" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <MixNotes notes={notes} onClose={onCloseNotes} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </PanelBody>
      </Panel>
      {children}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
      <Panel aria-labelledby="ideas-settings">
        <PanelHeader icon={Settings2} titleId="ideas-settings" title="Réglages de la série" description="Chaque idée arrive avec ses options de création : forme, durée, découpage, format." />
        <div className="min-w-0 divide-y">
          {kits?.length ? (
            <SettingRow label="Marque" htmlFor="ideas-kit">
              <Select value={settings.kitId ?? "none"} onValueChange={(value) => onChange({ kitId: value === "none" ? null : value })}>
                <SelectTrigger id="ideas-kit" className="w-52 max-w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sans marque</SelectItem>
                  {kits.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      <span className="flex min-w-0 items-center gap-2">
                        <BrandKitMark kit={entry} />
                        <span className="truncate">{entry.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          ) : null}

          <SettingRow label="Idées" htmlFor="ideas-count">
            <Select value={String(settings.count)} onValueChange={(value) => onChange({ count: Number(value) })}>
              <SelectTrigger id="ideas-count" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 8 }, (_, index) => index + 3).map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow label="Actualité">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(settings.newsShare)}
              onValueChange={(value) => value && onChange({ newsShare: Number(value) })}
              aria-label="Part d'actualité, le reste intemporel"
            >
              {NEWS_SHARES.map((share) => (
                <ToggleGroupItem key={share} value={String(share)} className="px-2 text-xs">
                  {share === 0 ? "Aucune" : `${share} %`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>

          <SettingRow label="Formes permises">
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={settings.templates}
              onValueChange={(value) => onChange({ templates: value.filter((entry): entry is IdeaTemplate => IDEA_TEMPLATES.includes(entry as IdeaTemplate)) })}
              aria-label="Formes permises"
              className="flex-wrap justify-end"
            >
              {IDEA_TEMPLATES.map((template) => (
                <ToggleGroupItem key={template} value={template} className="px-2 text-xs">
                  {TEMPLATE_LABELS[template]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>

          <SettingRow label="Format">
            <ToggleGroup type="single" variant="outline" size="sm" value={settings.aspect} onValueChange={(value) => value && onChange({ aspect: value as IdeaSettings["aspect"] })} aria-label="Format">
              {IDEA_ASPECTS.map((aspect) => (
                <ToggleGroupItem key={aspect} value={aspect} className="px-2 text-xs tabular-nums">
                  {aspect}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>

          <label className="flex min-w-0 items-start justify-between gap-3 px-4 py-3">
            <span className="min-w-0 text-sm font-medium">
              Recherche web
              <span className="block text-xs font-normal text-muted-foreground">Actualité et faits datés vérifiés ; plus long.</span>
            </span>
            <Switch checked={settings.web} onCheckedChange={(web) => onChange({ web })} />
          </label>

          {kit || settings.templates.length === 0 ? (
            <p className={cn("px-4 py-3 text-xs", settings.templates.length === 0 && !kit ? "text-destructive" : "text-muted-foreground")}>
              {kit ? `Ton, sujets (mots-clés et mots-dièse) et règles de « ${kit.name} » guident les idées` : ""}
              {settings.templates.length === 0 ? (kit ? " ; choisissez au moins une forme." : "Choisissez au moins une forme.") : kit ? "." : ""}
            </p>
          ) : null}
        </div>
      </Panel>
      {aside}
      </div>
    </div>
  );
}

/** L'orbe dit la nature du travail : écrire des idées, lire des chaînes, étudier la niche. */
const TASK_ORB: Record<IdeaTaskKind, OrbState> = {
  ideas: "composing",
  hooks: "composing",
  channels: "searching",
  study: "solving",
};

function TaskLine({ task }: { task: IdeaTask }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - task.startedAt) / 1000));
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
      {/* La ligne d'état annonce l'étape ; le compteur de secondes reste muet. */}
      <ThinkingStatus messages={task.step} state={TASK_ORB[task.kind]} className="flex-1" />
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{seconds}&nbsp;s</span>
    </div>
  );
}

function MixNotes({ notes, onClose }: { notes: string[]; onClose: () => void }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium [overflow-wrap:anywhere]">{notes[0]}</p>
        {notes.slice(1).map((note, index) => (
          <p key={index} className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {note}
          </p>
        ))}
      </div>
      <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label="Masquer le bilan">
        <X className="size-4" />
      </Button>
    </div>
  );
}

// ─── Carte d'une idée ────────────────────────────────────────────

function IdeaCard({ idea, hooksTask, onChanged, onTask }: { idea: Idea; hooksTask?: IdeaTask; onChanged: (idea: Idea) => void; onTask: (task: IdeaTask) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const kind = KIND_INFO[idea.kind];
  const KindIcon = kind.icon;
  const brief = ideaBrief(idea);
  // La carte qui change d'onglet ou d'accroche est le retour ; un échec s'écrit au bout de ses boutons.
  const feedback = useFeedback();
  const { hasCopied, copyFailed, copyToClipboard } = useCopyToClipboard();

  const setStatus = async (status: IdeaStatus) => {
    setBusy(status);
    feedback.clear();
    try {
      onChanged(await callModule<Idea>("setIdeaStatus", { id: idea.id, status }));
    } catch (error) {
      feedback.error(errorMessage(error, "L’idée n’a pas pu être modifiée. Réessayez."));
    } finally {
      setBusy(null);
    }
  };

  const moreHooks = async () => {
    feedback.clear();
    try {
      onTask(await callModule<IdeaTask>("startIdeaHooks", idea.id));
    } catch (error) {
      feedback.error(errorMessage(error, "Les accroches n’ont pas pu être demandées. Réessayez."));
    }
  };

  const chooseHook = async (hook: string) => {
    setBusy("hook");
    feedback.clear();
    try {
      onChanged(await callModule<Idea>("chooseIdeaHook", { id: idea.id, hook }));
    } catch (error) {
      feedback.error(errorMessage(error, "Cette accroche n’a pas pu être choisie. Réessayez."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="flex h-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("inline-flex items-center gap-1 font-medium", idea.kind === "proven" && "text-primary", idea.kind === "news" && "text-sky-700 dark:text-sky-400")}>
              <KindIcon className="size-3.5" />
              {kind.label}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{kind.help}</TooltipContent>
        </Tooltip>
      </div>

      <IdeaOptionChips idea={idea} />

      <h3 className="text-base leading-snug font-semibold text-pretty [overflow-wrap:anywhere]">{idea.title}</h3>

      <p className="text-[15px] leading-snug [overflow-wrap:anywhere]">
        <span className="text-muted-foreground">Accroche&nbsp;: </span>«&nbsp;{idea.hook}&nbsp;»
      </p>

      {idea.angle ? <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{idea.angle}</p> : null}

      {idea.sourceVideoHint ? (
        <p className="flex min-w-0 items-start gap-2 text-sm">
          <Film className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Vidéo source" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{idea.sourceVideoHint}</span>
        </p>
      ) : null}

      <dl className="grid min-w-0 gap-2 text-sm">
        <div className="flex min-w-0 items-start gap-2">
          <dt className="mt-0.5 shrink-0" aria-label="Concept">
            <Shapes className="size-4 text-muted-foreground" />
          </dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {idea.concept.name}
            {idea.concept.proof ? <span className="block text-xs text-muted-foreground">Preuve&nbsp;: {idea.concept.proof}</span> : null}
          </dd>
        </div>
        {idea.why?.text || idea.why?.source ? (
          <div className="flex min-w-0 items-start gap-2">
            <dt className="mt-0.5 shrink-0" aria-label="Pourquoi maintenant">
              <Clock className="size-4 text-muted-foreground" />
            </dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">
              {idea.why.text}
              {idea.why.source ? (
                <a
                  href={idea.why.source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title={idea.why.source.title}
                >
                  <ExternalLink className="size-3 shrink-0" />
                  <span className="min-w-0 truncate">{idea.why.source.title}</span>
                  <span className="shrink-0 tabular-nums">· {formatDay(idea.why.source.date)}</span>
                </a>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <ul className="grid min-w-0 gap-1 text-xs" aria-label="Filtre avant d'écrire">
        {(Object.keys(IDEA_CHECK_LABELS) as (keyof IdeaChecks)[]).map((key) => (
          <li key={key} className={cn("flex min-w-0 items-start gap-1.5", idea.checks[key] ? "text-foreground/80" : "text-amber-700 dark:text-amber-400")}>
            {idea.checks[key] ? <Check className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <X className="mt-px size-3.5 shrink-0" />}
            <span className="min-w-0">{IDEA_CHECK_LABELS[key]}</span>
          </li>
        ))}
      </ul>

      {idea.altHooks?.length ? (
        <div className="grid min-w-0 gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Autres accroches</span>
          <AnimatePresence initial={false}>
            {idea.altHooks.slice(0, 3).map((hook) => (
              <motion.div key={hook} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex min-w-0 items-start gap-2 text-sm">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">«&nbsp;{hook}&nbsp;»</span>
                {idea.status !== "done" ? (
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={busy === "hook"} onClick={() => chooseHook(hook)}>
                    Choisir
                  </Button>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
          Prompt initial ({brief.length}&nbsp;caractères)
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <p className="rounded-md bg-muted/60 p-2.5 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{brief}</p>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => void copyToClipboard(brief)} aria-live="polite">
            {hasCopied ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : copyFailed ? (
              <CopyX className="size-3.5 text-destructive" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {hasCopied ? "Copié" : copyFailed ? "Copie impossible dans ce navigateur" : "Copier"}
          </Button>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1">
        {idea.status === "done" ? (
          idea.projectId ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(idea.projectId)}`}>
                <Check className="size-4" />
                Ouvrir le projet
              </Link>
            </Button>
          ) : null
        ) : (
          <>
            <Button size="sm" className="gap-1.5" onClick={() => router.push(createHref(prefillFromIdea(idea)))} loading={Boolean(idea.jobId)}>
              <Wand2 className="size-4" />
              {idea.jobId ? "Création en cours" : "Créer depuis cette idée"}
            </Button>
            {idea.status === "dismissed" ? (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => setStatus("new")}>
                <RotateCcw className="size-4" />
                Rétablir
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy !== null} onClick={() => setStatus(idea.status === "kept" ? "new" : "kept")} aria-pressed={idea.status === "kept"}>
                  <BookMarked className="size-4" />
                  {idea.status === "kept" ? "Gardée" : "Garder"}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5" loading={Boolean(hooksTask)} onClick={moreHooks}>
                  <Repeat className="size-4" />
                  Autres accroches
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={busy !== null} onClick={() => setStatus("dismissed")}>
                  <ThumbsDown className="size-4" />
                  Écarter
                </Button>
              </>
            )}
          </>
        )}
        <ActionStatus state={feedback.state} className="max-w-full" />
      </div>
    </article>
  );
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : iso;
}

// ─── Banque de concepts ──────────────────────────────────────────

function ConceptPanel({
  bank,
  kitName,
  studyDue,
  onStudy,
  onChanged,
}: {
  bank: ConceptBank | null;
  kitName?: string;
  studyDue: boolean;
  onStudy: () => void;
  onChanged: (bank: ConceptBank) => void;
}) {
  // Le concept qui s'en va suffit ; un échec s'écrit sur sa ligne.
  const feedback = useFeedback();
  const [failedConcept, setFailedConcept] = useState<string | null>(null);
  const remove = async (conceptId: string) => {
    if (!bank) return;
    feedback.clear();
    try {
      onChanged(await callModule<ConceptBank>("removeConcept", { kitId: bank.kitId === "none" ? null : bank.kitId, conceptId }));
    } catch (error) {
      setFailedConcept(conceptId);
      feedback.error(errorMessage(error, "Ce concept n’a pas pu être retiré. Réessayez."));
    }
  };
  return (
    <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-0 xl:self-start" aria-label="Banque de concepts">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Banque de concepts</h2>
        {bank?.study ? <span className="shrink-0 text-xs text-muted-foreground">Étude du {new Date(bank.study.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Des formes de sujets qui ont sur-performé{kitName ? ` pour « ${kitName} »` : ""}. Un succès seul est un pari&nbsp;; trois succès sur au moins deux chaînes, une recette.
      </p>
      {bank === null ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : bank.concepts.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
          <p className="text-muted-foreground">Aucun concept pour l&apos;instant. L&apos;étude de la niche mesure des chaînes de référence et range leurs succès ici.</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onStudy}>
            <Telescope className="size-4" />
            Étudier la niche
          </Button>
        </div>
      ) : (
        <ul className="flex min-w-0 flex-col divide-y rounded-xl border">
          <AnimatePresence initial={false}>
            {bank.concepts.map((concept) => {
              const recipe = conceptStatus(concept) === "recipe";
              const channels = new Set(concept.proofs.map((proof) => proof.channel)).size;
              return (
                <motion.li key={concept.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="min-w-0">
                  <Collapsible>
                    <div className="flex min-w-0 items-start gap-2 px-3 py-2.5">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 items-start gap-2 text-left">
                        <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm [overflow-wrap:anywhere]">{concept.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            <span className={cn("font-medium", recipe ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>{recipe ? "Recette" : "Pari"}</span>
                            {" · "}
                            {concept.proofs.length} succès, {channels} chaîne{channels > 1 ? "s" : ""} · {concept.rhythm === "news" ? "actualité" : "intemporel"}
                          </span>
                          <ActionStatus state={failedConcept === concept.id ? feedback.state : null} className="max-w-full empty:hidden" />
                        </span>
                      </CollapsibleTrigger>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" onClick={() => remove(concept.id)} aria-label="Retirer ce concept">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Retirer de la banque</TooltipContent>
                      </Tooltip>
                    </div>
                    <CollapsibleContent className="space-y-2 px-3 pb-3 pl-8 text-xs">
                      {concept.mold.hook ? (
                        <p className="[overflow-wrap:anywhere]">
                          <span className="text-muted-foreground">Moule&nbsp;: </span>
                          {concept.mold.hook}
                        </p>
                      ) : null}
                      {concept.mold.beats.length ? (
                        <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                          {concept.mold.beats.map((beat, index) => (
                            <li key={index} className="[overflow-wrap:anywhere]">
                              {beat}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      <ul className="space-y-1">
                        {concept.proofs.slice(0, 4).map((proof) => (
                          <li key={proof.videoId} className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 font-medium tabular-nums">{formatScore(proof.score)}</span>
                            <a href={proof.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate underline-offset-2 hover:underline" title={`${proof.title} (${proof.channel})`}>
                              {proof.channel} · {proof.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                      {concept.flops.length ? (
                        <p className="text-muted-foreground [overflow-wrap:anywhere]">
                          Flops&nbsp;: {concept.flops.slice(0, 2).map((flop) => `${flop.title} (${formatScore(flop.score)})`).join("\u00a0; ")}
                        </p>
                      ) : null}
                    </CollapsibleContent>
                  </Collapsible>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {bank && bank.concepts.length > 0 ? (
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={onStudy}>
          <Telescope className="size-4" />
          {studyDue ? "Étude conseillée\u00a0: relancer" : "Étudier à nouveau"}
        </Button>
      ) : null}
    </aside>
  );
}
