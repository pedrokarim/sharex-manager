"use client";

/**
 * Idées de vidéos (dossier 01, « Idées de vidéos »).
 *
 * - Réglages de la série (marque, nombre, part d'actualité, modèles,
 *   format, thème) et « Trouver des idées » : Codex propose des sujets avec
 *   titre, accroche, angle, concept, « pourquoi maintenant » et prompt
 *   initial prêt pour l'assistant.
 * - Chaque idée : « Créer cette vidéo » (fenêtre « Créer » préremplie sur la
 *   page des projets), « Garder », « Écarter », « Autres accroches ».
 * - Banque de concepts de la marque, nourrie par « Étudier la niche »
 *   (tiroir latéral : chaînes de référence, coût en quota, limites).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Lightbulb,
  Newspaper,
  Plus,
  Repeat,
  RotateCcw,
  Shapes,
  Sparkles,
  Telescope,
  ThumbsDown,
  Trash2,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { BrandLogo, isBrand } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ThinkingStatus, type OrbState } from "@/components/loading";
import { ScreenHeader } from "../components/screen-header";
import { BrandKitMark } from "../components/inspector";
import { callModule, useBrandKits, type BrandKitChoice } from "../lib/client";
import { createHref, ideaBrief, prefillFromIdea } from "../lib/idea-prefill";
import { conceptStatus, formatScore } from "../lib/idea-scoring";
import {
  DEFAULT_IDEA_SETTINGS,
  IDEA_ASPECTS,
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

const TEMPLATE_LABELS: Record<IdeaTemplate, string> = { free: "Libre", quiz: "Quiz", top: "Classement", slideshow: "Diaporama" };

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
        topic: typeof stored.topic === "string" ? stored.topic.slice(0, 120) : "",
        web: stored.web !== false,
      };
    }
  } catch {
    // Stockage indisponible : réglages par défaut.
  }
  return { ...DEFAULT_IDEA_SETTINGS };
}

function writeSettings(settings: IdeaSettings) {
  try {
    const { kitId: _kit, ...rest } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  } catch {
    // Rien à faire : les réglages valent pour cette visite.
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
  const [nicheOpen, setNicheOpen] = useState(false);
  const [lastNotes, setLastNotes] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

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
    const next = await callModule<IdeasBoard>("getIdeasBoard", { kitId, ...(accountId ? { accountId } : {}) });
    setBoard(next);
    return next;
  }, [kitId, accountId]);

  // Travaux de fond (idées, étude, propositions de chaînes, accroches) : leur
  // fin se notifie par un toast, l'utilisateur a pu changer d'écran entre-temps.
  const { tasks, track, running } = useTasks((task) => {
    if (task.status === "error") toast.error(task.error ?? "Le travail n’a pas abouti. Réessayez dans un instant.");
    else if (task.kind === "ideas") {
      setLastNotes(task.notes ?? []);
      setTab("new");
      toast.success(task.notes?.[0] ?? "Idées trouvées.");
    } else if (task.kind === "study") toast.success(task.notes?.[0] ?? "Étude terminée.");
    else if (task.kind === "channels") toast.success(task.notes?.[0] ?? "Chaînes proposées.");
    void refresh().catch(() => undefined);
  });

  // Un état local plutôt que `useFeedback` : l'effet de chargement ne doit dépendre d'aucune fonction qui change.
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!kitReady) return;
    let alive = true;
    void callModule<IdeasBoard>("getIdeasBoard", { kitId, ...(accountId ? { accountId } : {}) })
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
  }, [kitReady, kitId, accountId, track]);

  const kit = kits?.find((entry) => entry.id === kitId);
  const searching = running.find((task) => task.kind === "ideas" && (task.kitId ?? null) === kitId);
  const ideas = board?.kitId === kitId ? board.ideas : null;
  const counts = useMemo(() => Object.fromEntries(TABS.map((entry) => [entry.id, ideas?.filter((idea) => idea.status === entry.id).length ?? 0])) as Record<IdeaStatus, number>, [ideas]);
  const shown = ideas?.filter((idea) => idea.status === tab) ?? null;

  // Un lancement refusé s'écrit là où la recherche aurait affiché son avancement.
  const searchFeedback = useFeedback();
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
          back={{ href: "/m/clip-studio", label: "Projets" }}
          icon={Lightbulb}
          title="Idées"
          description="Des sujets de vidéos partis de ce qui a déjà marché, avec titre, accroche et prompt prêt pour l'assistant."
          actions={
            <>
              <Button variant="outline" className="gap-2" onClick={() => setNicheOpen(true)}>
                <Telescope className="size-4" />
                Étudier la niche
                {board?.studyDue ? <span className="size-2 rounded-full bg-primary" aria-label="Étude conseillée" /> : null}
              </Button>
              <Button className="gap-2" onClick={findIdeas} loading={Boolean(searching)} disabled={!kitReady || settings.templates.length === 0}>
                <Sparkles className="size-4" />
                Trouver des idées
              </Button>
            </>
          }
        />

        <SettingsBar settings={settings} kits={kits} kit={kit} onChange={update} />

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section className="flex min-w-0 flex-col gap-4">
            <FormStatus state={loadError ? { tone: "error", message: loadError, id: 0 } : null} />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              {/* Une seule ligne : sur un téléphone, les quatre onglets se partagent la largeur. */}
              <Tabs value={tab} onValueChange={(value) => setTab(value as IdeaStatus)} className="w-full min-w-0 sm:w-auto">
                <TabsList className="w-full min-w-0 sm:w-fit">
                  {TABS.map((entry) => (
                    <TabsTrigger key={entry.id} value={entry.id} className="min-w-0 gap-1 px-1.5 sm:gap-1.5 sm:px-2">
                      {entry.label}
                      <span className="text-xs text-muted-foreground tabular-nums">{counts[entry.id]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <FormStatus state={searchFeedback.state} />
            <AnimatePresence initial={false}>
              {searching ? (
                <motion.div key="searching" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <TaskLine task={searching} />
                </motion.div>
              ) : lastNotes.length > 0 ? (
                <motion.div key="notes" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <MixNotes notes={lastNotes} onClose={() => setLastNotes([])} />
                </motion.div>
              ) : null}
            </AnimatePresence>

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
                        <Button variant="outline" className="gap-2" onClick={() => setNicheOpen(true)}>
                          <Telescope className="size-4" />
                          Étudier la niche
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

          <ConceptPanel bank={board?.bank ?? null} kitName={kit?.name} studyDue={board?.studyDue ?? false} onStudy={() => setNicheOpen(true)} onChanged={(bank) => setBoard((current) => (current ? { ...current, bank } : current))} />
        </div>
      </div>

      <NicheSheet
        open={nicheOpen}
        onOpenChange={setNicheOpen}
        board={board}
        kitName={kit?.name}
        topic={settings.topic}
        tasks={tasks}
        onTask={track}
        accountId={accountId ?? board?.accountId}
        onAccount={setAccountId}
        onBank={(bank) => setBoard((current) => (current ? { ...current, bank } : current))}
      />
    </MotionConfig>
  );
}

// ─── Réglages ────────────────────────────────────────────────────

function SettingsBar({
  settings,
  kits,
  kit,
  onChange,
}: {
  settings: IdeaSettings;
  kits: BrandKitChoice[] | null | undefined;
  kit: BrandKitChoice | undefined;
  onChange: (patch: Partial<IdeaSettings>) => void;
}) {
  return (
    <section aria-label="Réglages de la série" className="flex min-w-0 flex-wrap items-end gap-x-5 gap-y-4">
      {kits?.length ? (
        <div className="grid min-w-0 basis-56 gap-1.5 sm:flex-none">
          <Label htmlFor="ideas-kit">Marque</Label>
          <Select value={settings.kitId ?? "none"} onValueChange={(value) => onChange({ kitId: value === "none" ? null : value })}>
            <SelectTrigger id="ideas-kit" className="w-full min-w-0 sm:w-56">
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
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="ideas-count">Idées</Label>
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
      </div>

      <div className="grid min-w-0 gap-1.5">
        <span className="text-sm font-medium">Actualité</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(settings.newsShare)}
          onValueChange={(value) => value && onChange({ newsShare: Number(value) })}
          aria-label="Part d'actualité, le reste intemporel"
        >
          {NEWS_SHARES.map((share) => (
            <ToggleGroupItem key={share} value={String(share)} className="px-2.5 text-xs">
              {share === 0 ? "Aucune" : `${share} %`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <span className="text-sm font-medium">Modèles permis</span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={settings.templates}
          onValueChange={(value) => onChange({ templates: value.filter((entry): entry is IdeaTemplate => IDEA_TEMPLATES.includes(entry as IdeaTemplate)) })}
          aria-label="Modèles permis"
          className="flex-wrap"
        >
          {IDEA_TEMPLATES.map((template) => (
            <ToggleGroupItem key={template} value={template} className="px-2.5 text-xs">
              {TEMPLATE_LABELS[template]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <span className="text-sm font-medium">Format</span>
        <ToggleGroup type="single" variant="outline" size="sm" value={settings.aspect} onValueChange={(value) => value && onChange({ aspect: value as IdeaSettings["aspect"] })} aria-label="Format">
          {IDEA_ASPECTS.map((aspect) => (
            <ToggleGroupItem key={aspect} value={aspect} className="px-2.5 text-xs tabular-nums">
              {aspect}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid min-w-0 flex-1 basis-56 gap-1.5">
        <Label htmlFor="ideas-topic">Thème ou mot-clé</Label>
        <Input id="ideas-topic" value={settings.topic} maxLength={120} placeholder={"Facultatif\u00a0: «\u00a0jeux mobiles\u00a0», «\u00a0cuisine rapide\u00a0»…"} onChange={(event) => onChange({ topic: event.target.value })} />
      </div>

      <label className="flex min-w-0 items-center gap-2 pb-2 text-sm">
        <Switch checked={settings.web} onCheckedChange={(web) => onChange({ web })} />
        <span>Recherche web</span>
      </label>

      {kit ? (
        <p className="basis-full text-xs text-muted-foreground">
          Ton, sujets (mots-clés et mots-dièse) et règles de «&nbsp;{kit.name}&nbsp;» guident les idées
          {settings.templates.length === 0 ? "\u00a0; choisissez au moins un modèle." : "."}
        </p>
      ) : settings.templates.length === 0 ? (
        <p className="basis-full text-xs text-destructive">Choisissez au moins un modèle.</p>
      ) : null}
    </section>
  );
}

/** L'orbe dit la nature du travail : écrire des idées, lire des chaînes, étudier la niche. */
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
      {/* La ligne d'état annonce l'étape ; le compteur de secondes reste muet. */}
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
  // La carte qui change d'onglet ou d'accroche est le retour ; un échec s'écrit au bout de ses boutons.
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
        <span aria-hidden>·</span>
        <span>
          {TEMPLATE_LABELS[idea.template]}, {idea.count} éléments
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{idea.targetSeconds}&nbsp;s</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{idea.aspect}</span>
      </div>

      <h3 className="text-base leading-snug font-semibold text-pretty [overflow-wrap:anywhere]">{idea.title}</h3>

      <p className="text-[15px] leading-snug [overflow-wrap:anywhere]">
        <span className="text-muted-foreground">Accroche&nbsp;: </span>«&nbsp;{idea.hook}&nbsp;»
      </p>

      {idea.angle ? <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{idea.angle}</p> : null}

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
              {idea.jobId ? "Création en cours" : "Créer cette vidéo"}
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
  // Le concept qui s'en va suffit ; un échec s'écrit sur sa ligne.
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

// ─── Étude de la niche ───────────────────────────────────────────

function NicheSheet({
  open,
  onOpenChange,
  board,
  kitName,
  topic,
  tasks,
  onTask,
  accountId,
  onAccount,
  onBank,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: IdeasBoard | null;
  kitName?: string;
  topic: string;
  tasks: IdeaTask[];
  onTask: (task: IdeaTask) => void;
  accountId?: string;
  onAccount: (id: string) => void;
  onBank: (bank: ConceptBank) => void;
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const kitId = board?.kitId ?? null;
  const bank = board?.bank;
  const study = tasks.find((task) => task.kind === "study" && task.status === "running");
  // L'étude dépense le quota du compte YouTube connecté par un administrateur : réservée aux administrateurs.
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const adminOnly = isAdmin ? undefined : "Réservé aux administrateurs : l’étude dépense le quota YouTube du compte connecté.";
  const suggesting = tasks.find((task) => task.kind === "channels" && task.status === "running" && (task.kitId ?? null) === kitId);
  const active = bank?.channels.filter((channel) => channel.state === "active") ?? [];
  const pending = bank?.channels.filter((channel) => channel.state === "pending") ?? [];
  const estimate = board?.estimate;
  const account = board?.accounts.find((entry) => entry.id === accountId);
  // Les gestes sur les chaînes répondent sous le champ d'ajout ; le lancement de l'étude, au-dessus de son bouton.
  const channelsFeedback = useFeedback();
  const studyFeedback = useFeedback();

  const run = async (call: () => Promise<ConceptBank>) => {
    setBusy(true);
    channelsFeedback.clear();
    try {
      onBank(await call());
      return true;
    } catch (error) {
      channelsFeedback.error(errorMessage(error, "La liste des chaînes n’a pas pu être modifiée. Réessayez."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!handle.trim()) return;
    if (await run(() => callModule<ConceptBank>("addReferenceChannel", { kitId, handle }))) setHandle("");
  };

  const suggest = async () => {
    channelsFeedback.clear();
    try {
      onTask(await callModule<IdeaTask>("suggestReferenceChannels", { kitId, topic }));
    } catch (error) {
      channelsFeedback.error(errorMessage(error, "Les propositions de chaînes n’ont pas pu démarrer. Réessayez dans un instant."));
    }
  };

  const launch = async () => {
    if (!accountId) return;
    studyFeedback.clear();
    try {
      onTask(await callModule<IdeaTask>("startNicheStudy", { kitId, accountId }));
    } catch (error) {
      studyFeedback.error(errorMessage(error, "L’étude n’a pas pu démarrer. Réessayez dans un instant."));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle className="flex items-center gap-2">
            <Telescope className="size-5 text-primary" />
            Étudier la niche
          </SheetTitle>
          <SheetDescription>
            Mesure les vidéos courtes de chaînes de référence{kitName ? ` pour « ${kitName} »` : ""}, puis range leurs succès en concepts. Une fois par mois suffit.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <section className="grid min-w-0 gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BrandLogo brand="youtube" />
              Compte de lecture
            </h3>
            {board && board.accounts.length === 0 ? (
              <Alert>
                <AlertTitle>Aucun compte YouTube connecté</AlertTitle>
                <AlertDescription>
                  L&apos;étude par l&apos;API YouTube est indisponible sans compte connecté avec une portée de lecture. Les idées restent possibles, au web seul. Un administrateur peut connecter une chaîne dans les comptes connectés.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Select value={accountId ?? ""} onValueChange={onAccount} disabled={!board}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Choisir un compte" />
                  </SelectTrigger>
                  <SelectContent>
                    {board?.accounts.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        <span className="flex min-w-0 items-center gap-2">
                          {isBrand(entry.logo) ? <BrandLogo brand={entry.logo} /> : null}
                          <span className="truncate">{entry.name}</span>
                          {entry.linked ? <span className="shrink-0 text-xs text-muted-foreground">compte de la marque</span> : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Données publiques lues avec le jeton de ce compte.
                  {account && estimate?.own ? " Sa propre chaîne est mesurée aussi\u00a0: ses succès récents deviennent des reprises." : kitName ? " Ce compte n'est pas rattaché à la marque\u00a0: sa chaîne ne sera pas mesurée." : ""}
                </p>
              </>
            )}
          </section>

          <Separator />

          <section className="grid min-w-0 gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Chaînes de référence <span className="font-normal text-muted-foreground tabular-nums">({active.length})</span>
              </h3>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={suggest} loading={Boolean(suggesting)} disabled={!isAdmin} title={adminOnly}>
                <Sparkles className="size-4" />
                Proposer des chaînes
              </Button>
            </div>
            <form
              className="flex min-w-0 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <Input
                value={handle}
                onChange={(event) => {
                  setHandle(event.target.value);
                  if (channelsFeedback.state?.tone === "error") channelsFeedback.clear();
                }}
                placeholder="@chaine ou adresse youtube.com/@…"
                className="min-w-0 flex-1"
                aria-label="Chaîne à ajouter"
              />
              <Button type="submit" variant="secondary" className="shrink-0 gap-1.5" disabled={busy || !handle.trim()}>
                <Plus className="size-4" />
                Ajouter
              </Button>
            </form>
            <FormStatus state={channelsFeedback.state} />
            {suggesting ? <TaskLine task={suggesting} /> : null}
            <AnimatePresence initial={false}>
              {pending.map((channel) => (
                <motion.div key={channel.handle} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex min-w-0 items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={channel.handle}>
                      {channel.handle}
                      {channel.title ? <span className="font-normal text-muted-foreground"> · {channel.title}</span> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {channel.relation === "bigger" ? "Beaucoup plus grosse" : channel.relation === "neighbor" ? "Voisine" : "Directe"}
                      {channel.note ? ` · ${channel.note}` : ""}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => run(() => callModule<ConceptBank>("answerChannelSuggestion", { kitId, handle: channel.handle, accept: true }))}>
                    Valider
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 shrink-0" disabled={busy} aria-label={`Refuser ${channel.handle}`} onClick={() => run(() => callModule<ConceptBank>("answerChannelSuggestion", { kitId, handle: channel.handle, accept: false }))}>
                    <X className="size-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
            {active.length === 0 && pending.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ajoutez 10 à 12 chaînes&nbsp;: directes (même sujet), voisines et beaucoup plus grosses. Les 12 premières sont mesurées.</p>
            ) : (
              <ul className="flex min-w-0 flex-col divide-y rounded-lg border">
                <AnimatePresence initial={false}>
                  {active.map((channel, index) => {
                    const stat = bank?.study?.channels.find((entry) => entry.handle.toLowerCase() === channel.handle.toLowerCase());
                    return (
                      <motion.li key={channel.handle} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <a href={`https://www.youtube.com/${encodeURIComponent(channel.handle)}`} target="_blank" rel="noopener noreferrer nofollow" className="block truncate hover:underline" title={channel.title ? `${channel.handle} · ${channel.title}` : channel.handle}>
                            {channel.handle}
                            {channel.title ? <span className="text-muted-foreground"> · {channel.title}</span> : null}
                          </a>
                          {stat ? (
                            <span className={cn("block text-xs [overflow-wrap:anywhere]", stat.error ? "text-destructive" : "text-muted-foreground")}>
                              {stat.error
                                ? stat.error
                                : `${stat.shorts} vidéos courtes · médiane ${stat.median === null ? "inconnue" : stat.median.toLocaleString("fr-FR")} vues${stat.top[0] ? ` · meilleur ${formatScore(stat.top[0].score)}` : ""}${stat.small ? " · médiane fragile" : ""}`}
                            </span>
                          ) : null}
                        </span>
                        {index >= 12 ? <span className="shrink-0 text-xs text-muted-foreground">non mesurée</span> : null}
                        <Button size="icon" variant="ghost" className="size-7 shrink-0 text-muted-foreground" disabled={busy} aria-label={`Retirer ${channel.handle}`} onClick={() => run(() => callModule<ConceptBank>("removeReferenceChannel", { kitId, handle: channel.handle }))}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <Separator />

          <section className="grid min-w-0 gap-2 text-sm">
            <h3 className="text-sm font-semibold">Coût et limites</h3>
            {estimate ? (
              <p className="[overflow-wrap:anywhere]">
                Environ <strong className="tabular-nums">{estimate.min === estimate.max ? estimate.min : `${estimate.min} à ${estimate.max}`}</strong> unités du quota de l&apos;API YouTube
                {estimate.remaining !== undefined ? (
                  <>
                    , sur <span className="tabular-nums">{estimate.remaining.toLocaleString("fr-FR")}</span> restantes aujourd&apos;hui
                  </>
                ) : null}
                &nbsp;: 3 à 5 lectures à 1 unité par chaîne ({estimate.channels} chaîne{estimate.channels > 1 ? "s" : ""}
                {estimate.own ? " et la vôtre" : ""}), jamais la recherche, bien plus chère.
              </p>
            ) : (
              <p className="text-muted-foreground">Le coût s&apos;affiche dès qu&apos;un compte YouTube est choisi.</p>
            )}
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Score d&apos;une vidéo&nbsp;: ses vues divisées par la médiane des 12 vidéos courtes qui suivent les 3 plus récentes de sa chaîne. 3 et plus&nbsp;: un vrai signal&nbsp;; de 1,5 à 3&nbsp;: peut-être.</li>
              <li>Ce sont des seuils éditoriaux, pas une preuve&nbsp;: un succès peut venir d&apos;autre chose que le sujet ou l&apos;accroche (tendance du moment, collaboration, publicité).</li>
              <li>Les vues des vidéos récentes grimpent encore&nbsp;: leur score est provisoire.</li>
              <li>Une chaîne de moins de 15 vidéos courtes donne une médiane fragile. Une vidéo courte dure ici 3 minutes au plus.</li>
            </ul>
            {bank?.study ? (
              <p className="text-xs text-muted-foreground">
                Dernière étude le {new Date(bank.study.at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}&nbsp;: {bank.study.hits} succès, {bank.study.unitsUsed} unités.
              </p>
            ) : null}
          </section>
        </div>

        <SheetFooter className="border-t p-4">
          <FormStatus state={studyFeedback.state} />
          {study ? <TaskLine task={study} /> : null}
          <Button className="gap-2" onClick={launch} loading={Boolean(study)} disabled={!isAdmin || !accountId || active.length === 0} title={adminOnly}>
            <Telescope className="size-4" />
            Lancer l&apos;étude
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
