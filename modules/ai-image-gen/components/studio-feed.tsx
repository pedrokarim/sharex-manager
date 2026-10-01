"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Copy,
  Download,
  EyeOff,
  ImageDown,
  ImageIcon,
  Layers,
  MoreHorizontal,
  PenLine,
  Repeat2,
  RotateCcw,
  Sparkles,
  Star,
  Terminal,
  Trash2,
  Undo2,
  Play,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  aspectRatioOf,
  callModule,
  dayKey,
  dayLabel,
  downloadImage,
  formatDuration,
  imageUrl,
  isJobActive,
  ratioLabel,
  type Collection,
  type HistoryItem,
  type Job,
} from "../lib/client";
import { ProvenanceBadge } from "./provenance";
import {
  GenerationMenuItems,
  JobMenuItems,
  contextMenuKit,
  copyText,
  dropdownMenuKit,
  useRenderActions,
  type RenderActions,
  type StudioActions,
} from "./generation-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type FeedView = "mosaic" | "list" | "chat";

/** Écart entre deux tuiles, et entre deux images d'un même lot, en pixels. */
const TILE_GAP = 16;
const SHOT_GAP = 4;

type FeedEntry =
  | { kind: "render"; key: string; ts: number; ratios: number[]; item: HistoryItem }
  | { kind: "pending"; key: string; ts: number; ratios: number[]; job: Job }
  | { kind: "failed"; key: string; ts: number; ratios: number[]; job: Job };

/** Actions du studio, complétées par le fil (masquer un échec). */
type FeedHandlers = StudioActions;

interface StudioFeedProps extends Omit<StudioActions, "onDismiss"> {
  view: FeedView;
  history: HistoryItem[];
  jobs: Job[];
}

/** Transition commune des éléments du fil : vive, sans rebond marqué. */
const ENTRY_SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;

/**
 * Le fil du studio, sous trois formes :
 *
 * - mosaïque : planche contact justifiée, pour parcourir beaucoup de rendus ;
 * - liste : une génération par ligne, prompt complet et détails à côté ;
 * - chat : la conversation avec le studio, dans l'ordre où elle a eu lieu.
 *
 * Les trois vues partagent les mêmes entrées. Une génération terminée garde
 * l'identité de sa tuile « en cours », si bien que le rendu remplace
 * l'emplacement au lieu d'en créer un autre ailleurs.
 */
export function StudioFeed({ view, history, jobs, ...handlers }: StudioFeedProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const container = useRef<HTMLDivElement>(null);
  const width = useElementWidth(container);

  const entries = useMemo(() => {
    const producedBy = new Map<string, string>();
    for (const job of jobs) {
      if (job.historyIds[0]) producedBy.set(job.historyIds[0], job.id);
    }

    return [
      ...jobs.filter(isJobActive).map((job) => ({
        kind: "pending" as const,
        key: job.id,
        ts: job.createdAt,
        ratios: repeat(aspectRatioOf(job.request.size), job.request.n),
        job,
      })),
      ...jobs
        .filter((job) => job.status === "error" && !dismissed.has(job.id))
        .map((job) => ({
          kind: "failed" as const,
          key: job.id,
          ts: job.createdAt,
          ratios: [Math.max(aspectRatioOf(job.request.size), 1.4)],
          job,
        })),
      ...history.map((item) => ({
        kind: "render" as const,
        key: producedBy.get(item.id) ?? item.id,
        ts: item.createdAt,
        ratios: repeat(aspectRatioOf(item.size), item.imageFiles.length),
        item,
      })),
    ].sort((a, b) => b.ts - a.ts) as FeedEntry[];
  }, [history, jobs, dismissed]);

  const onDismiss = (job: Job) => {
    setDismissed((current) => {
      const next = new Set(current).add(job.id);
      writeDismissed(next);
      return next;
    });
  };

  const context: FeedHandlers = { ...handlers, onDismiss };

  return (
    <div ref={container}>
      <FeedKeyframes />
      {width > 0 && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {view === "mosaic" && <MosaicView entries={entries} width={width} context={context} />}
            {view === "list" && <ListView entries={entries} width={width} context={context} />}
            {view === "chat" && <ChatView entries={entries} width={width} context={context} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function groupByDay(entries: FeedEntry[]) {
  const result: { key: string; label: string; entries: FeedEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.ts);
    const last = result[result.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else result.push({ key, label: dayLabel(entry.ts), entries: [entry] });
  }
  return result;
}

function DayHeading({ label, entries }: { label: string; entries: FeedEntry[] }) {
  return (
    <h2 className="sticky top-0 z-10 -mx-2 flex items-baseline gap-2.5 xl:top-14 bg-background/85 px-2 py-2.5 backdrop-blur-md">
      <span className="text-sm font-semibold first-letter:uppercase">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {countImages(entries)} image(s)
      </span>
    </h2>
  );
}

// ─── Vue mosaïque ────────────────────────────────────────────────

function MosaicView({
  entries,
  width,
  context,
}: {
  entries: FeedEntry[];
  width: number;
  context: FeedHandlers;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupByDay(entries).map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
          <DayHeading label={group.label} entries={group.entries} />
          {/* Toutes les tuiles du jour partagent un même parent, les rangées
              étant marquées par des sauts de ligne : une tuile qui change de
              rangée glisse vers sa nouvelle place au lieu d'être recréée. */}
          <div
            className="relative flex flex-wrap items-start"
            style={{ columnGap: TILE_GAP, rowGap: TILE_GAP + 8 }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {justify(group.entries, width).flatMap((row, rowIndex, rows) => [
                ...row.entries.map((entry) => (
                  <motion.div
                    key={entry.key}
                    layout="position"
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
                    transition={ENTRY_SPRING}
                    className="min-w-0 shrink-0"
                  >
                    <MosaicTile entry={entry} height={row.height} context={context} />
                  </motion.div>
                )),
                rowIndex < rows.length - 1 ? (
                  <div key={`break-${rowIndex}`} aria-hidden className="h-0 basis-full" />
                ) : null,
              ])}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  );
}

function MosaicTile({
  entry,
  height,
  context,
}: {
  entry: FeedEntry;
  height: number;
  context: FeedHandlers;
}) {
  const width = stripWidth(entry.ratios, height);

  if (entry.kind === "failed") {
    return (
      <JobContextMenu job={entry.job} context={context}>
        <article className="flex flex-col gap-2" style={{ width }}>
          <FailedCard job={entry.job} height={height} context={context} />
          <Caption
            title={entry.job.request.prompt}
            meta={[entry.job.modelLabel, clock(entry.job.createdAt)]}
            muted
          />
        </article>
      </JobContextMenu>
    );
  }

  if (entry.kind === "pending") {
    return (
      <JobContextMenu job={entry.job} context={context}>
      <article className="flex flex-col gap-2" style={{ width }}>
        <PendingStrip job={entry.job} ratios={entry.ratios} height={height} />
        <div className="flex min-w-0 items-start gap-1 px-0.5">
          <Caption title={entry.job.request.prompt} meta={[pendingLabel(entry.job)]} muted />
          <div className="-mt-0.5 flex shrink-0 items-center">
            <JobLog job={entry.job} />
            <CancelButton job={entry.job} onMutate={context.onMutate} />
          </div>
        </div>
      </article>
      </JobContextMenu>
    );
  }

  return <MosaicRender item={entry.item} height={height} width={width} context={context} />;
}

function MosaicRender({
  item,
  height,
  width,
  context,
}: {
  item: HistoryItem;
  height: number;
  width: number;
  context: FeedHandlers;
}) {
  const actions = useRenderActions(item, context.onMutate);
  const collection = item.collectionId
    ? context.collectionsById.get(item.collectionId)
    : undefined;
  // Une tuile étroite range ses actions dans le menu.
  const narrow = width < 240;

  return (
    <article className="group/tile flex flex-col gap-2" style={{ width }}>
      <ShotStrip item={item} height={height} actions={actions} context={context} />
      <GenerationContextMenu item={item} actions={actions} context={context}>
      <div className="flex min-w-0 items-start gap-1 px-0.5">
        <Caption
          title={item.prompt}
          tooltip
          meta={[
            item.modelLabel ?? item.model,
            ratioLabel(item.size),
            formatDuration(item.durationMs),
            collection?.name,
            item.parentId ? "variante" : null,
            clock(item.createdAt),
          ]}
        />
        <div className="-mt-0.5 flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover/tile:opacity-100 md:focus-within:opacity-100 md:has-[[data-state=open]]:opacity-100">
          {!narrow && (
            <>
              <IconAction label="Reprendre : texte, réglages et images" onClick={() => context.onRestore(item, "full")}>
                <Undo2 className="h-3.5 w-3.5" />
              </IconAction>
              <FavoriteButton actions={actions} />
            </>
          )}
          <RenderMenu item={item} actions={actions} context={context} />
        </div>
      </div>
      </GenerationContextMenu>
    </article>
  );
}

// ─── Vue liste ───────────────────────────────────────────────────

/** Hauteur des images en vue liste : confortable sans monopoliser l'écran. */
const LIST_HEIGHT = 300;
const LIST_SIDE = 288;

function ListView({
  entries,
  width,
  context,
}: {
  entries: FeedEntry[];
  width: number;
  context: FeedHandlers;
}) {
  // À partir de 1100 px, la légende passe à droite des images.
  const sideBySide = width >= 1100;
  const available = sideBySide ? width - LIST_SIDE - 32 : width;

  return (
    <div className="flex flex-col gap-6">
      {groupByDay(entries).map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
          <DayHeading label={group.label} entries={group.entries} />
          <div className="relative flex flex-col divide-y">
            <AnimatePresence initial={false} mode="popLayout">
              {group.entries.map((entry) => (
                <motion.div
                  key={entry.key}
                  layout="position"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={ENTRY_SPRING}
                  className="py-5 first:pt-2"
                >
                  <ListRow
                    entry={entry}
                    height={fitHeight(entry.ratios, available, LIST_HEIGHT)}
                    sideBySide={sideBySide}
                    context={context}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  );
}

function ListRow({
  entry,
  height,
  sideBySide,
  context,
}: {
  entry: FeedEntry;
  height: number;
  sideBySide: boolean;
  context: FeedHandlers;
}) {
  const layout = (media: React.ReactNode, side: React.ReactNode) => (
    <article
      className={cn(
        "group/row flex gap-x-8 gap-y-4",
        sideBySide ? "flex-row items-start" : "flex-col"
      )}
    >
      <div className="min-w-0 shrink-0">{media}</div>
      <div className={cn("min-w-0", sideBySide ? "shrink-0 pt-1" : "w-full")} style={sideBySide ? { width: LIST_SIDE } : undefined}>
        {side}
      </div>
    </article>
  );

  if (entry.kind === "failed") {
    return (
      <JobContextMenu job={entry.job} context={context}>
        <div>
          {layout(
            <div style={{ width: stripWidth(entry.ratios, height) }}>
              <FailedCard job={entry.job} height={height} context={context} />
            </div>,
            <PromptBlock prompt={entry.job.request.prompt} meta={[entry.job.modelLabel, clock(entry.job.createdAt)]} muted />
          )}
        </div>
      </JobContextMenu>
    );
  }

  if (entry.kind === "pending") {
    return (
      <JobContextMenu job={entry.job} context={context}>
        <div>
          {layout(
            <PendingStrip job={entry.job} ratios={entry.ratios} height={height} />,
            <div className="flex flex-col gap-3">
              <PromptBlock prompt={entry.job.request.prompt} meta={[pendingLabel(entry.job)]} muted />
              <div className="flex items-center gap-1">
                <CancelButton job={entry.job} onMutate={context.onMutate} withLabel />
                <JobLog job={entry.job} />
              </div>
            </div>
          )}
        </div>
      </JobContextMenu>
    );
  }

  return <ListRender item={entry.item} height={height} layout={layout} context={context} />;
}

function ListRender({
  item,
  height,
  layout,
  context,
}: {
  item: HistoryItem;
  height: number;
  layout: (media: React.ReactNode, side: React.ReactNode) => React.ReactNode;
  context: FeedHandlers;
}) {
  const actions = useRenderActions(item, context.onMutate);
  const collection = item.collectionId
    ? context.collectionsById.get(item.collectionId)
    : undefined;

  return layout(
    <ShotStrip item={item} height={height} actions={actions} context={context} />,
    <GenerationContextMenu item={item} actions={actions} context={context}>
    <div className="flex flex-col gap-3">
      {item.sourceImages && item.sourceImages.length > 0 && (
        <div className="flex items-center gap-1.5">
          {item.sourceImages.map((source) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={source.file}
              src={imageUrl(source.file)}
              alt="Image de départ"
              title={source.role === "edit-target" ? "Image retouchée" : "Image d'inspiration"}
              className="h-10 w-10 rounded-md object-cover ring-1 ring-border"
            />
          ))}
          <span className="text-[11px] text-muted-foreground">
            {item.sourceImages.some((source) => source.role === "edit-target")
              ? "Retouche"
              : "Inspiration"}
          </span>
        </div>
      )}
      <PromptBlock
        prompt={item.prompt}
        meta={[
          item.modelLabel ?? item.model,
          ratioLabel(item.size),
          item.quality,
          formatDuration(item.durationMs),
          clock(item.createdAt),
        ]}
      />
      {(collection || item.usedReference || item.parentId) && (
        <div className="flex flex-wrap gap-1.5">
          {collection && (
            <Chip>
              <Layers className="h-3 w-3" />
              {collection.name}
            </Chip>
          )}
          {item.usedReference && <Chip>Depuis une image</Chip>}
          {item.parentId && <Chip>Variante</Chip>}
        </div>
      )}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg" onClick={() => context.onRestore(item, "full")}>
          <Undo2 className="h-3.5 w-3.5" />
          Reprendre
        </Button>
        <IconAction label="Relancer à l'identique" size="md" onClick={() => context.onRerun(item)}>
          <Play className="h-4 w-4" />
        </IconAction>
        <FavoriteButton actions={actions} size="md" />
        <RenderMenu item={item} actions={actions} context={context} size="md" />
      </div>
    </div>
    </GenerationContextMenu>
  );
}

// ─── Vue chat ────────────────────────────────────────────────────

const CHAT_HEIGHT = 280;

function ChatView({
  entries,
  width,
  context,
}: {
  entries: FeedEntry[];
  width: number;
  context: FeedHandlers;
}) {
  // La conversation se lit de haut en bas : on inverse l'ordre du fil.
  const chronological = useMemo(() => [...entries].reverse(), [entries]);
  const anchor = useRef<HTMLDivElement>(null);
  const count = entries.length;

  // À l'ouverture et à chaque nouvel échange, on descend au dernier message,
  // sauf si l'on est en train de relire plus haut.
  const previousCount = useRef(0);
  useEffect(() => {
    const scroller = scrollParentOf(anchor.current);
    if (!scroller) return;
    const first = previousCount.current === 0;
    const nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 400;
    if (first || (count > previousCount.current && nearBottom)) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: first ? "auto" : "smooth" });
    }
    previousCount.current = count;
  }, [count]);

  const bubbleWidth = Math.min(width * 0.82, 760);
  const groups = groupByDay(chronological);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pt-2">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-8">
          <div className="sticky top-0 z-10 flex justify-center py-1 xl:top-16">
            <span className="rounded-full border bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur first-letter:uppercase">
              {group.label}
            </span>
          </div>
          <AnimatePresence initial={false}>
            {group.entries.map((entry) => (
              <motion.div
                key={entry.key}
                layout="position"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={ENTRY_SPRING}
                className="flex flex-col gap-3"
              >
                <ChatExchange
                  entry={entry}
                  height={fitHeight(entry.ratios, bubbleWidth - 48, CHAT_HEIGHT)}
                  context={context}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      ))}
      <div ref={anchor} aria-hidden />
    </div>
  );
}

function ChatExchange({
  entry,
  height,
  context,
}: {
  entry: FeedEntry;
  height: number;
  context: FeedHandlers;
}) {
  if (entry.kind === "render") {
    return <ChatRenderExchange item={entry.item} height={height} context={context} />;
  }
  return <ChatJobExchange entry={entry} height={height} context={context} />;
}

/** Bulle de l'utilisateur : le prompt, ses images de départ et ses réglages. */
function UserBubble({
  prompt,
  sources,
  withImage,
  meta,
  toolbar,
}: {
  prompt: string;
  sources?: string[];
  withImage?: boolean;
  meta: string;
  toolbar?: React.ReactNode;
}) {
  return (
    <div className="group/bubble flex flex-col items-end gap-1 pl-12">
      <div className="max-w-xl rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5">
        {sources && sources.length > 0 && (
          <div className="mb-2 flex justify-end gap-1.5">
            {sources.map((file) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={file}
                src={imageUrl(file)}
                alt="Image de départ"
                className="h-14 w-14 rounded-lg object-cover ring-1 ring-border"
              />
            ))}
          </div>
        )}
        <p className="text-sm leading-6 whitespace-pre-wrap">{prompt}</p>
        <p className="mt-1 flex flex-wrap items-center justify-end gap-x-1.5 text-[11px] text-muted-foreground">
          {withImage && !sources?.length && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              avec image
            </span>
          )}
          <span>{meta}</span>
        </p>
      </div>
      {toolbar && (
        <div className="flex items-center opacity-100 transition-opacity md:opacity-0 md:group-hover/bubble:opacity-100 md:focus-within:opacity-100">
          {toolbar}
        </div>
      )}
    </div>
  );
}

function StudioAvatar({ failed }: { failed?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        failed ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
      )}
    >
      {failed ? <AlertTriangle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
    </span>
  );
}

function ChatRenderExchange({
  item,
  height,
  context,
}: {
  item: HistoryItem;
  height: number;
  context: FeedHandlers;
}) {
  const actions = useRenderActions(item, context.onMutate);
  const meta = [
    item.modelLabel ?? item.model,
    ratioLabel(item.size),
    `×${item.imageFiles.length}`,
    clock(item.createdAt),
  ].join(" · ");

  return (
    <>
      {/* Clic droit sur la bulle : les actions de la génération. */}
      <GenerationContextMenu item={item} actions={actions} context={context}>
        <div>
          <UserBubble
            prompt={item.prompt}
            sources={item.sourceImages?.map((source) => source.file)}
            withImage={item.usedReference}
            meta={meta}
            toolbar={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                  onClick={() => context.onRestore(item, "full")}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Reprendre
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                  onClick={() => context.onRerun(item)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Relancer
                </Button>
                <IconAction label="Copier le prompt" onClick={() => copyText(item.prompt)}>
                  <Copy className="h-3.5 w-3.5" />
                </IconAction>
              </>
            }
          />
        </div>
      </GenerationContextMenu>

      <div className="flex items-start gap-3 pr-12">
        <StudioAvatar />
        <div className="group/row flex min-w-0 flex-1 flex-col gap-2">
          <ShotStrip item={item} height={height} actions={actions} context={context} />
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
            {item.revisedPrompt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="mr-2 cursor-help underline decoration-dotted underline-offset-2">
                    prompt réécrit
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm leading-5">{item.revisedPrompt}</TooltipContent>
              </Tooltip>
            )}
            {formatDuration(item.durationMs) && (
              <span className="mr-2 tabular-nums">en {formatDuration(item.durationMs)}</span>
            )}
            <div className="flex items-center opacity-100 transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-within:opacity-100 md:has-[[data-state=open]]:opacity-100">
              <FavoriteButton actions={actions} />
              <RenderMenu item={item} actions={actions} context={context} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatJobExchange({
  entry,
  height,
  context,
}: {
  entry: Extract<FeedEntry, { kind: "pending" | "failed" }>;
  height: number;
  context: FeedHandlers;
}) {
  const { job } = entry;
  const meta = [job.modelLabel, ratioLabel(job.request.size), `×${job.request.n}`, clock(job.createdAt)].join(" · ");

  return (
    <JobContextMenu job={job} context={context}>
      <div className="flex flex-col gap-3">
        <UserBubble
          prompt={job.request.prompt}
          meta={meta}
          toolbar={
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => context.onRetry(job)}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Reprendre
              </Button>
              <IconAction label="Copier le prompt" onClick={() => copyText(job.request.prompt)}>
                <Copy className="h-3.5 w-3.5" />
              </IconAction>
            </>
          }
        />
        <div className="flex items-start gap-3 pr-12">
          <StudioAvatar failed={entry.kind === "failed"} />
          <div className="min-w-0 flex-1">
            {entry.kind === "pending" ? (
              <div className="flex flex-col gap-2">
                <PendingStrip job={job} ratios={entry.ratios} height={height} />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="mr-1">{pendingLabel(job)}</span>
                  <JobLog job={job} />
                  <CancelButton job={job} onMutate={context.onMutate} />
                </div>
              </div>
            ) : (
              <div className="max-w-xl rounded-2xl rounded-tl-md border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm leading-6">{job.error ?? "Le moteur n'a renvoyé aucune image."}</p>
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 bg-background"
                    onClick={() => context.onRetry(job)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reprendre
                  </Button>
                  <JobLog job={job} />
                  <IconAction label="Masquer cet échec" onClick={() => context.onDismiss(job)}>
                    <EyeOff className="h-3.5 w-3.5" />
                  </IconAction>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </JobContextMenu>
  );
}

function scrollParentOf(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// ─── Briques communes : images ───────────────────────────────────

function repeat(value: number, count: number) {
  return Array.from({ length: Math.max(1, count) }, () => value);
}

function stripWidth(ratios: number[], height: number) {
  return ratios.reduce((sum, ratio) => sum + Math.floor(height * ratio), 0) + SHOT_GAP * (ratios.length - 1);
}

/** Hauteur d'une bande d'images qui tient dans `available`, sans dépasser `max`. */
function fitHeight(ratios: number[], available: number, max: number) {
  const ratioSum = ratios.reduce((sum, ratio) => sum + ratio, 0);
  const fits = (available - SHOT_GAP * (ratios.length - 1)) / ratioSum;
  return Math.max(120, Math.floor(Math.min(max, fits)));
}

/** Coins arrondis d'un lot : arrondis francs aux extrémités, discrets entre images. */
function shotCorners(index: number, count: number) {
  if (count === 1) return "rounded-xl";
  if (index === 0) return "rounded-l-xl rounded-r-sm";
  if (index === count - 1) return "rounded-l-sm rounded-r-xl";
  return "rounded-sm";
}

/** Les images d'une génération, à hauteur donnée, avec leurs actions au survol. */
function ShotStrip({
  item,
  height,
  actions,
  context,
}: {
  item: HistoryItem;
  height: number;
  actions: RenderActions;
  context: FeedHandlers;
}) {
  const count = item.imageFiles.length;
  const ratio = aspectRatioOf(item.size);
  const shotWidth = Math.floor(height * ratio);
  // Sous 190 px de large, la barre d'actions déborderait : on n'y garde que
  // l'essentiel, le reste passe par la visionneuse.
  const compact = shotWidth < 190;
  const { busy, run } = actions;

  return (
    <div className="relative flex" style={{ gap: SHOT_GAP }}>
      {item.imageFiles.map((file, index) => (
        <GenerationContextMenu key={file} item={item} file={file} actions={actions} context={context}>
        <figure
          className={cn("group/shot relative shrink-0 overflow-hidden bg-muted", shotCorners(index, count))}
          style={{ width: shotWidth, height }}
        >
          <button
            type="button"
            onClick={() => context.onOpen(item, index)}
            className="block h-full w-full cursor-zoom-in"
            aria-label={`Agrandir l'image ${index + 1}`}
          >
            {/* L'image reste glissable : déposée sur la page, elle devient
                l'image de départ du compositeur. Elle apparaît en fondu une
                fois décodée. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(file)}
              alt={item.prompt}
              loading="lazy"
              ref={(node) => {
                if (node?.complete) node.dataset.loaded = "1";
              }}
              onLoad={(event) => {
                event.currentTarget.dataset.loaded = "1";
              }}
              className="h-full w-full object-cover opacity-0 transition-[opacity,transform] duration-500 ease-out group-hover/shot:scale-[1.03] data-[loaded]:opacity-100"
            />
          </button>
          <ProvenanceBadge file={file} className="right-2 top-2" />

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0 opacity-0 transition-opacity duration-200 group-hover/shot:opacity-100" />
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 opacity-0 transition-opacity duration-200 group-hover/shot:pointer-events-auto group-hover/shot:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            <ShotAction label="Décliner en variantes" onClick={() => context.onVariants(item, file)}>
              <Wand2 className="h-3.5 w-3.5" />
            </ShotAction>
            <ShotAction label="Retoucher cette image" onClick={() => context.onEdit(item, file)}>
              <PenLine className="h-3.5 w-3.5" />
            </ShotAction>
            {!compact && (
              <ShotAction
                label="Agrandir ×2"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await callModule<{ file?: string }>("upscale", item.id, file, 2);
                    toast.success(`Agrandie : ${result?.file}`);
                    context.onMutate();
                  })
                }
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </ShotAction>
            )}
            {!compact && (
              <ShotAction
                label={item.savedToGallery?.[file] ? "Déjà dans la galerie" : "Envoyer dans la galerie"}
                disabled={busy || Boolean(item.savedToGallery?.[file])}
                onClick={() =>
                  run(async () => {
                    const result = await callModule<{ fileName?: string }>("sendToGallery", item.id, file);
                    toast.success(`Ajoutée à la galerie : ${result?.fileName ?? file}`);
                    context.onMutate();
                  })
                }
              >
                <ImageDown className="h-3.5 w-3.5" />
              </ShotAction>
            )}
            <ShotAction label="Télécharger" onClick={() => downloadImage(imageUrl(file), file)}>
              <Download className="h-3.5 w-3.5" />
            </ShotAction>
          </div>
        </figure>
        </GenerationContextMenu>
      ))}

      {actions.favorite && (
        <Star className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 fill-amber-400 text-amber-400 drop-shadow" />
      )}
    </div>
  );
}

function PendingStrip({ job, ratios, height }: { job: Job; ratios: number[]; height: number }) {
  const running = job.status === "running";
  const elapsed = useElapsed(job.startedAt ?? job.createdAt);
  const shotWidth = Math.floor(height * ratios[0]);
  const percent =
    job.progress.total > 1 ? Math.round((job.progress.current / job.progress.total) * 100) : null;

  return (
    <div className="relative flex" style={{ gap: SHOT_GAP }}>
      {ratios.map((_, index) => (
        <div
          key={index}
          className={cn("relative shrink-0 overflow-hidden bg-muted", shotCorners(index, ratios.length))}
          style={{ width: shotWidth, height }}
        >
          {running ? (
            <>
              {/* Voile lumineux qui respire et reflet qui traverse : l'image
                  « se développe », sans fausse barre de progression. */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 90% at 15% 110%, color-mix(in oklch, var(--primary) 40%, transparent), transparent 60%), radial-gradient(90% 70% at 95% -10%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 55%)",
                  animation: `studio-breathe 3.2s ease-in-out ${index * 0.4}s infinite`,
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(105deg, transparent 35%, color-mix(in oklch, var(--foreground) 10%, transparent) 50%, transparent 65%)",
                  backgroundSize: "250% 100%",
                  animation: `studio-sheen 2.4s linear ${index * 0.3}s infinite`,
                }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,color-mix(in_oklch,var(--foreground)_5%,transparent)_10px_20px)]" />
          )}
        </div>
      ))}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
          {running ? "Génération" : "En file d'attente"}
          {elapsed && <span className="ml-1.5 text-muted-foreground tabular-nums">{elapsed}</span>}
        </span>
        {percent !== null && (
          <span className="h-1 w-24 overflow-hidden rounded-full bg-background/60">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
      </div>
    </div>
  );
}

function FailedCard({ job, height, context }: { job: Job; height: number; context: FeedHandlers }) {
  // Carte basse (mobile, écran étroit) : message court et boutons en icônes.
  const compact = height < 230;
  return (
    <div
      className={cn(
        "flex flex-col justify-between overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5",
        compact ? "gap-1.5 p-3" : "gap-3 p-4"
      )}
      style={{ height }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {compact ? "Échec" : "Échec de la génération"}
      </div>
      <p
        className={cn("min-h-0 text-xs leading-5 text-foreground/80", compact ? "line-clamp-2" : "line-clamp-5")}
        title={job.error}
      >
        {job.error ?? "Le moteur n'a renvoyé aucune image."}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {compact ? (
          <IconAction label="Reprendre la demande" onClick={() => context.onRetry(job)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconAction>
        ) : (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-background" onClick={() => context.onRetry(job)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reprendre
          </Button>
        )}
        <JobLog job={job} />
        <IconAction label="Masquer cet échec" onClick={() => context.onDismiss(job)}>
          <EyeOff className="h-3.5 w-3.5" />
        </IconAction>
      </div>
    </div>
  );
}

// ─── Briques communes : textes et actions ────────────────────────

function Caption({
  title,
  meta,
  muted,
  tooltip,
}: {
  title: string;
  meta: (string | null | undefined)[];
  muted?: boolean;
  tooltip?: boolean;
}) {
  const heading = (
    <p className={cn("truncate text-[13px] leading-5", muted ? "text-foreground/70" : "text-foreground/90")}>
      {title}
    </p>
  );
  return (
    <div className="min-w-0 flex-1">
      {tooltip ? (
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>{heading}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm leading-5">
            {title}
          </TooltipContent>
        </Tooltip>
      ) : (
        heading
      )}
      <p className="truncate text-[11px] leading-4 text-muted-foreground">
        {meta.filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function PromptBlock({
  prompt,
  meta,
  muted,
}: {
  prompt: string;
  meta: (string | null | undefined)[];
  muted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "text-left text-sm leading-6",
          muted ? "text-foreground/70" : "text-foreground/90",
          !expanded && "line-clamp-5"
        )}
        title={expanded ? undefined : "Afficher tout le prompt"}
      >
        {prompt}
      </button>
      <p className="text-xs text-muted-foreground">{meta.filter(Boolean).join(" · ")}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function ShotAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className="h-8 w-8 rounded-lg bg-background/85 shadow-sm backdrop-blur"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  size = "sm",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={size === "md" ? "h-8 w-8" : "h-7 w-7"}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FavoriteButton({ actions, size = "sm" }: { actions: RenderActions; size?: "sm" | "md" }) {
  return (
    <IconAction
      label={actions.favorite ? "Retirer des favoris" : "Mettre en favori"}
      disabled={actions.busy}
      size={size}
      onClick={actions.toggleFavorite}
    >
      <motion.span
        key={String(actions.favorite)}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="flex"
      >
        <Star
          className={cn(
            size === "md" ? "h-4 w-4" : "h-3.5 w-3.5",
            actions.favorite && "fill-amber-400 text-amber-400"
          )}
        />
      </motion.span>
    </IconAction>
  );
}

function RenderMenu({
  item,
  actions,
  context,
  size = "sm",
}: {
  item: HistoryItem;
  actions: RenderActions;
  context: FeedHandlers;
  size?: "sm" | "md";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={size === "md" ? "h-8 w-8" : "h-7 w-7"}
          aria-label="Autres actions"
        >
          <MoreHorizontal className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <GenerationMenuItems kit={dropdownMenuKit} item={item} actions={actions} studio={context} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Zone qui ouvre le menu d'une génération au clic droit. Le contenu est le
 * même que celui du bouton « … », complété des actions de l'image visée.
 */
function GenerationContextMenu({
  item,
  file,
  actions,
  context,
  children,
}: {
  item: HistoryItem;
  file?: string;
  actions: RenderActions;
  context: FeedHandlers;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <GenerationMenuItems kit={contextMenuKit} item={item} file={file} actions={actions} studio={context} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Menu au clic droit d'une génération en cours ou échouée. */
function JobContextMenu({
  job,
  context,
  children,
}: {
  job: Job;
  context: FeedHandlers;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <JobMenuItems kit={contextMenuKit} job={job} studio={context} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function CancelButton({
  job,
  onMutate,
  withLabel,
}: {
  job: Job;
  onMutate: () => void;
  withLabel?: boolean;
}) {
  const cancel = async () => {
    await callModule("cancelGeneration", job.id);
    toast.info("Génération annulée");
    onMutate();
  };
  if (withLabel) {
    return (
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={cancel}>
        <X className="h-3.5 w-3.5" />
        Annuler
      </Button>
    );
  }
  return (
    <IconAction label="Annuler la génération" onClick={cancel}>
      <X className="h-3.5 w-3.5" />
    </IconAction>
  );
}

function JobLog({ job }: { job: Job }) {
  if (!job.log.length) return null;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Journal du moteur">
              <Terminal className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Journal du moteur</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap">
          {job.log.slice(-60).map((line, index) => (
            <span
              key={index}
              className={cn(
                "block",
                line.level === "error" && "text-destructive",
                line.level === "warn" && "text-amber-600 dark:text-amber-400"
              )}
            >
              {line.text}
            </span>
          ))}
        </pre>
      </PopoverContent>
    </Popover>
  );
}

// ─── Mise en page justifiée (mosaïque) ───────────────────────────

/** Hauteur visée d'une rangée : plus d'images par rangée sur un écran large. */
function targetHeight(width: number) {
  return Math.round(Math.min(320, Math.max(180, width / 4.4)));
}

/**
 * Range les tuiles en rangées pleine largeur.
 *
 * On accumule les tuiles tant que la rangée, ramenée à la largeur du
 * conteneur, reste plus haute que la cible ; dès qu'une tuile la fait passer
 * sous la cible, on ferme. Les écarts fixes (entre tuiles et entre images d'un
 * lot) sont retirés de la largeur avant le calcul, pour que la rangée tombe au
 * pixel près. La dernière rangée d'un jour n'est pas étirée.
 */
function justify(entries: FeedEntry[], width: number) {
  const target = targetHeight(width);
  const rows: { entries: FeedEntry[]; height: number }[] = [];
  let current: FeedEntry[] = [];

  const heightOf = (row: FeedEntry[]) => {
    const ratioSum = row.reduce(
      (sum, entry) => sum + entry.ratios.reduce((total, ratio) => total + ratio, 0),
      0
    );
    const fixed =
      (row.length - 1) * TILE_GAP +
      row.reduce((sum, entry) => sum + (entry.ratios.length - 1) * SHOT_GAP, 0);
    return (width - fixed) / ratioSum;
  };

  for (const entry of entries) {
    current.push(entry);
    const height = heightOf(current);
    if (height <= target) {
      rows.push({ entries: current, height: Math.floor(height) });
      current = [];
    }
  }
  if (current.length) {
    // Pas plus haute que la rangée pleine qui la précède : sinon la fin du
    // jour paraît zoomée.
    const previous = rows[rows.length - 1]?.height ?? target;
    rows.push({
      entries: current,
      height: Math.min(target, previous, Math.floor(heightOf(current))),
    });
  }
  return rows;
}

// ─── Divers ──────────────────────────────────────────────────────

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function useElapsed(since: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!since) return null;
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
}

function countImages(entries: FeedEntry[]) {
  return entries.reduce(
    (total, entry) =>
      total +
      (entry.kind === "render"
        ? entry.item.imageFiles.length
        : entry.kind === "pending"
          ? entry.job.request.n
          : 0),
    0
  );
}

function pendingLabel(job: Job) {
  if (job.pipelineStep) {
    return `Étape ${job.pipelineStep.index + 1}/${job.pipelineStep.total} · ${job.progress.label}`;
  }
  return job.progress.label || `${job.modelLabel} · ${ratioLabel(job.request.size)}`;
}

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}


/** Animations propres au fil, déclarées une fois. */
function FeedKeyframes() {
  return (
    <style>{`
      @keyframes studio-sheen { from { background-position: 150% 0; } to { background-position: -100% 0; } }
      @keyframes studio-breathe { 0%, 100% { opacity: .35; } 50% { opacity: .85; } }
      @media (prefers-reduced-motion: reduce) {
        [style*="studio-sheen"], [style*="studio-breathe"] { animation: none !important; }
      }
    `}</style>
  );
}

const DISMISSED_KEY = "ai-image-gen:dismissed-failures";

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    // Seuls les derniers identifiants comptent : la file serveur n'en garde
    // qu'une vingtaine.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // Stockage indisponible (navigation privée) : l'échec réapparaîtra.
  }
}
