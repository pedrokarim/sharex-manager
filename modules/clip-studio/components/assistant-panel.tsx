"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, CircleAlert, Clock3, Crosshair, ImageIcon, MessageSquarePlus, SendHorizontal, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { LoadingState, ThinkingStatus } from "@/components/loading";
import { cn } from "@/lib/utils";
import { findItem } from "../engine/edit";
import { formatSeconds, itemName, type EditorApplyResult, type EditorChange, type EditorOpEntry } from "../engine/editor-ops";
import type { ClipProject } from "../engine/types";
import { callModule } from "../lib/client";
import { EDITOR_CHAT_LIMITS, type EditorChat, type EditorChatMessage, type EditorChatOutcome } from "../lib/editor-chat-types";

/** Suivi d'une demande en cours. */
const POLL_MS = 1500;

/** Exemples proposés sur une conversation vide : un clic les met dans le champ. */
const EXAMPLES = [
  "Le titre du début est trop gros et sort du cadre.",
  "La musique couvre la voix : baisse-la et fais-la s’effacer quand on parle.",
  "Mets les sous-titres en jaune et un peu plus petits.",
  "Supprime l’image à la tête de lecture.",
];

// ─── Capture de l'aperçu ─────────────────────────────────────────

/**
 * L'image de l'aperçu, telle que l'utilisateur la voit à la tête de lecture,
 * en JPEG de 1280 px au plus. `null` si le canevas ne se lit pas.
 */
export async function capturePreview(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
  if (!canvas || !canvas.width || !canvas.height) return null;
  try {
    const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
    const copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(canvas.width * scale));
    copy.height = Math.max(1, Math.round(canvas.height * scale));
    const context = copy.getContext("2d");
    if (!context) return null;
    context.drawImage(canvas, 0, 0, copy.width, copy.height);
    return await new Promise<Blob | null>((resolve) => copy.toBlob((blob) => resolve(blob), "image/jpeg", 0.85));
  } catch {
    // Canevas illisible (média d'une autre origine) : la demande part sans image.
    return null;
  }
}

async function bufferArg(blob: Blob): Promise<{ type: "buffer"; data: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { type: "buffer", data: btoa(binary) };
}

// ─── État de la conversation ─────────────────────────────────────

export interface EditorChatOptions {
  projectId: string;
  /** Projet affiché : il dit si « Annuler ces changements » est encore sûr. */
  project: ClipProject;
  /** Avant l'envoi : lecture arrêtée, projet enregistré ; rend l'image de l'aperçu si demandée. */
  prepare: (withImage: boolean) => Promise<Blob | null>;
  /** Applique les opérations d'une réponse en une seule étape d'annulation. */
  apply: (ops: EditorOpEntry[]) => EditorApplyResult;
  undo: () => void;
  /** Le panneau est ouvert : une réponse arrivée se lit à l'écran, sans toast. */
  visible: boolean;
  /** Ouvre le panneau (depuis le toast d'une réponse arrivée panneau fermé). */
  onOpen: () => void;
}

export type RevertState = "ready" | "stale" | "none";

/**
 * La conversation de l'assistant d'un projet, tenue par l'éditeur (et non par
 * le panneau) : une demande se suit et s'applique même panneau fermé.
 */
export function useEditorChat(options: EditorChatOptions) {
  const { projectId } = options;
  const [chat, setChat] = useState<EditorChat | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  /** Projet produit par chaque réponse appliquée pendant cette session, pour l'annuler en sûreté. */
  const [appliedProjects, setAppliedProjects] = useState<Record<string, ClipProject>>({});
  const watched = useRef(new Set<string>());
  const handled = useRef(new Set<string>());
  const announced = useRef(new Set<string>());
  /** Ce que cette session a fait des réponses, gardé tant que le serveur ne l'a pas encore rangé. */
  const localOutcomes = useRef(new Map<string, EditorChatOutcome>());
  const latest = useRef(options);
  latest.current = options;

  /** La conversation du serveur, complétée des relevés locaux qu'une réponse plus ancienne n'a pas encore. */
  const adopt = useCallback((next: EditorChat) => {
    if (localOutcomes.current.size === 0) return setChat(next);
    setChat({
      ...next,
      messages: next.messages.map((entry) => {
        const local = localOutcomes.current.get(entry.id);
        if (!local) return entry;
        if (!entry.outcome) return { ...entry, outcome: local };
        return local.reverted && !entry.outcome.reverted ? { ...entry, outcome: { ...entry.outcome, reverted: true } } : entry;
      }),
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await callModule<EditorChat>("getEditorChat", projectId);
      if (next.pending) watched.current.add(next.pending.jobId);
      adopt(next);
    } catch (error) {
      setLoadError(errorMessage(error, "La conversation n’a pas pu être chargée."));
    }
  }, [projectId, adopt]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Applique une réponse, puis range ce qui a été fait (la conversation affichée suit tout de suite). */
  const applyReply = useCallback(
    async (message: EditorChatMessage) => {
      if (handled.current.has(message.id) || !message.ops?.length || message.outcome) return null;
      handled.current.add(message.id);
      let result: EditorApplyResult | null = null;
      try {
        result = latest.current.apply(message.ops);
      } catch (error) {
        // Une erreur du moteur : rien n'a été appliqué, et la conversation le dit.
        console.error("[clip-studio] assistant de l’éditeur :", error);
      }
      const outcome: EditorChatOutcome = result
        ? { applied: result.applied, skipped: result.skipped, at: Date.now() }
        : { applied: [], skipped: [{ index: 0, op: "?", summary: "Toute la réponse", reason: "L’éditeur n’a pas pu l’appliquer : rien n’a été changé." }], at: Date.now() };
      if (result?.applied.length) setAppliedProjects((current) => ({ ...current, [message.id]: result.project }));
      localOutcomes.current.set(message.id, outcome);
      setChat((current) => current && { ...current, messages: current.messages.map((entry) => (entry.id === message.id ? { ...entry, outcome } : entry)) });
      try {
        adopt(await callModule<EditorChat>("recordEditorChatOutcome", { projectId, messageId: message.id, applied: outcome.applied, skipped: outcome.skipped }));
      } catch {
        // Les changements sont dans le projet ; seul leur relevé manque à l'historique du serveur.
      }
      return result;
    },
    [projectId, adopt]
  );

  const pendingJob = chat?.pending?.jobId;
  const pendingMessage = chat?.pending?.messageId;
  useEffect(() => {
    if (!pendingJob) return;
    let alive = true;
    const timer = window.setInterval(async () => {
      const next = await callModule<EditorChat>("getEditorChat", projectId).catch(() => null);
      if (!alive || !next) return;
      adopt(next);
      if (next.pending?.jobId === pendingJob) return;
      // La réponse est arrivée : celle qui suit la demande suivie s'applique aussitôt.
      const askedAt = next.messages.findIndex((entry) => entry.role === "user" && entry.id === pendingMessage);
      const reply = askedAt === -1 ? undefined : next.messages.slice(askedAt + 1).find((entry) => entry.role === "assistant");
      if (!reply || !watched.current.has(pendingJob) || announced.current.has(reply.id)) return;
      announced.current.add(reply.id);
      const result = reply.error ? null : await applyReply(reply);
      // Panneau fermé : la réponse n'est pas sous les yeux, un toast la signale.
      if (!latest.current.visible) {
        const count = result?.applied.length ?? 0;
        toast.info(
          reply.error ? "L’assistant n’a pas pu répondre." : count ? `L’assistant a appliqué ${count} changement${count > 1 ? "s" : ""}.` : "L’assistant a répondu.",
          { action: { label: "Voir", onClick: () => latest.current.onOpen() } }
        );
      }
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pendingJob, pendingMessage, projectId, applyReply, adopt]);

  const send = useCallback(
    async (text: string, context: { frame: number; selectedId: string | null; withImage: boolean }) => {
      const blob = await latest.current.prepare(context.withImage);
      const image = blob ? await bufferArg(blob) : undefined;
      const next = await callModule<EditorChat>("sendEditorChat", { projectId, text, frame: context.frame, selectedId: context.selectedId }, ...(image ? [image] : []));
      if (next.pending) watched.current.add(next.pending.jobId);
      adopt(next);
    },
    [projectId, adopt]
  );

  const cancel = useCallback(async () => {
    setCanceling(true);
    try {
      await callModule("cancelEditorChat", projectId);
    } finally {
      setCanceling(false);
    }
  }, [projectId]);

  const clear = useCallback(async () => {
    const next = await callModule<EditorChat>("clearEditorChat", projectId);
    setAppliedProjects({});
    localOutcomes.current.clear();
    setChat(next);
  }, [projectId]);

  /** « Annuler ces changements » n'est sûr que si rien n'a bougé depuis : c'est alors la dernière étape d'annulation. */
  const revertState = useCallback(
    (message: EditorChatMessage): RevertState => {
      const produced = appliedProjects[message.id];
      if (!produced || message.outcome?.reverted || !message.outcome?.applied.length) return "none";
      return produced === options.project ? "ready" : "stale";
    },
    [appliedProjects, options.project]
  );

  const revert = useCallback(
    async (message: EditorChatMessage) => {
      if (revertState(message) !== "ready") return;
      latest.current.undo();
      setAppliedProjects(({ [message.id]: _gone, ...rest }) => rest);
      const local = localOutcomes.current.get(message.id) ?? message.outcome;
      if (local) localOutcomes.current.set(message.id, { ...local, reverted: true });
      setChat((current) =>
        current && { ...current, messages: current.messages.map((entry) => (entry.id === message.id && entry.outcome ? { ...entry, outcome: { ...entry.outcome, reverted: true } } : entry)) }
      );
      try {
        adopt(await callModule<EditorChat>("recordEditorChatOutcome", { projectId, messageId: message.id, reverted: true }));
      } catch {
        // Le projet est revenu en arrière ; l'historique le dira au prochain chargement réussi.
      }
    },
    [projectId, revertState, adopt]
  );

  return { chat, loadError, reload: load, send, cancel, canceling, clear, applyReply, revertState, revert, pending: chat?.pending ?? null };
}

export type EditorChatState = ReturnType<typeof useEditorChat>;

// ─── Panneau ─────────────────────────────────────────────────────

interface AssistantPanelProps {
  state: EditorChatState;
  project: ClipProject;
  frame: number;
  selectedId: string | null;
  /** Sélectionne l'élément d'un changement et y amène la tête de lecture. */
  onFocus: (change: EditorChange) => void;
}

/**
 * Panneau « Assistant » de l'éditeur : une conversation par projet. Une
 * demande peut citer plusieurs problèmes ; la réponse dit ce qui a été
 * compris, point par point, et la liste numérotée des changements appliqués
 * (cliquables) et écartés (avec leur raison).
 */
export function AssistantPanel({ state, project, frame, selectedId, onFocus }: AssistantPanelProps) {
  const { chat, loadError, pending } = state;
  const [draft, setDraft] = useState("");
  const [withImage, setWithImage] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const sendFeedback = useFeedback();
  const clearFeedback = useFeedback();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = chat?.messages ?? [];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.error);

  // Le fil descend sur le dernier message et sur l'attente.
  const tail = `${messages.length}|${messages.at(-1)?.outcome ? "o" : ""}|${pending?.jobId ?? ""}`;
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [tail]);

  const selected = selectedId ? findItem(project, selectedId)?.item ?? null : null;
  const fps = project.fps;
  const text = draft.trim();
  const tooLong = draft.length > EDITOR_CHAT_LIMITS.request;
  const canSend = Boolean(text) && !tooLong && !pending && !sending && chat !== null;

  const submit = async () => {
    if (!canSend) return;
    sendFeedback.clear();
    setSending(true);
    try {
      await state.send(text, { frame, selectedId, withImage });
      setDraft("");
    } catch (error) {
      sendFeedback.error(errorMessage(error, "La demande n’a pas pu partir. Réessayez."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-b px-3">
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Assistant</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          disabled={messages.length === 0 && !pending}
          onClick={() => {
            clearFeedback.clear();
            setConfirmClear(true);
          }}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Nouvelle conversation
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {chat === null ? (
          loadError ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground break-words">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void state.reload()}>
                Réessayer
              </Button>
            </div>
          ) : (
            <LoadingState label="Chargement de la conversation…" className="h-full" />
          )
        ) : messages.length === 0 && !pending ? (
          <EmptyConversation
            onPick={(example) => {
              setDraft(example);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <ol className="flex min-w-0 flex-col gap-4 p-3">
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.li
                  key={message.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="min-w-0"
                >
                  {message.role === "user" ? (
                    <UserMessage message={message} />
                  ) : (
                    <AssistantMessage
                      message={message}
                      project={project}
                      latest={message.id === lastAssistant?.id}
                      revertState={state.revertState(message)}
                      onRevert={() => void state.revert(message)}
                      onApply={() => void state.applyReply(message)}
                      onFocus={onFocus}
                    />
                  )}
                </motion.li>
              ))}
              {pending && (
                <motion.li key={`pending-${pending.jobId}`} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-w-0">
                  <PendingReply startedAt={pending.startedAt} detail={pending.detail} canceling={state.canceling} onCancel={() => void state.cancel()} />
                </motion.li>
              )}
            </AnimatePresence>
          </ol>
        )}
      </div>

      <form
        className="flex min-w-0 shrink-0 flex-col gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="shrink-0">{formatSeconds(frame / fps)}</span>
          {selected && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate" title={itemName(selected)}>
                Sélection&nbsp;: {itemName(selected)}
              </span>
            </>
          )}
        </p>
        <FormStatus state={sendFeedback.state} />
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="Décrivez ce qui ne va pas, même plusieurs choses à la fois…"
          aria-label="Demande à l’assistant"
          aria-invalid={tooLong || undefined}
          className="max-h-40 min-h-16 resize-none overflow-y-auto break-words text-sm"
        />
        <div className="flex min-w-0 items-center gap-2">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={withImage} onCheckedChange={setWithImage} aria-label="Joindre l’image de l’aperçu" />
            <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">Joindre l’aperçu</span>
          </label>
          {draft.length > EDITOR_CHAT_LIMITS.request - 200 && (
            <span className={cn("shrink-0 text-[11px] tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")}>
              {draft.length}/{EDITOR_CHAT_LIMITS.request}
            </span>
          )}
          <Button type="submit" size="sm" className="h-8 shrink-0 gap-1.5" disabled={!canSend} loading={sending}>
            <SendHorizontal className="h-4 w-4" />
            Envoyer
          </Button>
        </div>
      </form>

      <AlertDialog
        open={confirmClear}
        onOpenChange={(open) => {
          if (!clearing) setConfirmClear(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repartir d’une conversation vide&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              L’historique de l’assistant pour ce projet est effacé{pending ? ", et la demande en cours est annulée" : ""}. Les changements déjà appliqués restent dans le projet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormStatus state={clearFeedback.state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Garder</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              onClick={async (event) => {
                event.preventDefault();
                setClearing(true);
                try {
                  await state.clear();
                  setConfirmClear(false);
                } catch (error) {
                  clearFeedback.error(errorMessage(error, "La conversation n’a pas pu être effacée. Réessayez."));
                } finally {
                  setClearing(false);
                }
              }}
            >
              Effacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyConversation({ onPick }: { onPick: (example: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-sm font-medium">Décrivez ce qu’il faut changer</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Plusieurs problèmes à la fois, en langage courant. L’assistant lit le projet, regarde l’aperçu à la tête de lecture, puis applique les changements en une seule étape&nbsp;: un seul Ctrl&nbsp;Z les annule tous.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">Par exemple</p>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="min-w-0 rounded-md border px-2.5 py-1.5 text-left text-xs leading-5 break-words transition-colors hover:bg-muted"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: EditorChatMessage }) {
  const context = message.context;
  return (
    <div className="ml-6 flex min-w-0 flex-col items-end gap-1">
      <p className="max-w-full rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
      {context && (
        <p className="max-w-full text-right text-[11px] leading-4 text-muted-foreground break-words">
          à {formatSeconds(context.seconds)}
          {context.selectedName ? ` · sélection : ${context.selectedName}` : ""}
          {context.image ? " · aperçu joint" : ""}
        </p>
      )}
    </div>
  );
}

function PendingReply({ startedAt, detail, canceling, onCancel }: { startedAt: number; detail: string; canceling: boolean; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const messages = useMemo(() => [detail, "Codex relit la conversation…", "Codex prépare les changements…"], [detail]);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
      <ThinkingStatus messages={messages} interval={3200} className="text-xs" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          Depuis {seconds}&nbsp;s · de 20&nbsp;s à 2&nbsp;min en général
        </span>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" loading={canceling} onClick={onCancel}>
          <Ban className="h-3.5 w-3.5" />
          Annuler
        </Button>
      </div>
    </div>
  );
}

interface AssistantMessageProps {
  message: EditorChatMessage;
  project: ClipProject;
  /** Dernière réponse de la conversation : elle seule propose d'annuler ses changements. */
  latest: boolean;
  revertState: RevertState;
  onRevert: () => void;
  onApply: () => void;
  onFocus: (change: EditorChange) => void;
}

function AssistantMessage({ message, project, latest, revertState, onRevert, onApply, onFocus }: AssistantMessageProps) {
  if (message.error) {
    return (
      <p className={cn("flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-sm", message.error === "failed" ? "bg-destructive/10 text-red-700 dark:text-red-400" : "bg-muted text-muted-foreground")}>
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">{message.text}</span>
      </p>
    );
  }
  const outcome = message.outcome;
  const reverted = Boolean(outcome?.reverted);
  const proposed = message.ops?.length ?? 0;
  const understood = message.understood ?? [];
  const countFor = (point: number) => outcome?.applied.filter((change) => change.point === point).length ?? 0;

  return (
    <div className="mr-2 flex min-w-0 flex-col gap-3">
      <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>

      {understood.length > 0 && (
        <section className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[11px] font-medium text-muted-foreground">Ce que j’ai compris</h3>
          <ol className="flex min-w-0 flex-col gap-1">
            {understood.map((point, index) => (
              <li key={index} className="flex min-w-0 items-baseline gap-2 text-xs leading-5">
                <span className="w-4 shrink-0 text-right font-medium tabular-nums">{index + 1}.</span>
                <span className="min-w-0 flex-1 break-words">{point}</span>
                {outcome && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {countFor(index + 1) ? `${countFor(index + 1)} changement${countFor(index + 1) > 1 ? "s" : ""}` : "rien changé"}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {outcome && outcome.applied.length > 0 && (
        <section className="flex min-w-0 flex-col gap-1">
          <h3 className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{reverted ? "Changements annulés" : "Changements appliqués"}</span>
          </h3>
          <ol className="flex min-w-0 flex-col gap-0.5">
            {outcome.applied.map((change, index) => (
              <li key={`${change.index}-${index}`} className="min-w-0">
                <ChangeRow number={index + 1} change={change} project={project} muted={reverted} onFocus={onFocus} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {outcome && outcome.skipped.length > 0 && (
        <section className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[11px] font-medium text-muted-foreground">Écartés</h3>
          <ul className="flex min-w-0 flex-col gap-1">
            {outcome.skipped.map((change, index) => (
              <li key={`${change.index}-${index}`} className="flex min-w-0 items-start gap-2 text-xs leading-5">
                <Ban className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 break-words">
                  <span>{change.summary}</span>
                  {change.point ? <span className="text-muted-foreground"> (point {change.point})</span> : null}
                  <span className="block text-muted-foreground">{change.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!outcome && proposed > 0 && (
        <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2">
          <span className="min-w-0 flex-1 text-xs break-words">
            {proposed} changement{proposed > 1 ? "s" : ""} proposé{proposed > 1 ? "s" : ""}, pas encore appliqué{proposed > 1 ? "s" : ""}.
          </span>
          <Button size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onApply}>
            Appliquer
          </Button>
        </div>
      )}

      {latest && revertState !== "none" && (
        <div className="flex min-w-0 flex-col gap-1">
          <Button variant="outline" size="sm" className="h-7 w-fit max-w-full gap-1.5 px-2 text-xs" disabled={revertState !== "ready"} onClick={onRevert}>
            <Undo2 className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">Annuler ces changements</span>
          </Button>
          {revertState === "stale" && (
            <p className="text-[11px] leading-4 text-muted-foreground">D’autres modifications ont suivi&nbsp;: revenez en arrière pas à pas avec Annuler (Ctrl&nbsp;Z).</p>
          )}
        </div>
      )}

      {message.durationMs ? <p className="text-[11px] text-muted-foreground">Réponse en {Math.max(1, Math.round(message.durationMs / 1000))}&nbsp;s</p> : null}
    </div>
  );
}

function ChangeRow({ number, change, project, muted, onFocus }: { number: number; change: EditorChange; project: ClipProject; muted: boolean; onFocus: (change: EditorChange) => void }) {
  const exists = change.itemId ? Boolean(findItem(project, change.itemId)) : false;
  const reachable = exists || change.seconds !== undefined;
  const title = exists ? "Sélectionner l’élément et y amener la tête de lecture" : change.seconds !== undefined ? "Amener la tête de lecture à cet instant" : undefined;
  return (
    <button
      type="button"
      disabled={!reachable}
      onClick={() => onFocus(change)}
      title={title}
      className={cn(
        "group flex w-full min-w-0 items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs leading-5 transition-colors",
        reachable && "hover:bg-muted",
        muted && "text-muted-foreground line-through decoration-muted-foreground/50"
      )}
    >
      <span className="w-4 shrink-0 text-right font-medium tabular-nums">{number}.</span>
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        {change.summary}
        {change.point ? <span className="text-muted-foreground no-underline"> (point {change.point})</span> : null}
      </span>
      {reachable && <Crosshair className="mt-1 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />}
    </button>
  );
}
