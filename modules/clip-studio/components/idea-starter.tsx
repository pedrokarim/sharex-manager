"use client";

/**
 * Mode « Depuis une idée » de la page de création : on lance une phrase (ou
 * des mots-clés), Codex en dégage le sujet et propose trois idées au format
 * de la création (forme, durée, découpage, format) ; ou l'on reprend une idée
 * déjà trouvée. Choisir une idée préremplit l'assistant.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookMarked, Lightbulb, Sparkles, Wand2 } from "lucide-react";
import { ThinkingStatus } from "@/components/loading";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelBody, PanelHeader, PanelRows } from "@/components/connections/panel";
import { cn } from "@/lib/utils";
import type { AspectPreset } from "../engine/types";
import { callModule } from "../lib/client";
import { IDEA_LIMITS, IDEA_TEMPLATES, type Idea, type IdeaTask } from "../lib/idea-types";
import type { IdeasBoard } from "../lib/idea-service";
import { IdeaOptionChips } from "./idea-chips";

/** Idées demandées d'un coup ici : assez pour choisir, vite rendues. */
const QUICK_COUNT = 3;

export function IdeaStarter({ kitId, aspect, onPick }: { kitId: string | null; aspect: AspectPreset; onPick: (idea: Idea) => void }) {
  const [topic, setTopic] = useState("");
  const [web, setWeb] = useState(false);
  const [task, setTask] = useState<IdeaTask | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [freshBatch, setFreshBatch] = useState<string | null>(null);
  const [understood, setUnderstood] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const feedback = useFeedback();
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  const loadIdeas = useCallback(async () => {
    try {
      const board = await callModule<IdeasBoard>("getIdeasBoard", { kitId });
      if (!alive.current) return null;
      const open = board.ideas.filter((idea) => idea.status === "new" || idea.status === "kept");
      setIdeas(open);
      for (const running of board.tasks) if (running.kind === "ideas") setTask(running);
      return open;
    } catch (error) {
      if (alive.current) {
        setIdeas([]);
        feedback.error(errorMessage(error, "Les idées n’ont pas pu être lues. Réessayez dans un instant."));
      }
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `feedback` garde ses fonctions
  }, [kitId]);

  useEffect(() => {
    setIdeas(null);
    setFreshBatch(null);
    void loadIdeas();
  }, [loadIdeas]);

  // Suivi de la recherche : toutes les deux secondes, puis les idées de la série sont mises en avant.
  const taskId = task?.status === "running" ? task.id : null;
  useEffect(() => {
    if (!taskId) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const timer = setInterval(async () => {
      const next = await callModule<IdeaTask | null>("getIdeaTask", taskId).catch(() => null);
      if (!alive.current || !next) return;
      setTask(next);
      if (next.status === "error") feedback.error(next.error ?? "La recherche n’a pas abouti. Réessayez.");
      if (next.status === "done") {
        setUnderstood(next.notes?.find((note) => note.startsWith("Sujet compris"))?.replace(/^Sujet compris\s*:\s*/u, "") ?? null);
        const open = await loadIdeas();
        const newest = open?.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
        setFreshBatch(newest?.batchId ?? null);
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `feedback` garde ses fonctions
  }, [taskId, loadIdeas]);

  const search = async () => {
    feedback.clear();
    setUnderstood(null);
    try {
      const started = await callModule<IdeaTask>("startIdeaSearch", {
        kitId,
        count: QUICK_COUNT,
        newsShare: 0,
        templates: [...IDEA_TEMPLATES],
        aspect,
        topic: topic.trim(),
        web,
      });
      setNow(Date.now());
      setTask(started);
    } catch (error) {
      feedback.error(errorMessage(error, "La recherche d’idées n’a pas pu démarrer. Réessayez dans un instant."));
    }
  };

  const running = task?.status === "running";
  const fresh = ideas?.filter((idea) => idea.batchId === freshBatch) ?? [];
  const others = ideas?.filter((idea) => idea.batchId !== freshBatch) ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel>
        <PanelHeader icon={Lightbulb} title="Lancer une idée" description="Une phrase entière ou quelques mots-clés : Codex en dégage le sujet et l’angle, puis propose trois idées prêtes à créer." />
        <PanelBody className="flex min-w-0 flex-col gap-3">
          <Textarea
            value={topic}
            onChange={(event) => setTopic(event.target.value.slice(0, IDEA_LIMITS.topic))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && topic.trim().length >= 3 && !running) void search();
            }}
            rows={3}
            maxLength={IDEA_LIMITS.topic}
            placeholder="Par exemple : les secrets de fabrication des sabres japonais et pourquoi ils coupent si bien"
            aria-label="Idée, phrase ou mots-clés"
            className="resize-none text-[15px]"
          />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <Switch checked={web} onCheckedChange={setWeb} />
              <span className="min-w-0">
                Vérifier sur le web
                <span className="block text-xs text-muted-foreground">Plus sûr pour l’actualité et les chiffres, plus long.</span>
              </span>
            </label>
            <Button className="gap-2" onClick={() => void search()} loading={running} disabled={topic.trim().length < 3}>
              <Sparkles className="size-4" />
              Trouver trois idées
            </Button>
          </div>
          <FormStatus state={feedback.state} />
          <AnimatePresence initial={false}>
            {running && task ? (
              <motion.div key="running" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                  <ThinkingStatus messages={task.step} state="composing" className="flex-1" />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{Math.max(0, Math.round((now - task.startedAt) / 1000))}&nbsp;s</span>
                </div>
              </motion.div>
            ) : understood ? (
              <motion.p key="understood" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden text-sm [overflow-wrap:anywhere]">
                <span className="text-muted-foreground">Sujet compris&nbsp;: </span>
                {understood}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </PanelBody>
      </Panel>

      {fresh.length > 0 ? <IdeaList title="Idées trouvées" description="Choisissez-en une : la création se préremplit, tout reste modifiable." ideas={fresh} onPick={onPick} highlight /> : null}

      {ideas === null ? (
        <Panel>
          <PanelHeader icon={BookMarked} title="Vos idées" />
          <div className="grid min-w-0 gap-3 p-4">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </Panel>
      ) : others.length > 0 ? (
        <IdeaList
          title="Vos idées"
          description="Nouvelles et gardées, pour la marque choisie."
          ideas={others.slice(0, 8)}
          onPick={onPick}
          actions={
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/m/clip-studio/ideas">
                Toutes les idées
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        />
      ) : fresh.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Aucune idée gardée pour cette marque pour l’instant&nbsp;: lancez-en une ci-dessus.</p>
      ) : null}
    </div>
  );
}

function IdeaList({
  title,
  description,
  ideas,
  onPick,
  actions,
  highlight,
}: {
  title: string;
  description: string;
  ideas: Idea[];
  onPick: (idea: Idea) => void;
  actions?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <Panel>
      <PanelHeader icon={highlight ? Sparkles : BookMarked} title={title} description={description} actions={actions} />
      <PanelRows>
        <AnimatePresence initial={false}>
          {ideas.map((idea) => (
            <motion.div key={idea.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 flex-wrap items-start gap-3 p-4 sm:flex-nowrap">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{idea.title}</p>
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">«&nbsp;{idea.hook}&nbsp;»</p>
                <IdeaOptionChips idea={idea} />
              </div>
              <Button size="sm" variant={highlight ? "default" : "outline"} className={cn("shrink-0 gap-1.5")} onClick={() => onPick(idea)}>
                <Wand2 className="size-4" />
                Utiliser
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </PanelRows>
    </Panel>
  );
}
