"use client";

/**
 * Publications d'un compte : un tableau de données (vignette, titre,
 * visibilité, date, vues, j'aime) avec recherche, filtre de visibilité, tri,
 * pagination et aperçu au survol ; actions selon ce que le connecteur
 * fournit (« Modifier » seulement s'il sait modifier), sur une ligne ou en
 * lot. Programmer passe par le calendrier et l'heure, jamais par une date
 * tapée.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Lock,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ActionStatus, FormStatus, useFeedback, type FeedbackState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AccountSummary, PostPatch, PostPrivacy, PostSummary, PublishField } from "@/lib/connections/types";
import { DateTimePicker } from "@/components/connections/date-time-picker";
import { PublishFieldInput, defaultFieldValue, fieldProblem, type FieldValue } from "@/components/connections/publish-field-input";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import type { ConnectorView } from "@/components/connections/types";
import { listPostsAction, removePostAction, updatePostAction } from "../actions";

const PRIVACY_LABELS: Record<PostPrivacy, string> = { private: "Privée", unlisted: "Non répertoriée", public: "Publique" };
const PRIVACY_ICONS = { private: Lock, unlisted: Link2, public: Globe } as const;

type Filter = "all" | PostPrivacy | "scheduled";
type SortKey = "date" | "views" | "likes" | "title";

const isScheduled = (post: PostSummary) => post.privacy === "private" && Boolean(post.publishAt) && new Date(post.publishAt!).getTime() > Date.now();
const postDate = (post: PostSummary) => new Date((isScheduled(post) ? post.publishAt : post.publishedAt) ?? 0).getTime() || 0;

function privacyChoices(connector: ConnectorView): { value: PostPrivacy; label: string }[] {
  const field = connector.publishFields.find((entry) => entry.role === "privacy");
  const choices = field?.kind === "select" ? field.choices : Object.entries(PRIVACY_LABELS).map(([value, label]) => ({ value, label }));
  return choices.filter((choice): choice is { value: PostPrivacy; label: string } => choice.value in PRIVACY_LABELS);
}

/** Cible d'un message d'action qui porte sur un lot, et non sur une ligne. */
const BULK = "bulk";

const numberText = (value: number | undefined) => (value === undefined ? "–" : value.toLocaleString("fr-FR", { notation: value >= 100_000 ? "compact" : "standard" }));

export function PostsTab({ account, connector }: { account: AccountSummary; connector: ConnectorView }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PostSummary | null>(null);
  const [scheduling, setScheduling] = useState<PostSummary | null>(null);
  const [removing, setRemoving] = useState<PostSummary[] | null>(null);
  const [goingPublic, setGoingPublic] = useState<PostSummary[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  // Avancement d'une action en lot, lu dans la barre de sélection.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Une action réussie sur une publication se voit sur sa ligne (visibilité,
  // programmation, ligne retirée) ; un échec s'y affiche. Le bilan d'une
  // action en lot, qui touche aussi des lignes d'autres pages, s'affiche
  // au-dessus du tableau, là où était la barre de sélection.
  const actionFeedback = useFeedback({ successDuration: 4000 });
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const bulkStatus = actionTarget === BULK ? actionFeedback.state : null;

  const canManage = account.capabilities.includes("posts.manage") && account.status === "connected";
  const canUpdate = canManage && (connector.postActions?.update ?? false);
  const canRemove = canManage && (connector.postActions?.remove ?? false);
  const choices = privacyChoices(connector);
  const canSchedule = canUpdate && connector.publishFields.some((field) => field.role === "scheduledAt");

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      const result = await listPostsAction(account.id, refresh);
      setLoading(false);
      if (!result.ok) return void setError(result.error);
      setError(null);
      setPosts(result.data.posts);
      setFetchedAt(result.data.fetchedAt);
    },
    [account.id]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const counts = useMemo(() => {
    const list = posts ?? [];
    return {
      all: list.length,
      public: list.filter((post) => post.privacy === "public").length,
      unlisted: list.filter((post) => post.privacy === "unlisted").length,
      private: list.filter((post) => post.privacy === "private" && !isScheduled(post)).length,
      scheduled: list.filter(isScheduled).length,
    };
  }, [posts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const list = (posts ?? []).filter((post) => {
      if (filter === "scheduled" && !isScheduled(post)) return false;
      if (filter === "private" && (post.privacy !== "private" || isScheduled(post))) return false;
      if ((filter === "public" || filter === "unlisted") && post.privacy !== filter) return false;
      if (needle && !`${post.title} ${post.description} ${post.tags.join(" ")}`.toLocaleLowerCase("fr").includes(needle)) return false;
      return true;
    });
    const direction = sort.desc ? -1 : 1;
    const value = (post: PostSummary) => (sort.key === "views" ? (post.views ?? -1) : sort.key === "likes" ? (post.likes ?? -1) : postDate(post));
    return list.sort((a, b) => (sort.key === "title" ? a.title.localeCompare(b.title, "fr") * direction : (value(a) - value(b)) * direction));
  }, [posts, query, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const shown = filtered.slice(current * pageSize, current * pageSize + pageSize);

  useEffect(() => setPage(0), [query, filter, pageSize]);
  useEffect(() => setSelected(new Set()), [query, filter]);

  const replace = (post: PostSummary) => setPosts((list) => list?.map((entry) => (entry.id === post.id ? { ...entry, ...post } : entry)) ?? null);
  const toggleSort = (key: SortKey) => setSort((now) => (now.key === key ? { key, desc: !now.desc } : { key, desc: key !== "title" }));

  /** Une action sur une ou plusieurs publications, l'une après l'autre (le service compte chaque appel). */
  const runOn = async (targets: PostSummary[], label: string, action: (post: PostSummary) => Promise<string | null>) => {
    if (targets.length === 0) return;
    const bulk = targets.length > 1;
    setBulkBusy(label);
    setActionTarget(bulk ? BULK : targets[0].id);
    actionFeedback.clear();
    if (bulk) setProgress({ done: 0, total: targets.length });
    let done = 0;
    let failure: string | null = null;
    for (const post of targets) {
      const error = await action(post);
      if (error) {
        // Sur un lot, le message dit quelle publication a bloqué.
        failure = bulk ? `« ${post.title} » : ${error}` : error;
        break;
      }
      done += 1;
      if (bulk) setProgress({ done, total: targets.length });
    }
    setBulkBusy(null);
    setProgress(null);
    if (failure) {
      actionFeedback.error(bulk && done > 0 ? `${failure} Les ${done} premières ont été traitées.` : failure);
    } else if (bulk) {
      actionFeedback.success(`${label} : ${done} publication${done > 1 ? "s" : ""} traitée${done > 1 ? "s" : ""}.`);
    }
    setSelected(new Set());
  };

  const applyPrivacy = (targets: PostSummary[], privacy: PostPrivacy) =>
    runOn(targets, "Visibilité", async (post) => {
      const result = await updatePostAction(account.id, post.id, { privacy });
      if (!result.ok) return result.error;
      replace(result.data);
      return null;
    });

  const askPrivacy = (targets: PostSummary[], privacy: PostPrivacy) => {
    const changing = targets.filter((post) => post.privacy !== privacy || isScheduled(post));
    if (changing.length === 0) return;
    if (privacy === "public") setGoingPublic(changing);
    else void applyPrivacy(changing, privacy);
  };

  const selectedPosts = (posts ?? []).filter((post) => selected.has(post.id));
  const allOnPage = shown.length > 0 && shown.every((post) => selected.has(post.id));
  const someOnPage = shown.some((post) => selected.has(post.id));

  const menu: PostMenu = {
    open: (post) => window.open(post.url, "_blank", "noopener,noreferrer"),
    edit: canUpdate ? setEditing : undefined,
    privacy: canUpdate ? (post, privacy) => askPrivacy([post], privacy) : undefined,
    schedule: canSchedule ? setScheduling : undefined,
    unschedule: canSchedule
      ? (post) =>
          void runOn([post], "Programmation", async (target) => {
            const result = await updatePostAction(account.id, target.id, { publishAt: null });
            if (!result.ok) return result.error;
            replace(result.data);
            return null;
          })
      : undefined,
    remove: canRemove ? (post) => setRemoving([post]) : undefined,
  };

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <InputGroup className="w-full min-w-0 sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, description, tag" aria-label="Chercher une publication" />
          {query ? (
            <InputGroupAddon align="inline-end">
              <Button variant="ghost" size="icon" className="size-6" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => setFilter((next || "all") as Filter)} aria-label="Filtrer par visibilité" className="flex-wrap">
          {(
            [
              ["all", "Toutes"],
              ["public", "Publiques"],
              ["unlisted", "Non répertoriées"],
              ["private", "Privées"],
              ["scheduled", "Programmées"],
            ] as const
          )
            .filter(([value]) => value === "all" || value === filter || counts[value] > 0)
            .map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="gap-1.5 px-2.5">
                {label}
                {posts ? <span className="tabular-nums text-foreground/65">{counts[value]}</span> : null}
              </ToggleGroupItem>
            ))}
        </ToggleGroup>
        <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
          {fetchedAt ? (
            <span className="hidden text-xs text-muted-foreground lg:inline" title={`Liste gardée dix minutes`}>
              Liste {formatRelative(fetchedAt)}
            </span>
          ) : null}
          <Button variant="outline" size="sm" className="gap-2" loading={loading} onClick={() => void load(true)}>
            <RefreshCw className="size-4" />
            Actualiser
          </Button>
        </div>
      </div>

      {!canManage && account.status === "connected" && account.capabilities.includes("posts.list") ? (
        <p className="text-xs text-pretty text-muted-foreground">Lecture seule : la gestion demande un accès plus large. Reconnectez le compte avec le niveau d’accès qui la permet.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {selected.size > 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">
                {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}
              </span>
              {canUpdate ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={bulkBusy !== null}>
                      <Eye className="size-3.5" />
                      Visibilité
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {choices.map((choice) => {
                      const Icon = PRIVACY_ICONS[choice.value];
                      return (
                        <DropdownMenuItem key={choice.value} onClick={() => askPrivacy(selectedPosts, choice.value)}>
                          <Icon className="mr-2 size-4" />
                          {choice.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {canRemove ? (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-destructive hover:text-destructive" disabled={bulkBusy !== null} onClick={() => setRemoving(selectedPosts)}>
                  <Trash2 className="size-3.5" />
                  Supprimer
                </Button>
              ) : null}
              {bulkBusy ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  <Spinner className="size-4" />
                  {progress ? `${bulkBusy} : ${progress.done}/${progress.total}` : null}
                </span>
              ) : null}
              <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setSelected(new Set())}>
                Désélectionner
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* Hors de la grille (`gap-3`) qu'il ferait sauter : l'enveloppe
          compense l'écart, l'espacement s'ouvre avec le message. */}
      <div className="-mt-3">
        <FormStatus state={bulkStatus} className="pt-3" />
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {canManage ? (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="Sélectionner la page"
                    checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                    onCheckedChange={(value) =>
                      setSelected((now) => {
                        const next = new Set(now);
                        for (const post of shown) {
                          if (value === true) next.add(post.id);
                          else next.delete(post.id);
                        }
                        return next;
                      })
                    }
                  />
                </TableHead>
              ) : null}
              <TableHead className={cn("w-20 xl:w-32", !canManage && "pl-4")}>
                <span className="sr-only">Vignette</span>
              </TableHead>
              <TableHead>
                <SortButton label="Titre" active={sort.key === "title"} desc={sort.desc} onClick={() => toggleSort("title")} />
              </TableHead>
              <TableHead className="hidden w-36 md:table-cell">Visibilité</TableHead>
              <TableHead className="hidden w-40 lg:table-cell">
                <SortButton label="Date" active={sort.key === "date"} desc={sort.desc} onClick={() => toggleSort("date")} />
              </TableHead>
              <TableHead className="hidden w-24 text-right xl:table-cell">
                <SortButton label="Vues" active={sort.key === "views"} desc={sort.desc} onClick={() => toggleSort("views")} align="right" />
              </TableHead>
              <TableHead className="hidden w-24 text-right xl:table-cell">
                <SortButton label="J’aime" active={sort.key === "likes"} desc={sort.desc} onClick={() => toggleSort("likes")} align="right" />
              </TableHead>
              <TableHead className="w-12 pr-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts === null ? (
              loading || !error ? (
                Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {canManage ? <TableCell className="pl-4" /> : null}
                    <TableCell className={cn(!canManage && "pl-4")}>
                      <Skeleton className="aspect-video w-full rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell" />
                    <TableCell className="hidden xl:table-cell" />
                    <TableCell />
                  </TableRow>
                ))
              ) : null
            ) : shown.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                  {posts.length === 0 ? "Aucune publication sur ce compte." : "Aucune publication ne correspond."}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  connector={connector}
                  choices={choices}
                  menu={menu}
                  status={actionTarget === post.id ? actionFeedback.state : null}
                  selectable={canManage}
                  selected={selected.has(post.id)}
                  onSelect={(value) =>
                    setSelected((now) => {
                      const next = new Set(now);
                      if (value) next.add(post.id);
                      else next.delete(post.id);
                      return next;
                    })
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {posts && filtered.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {(current * pageSize + 1).toLocaleString("fr-FR")}–{Math.min(filtered.length, (current + 1) * pageSize).toLocaleString("fr-FR")} sur {filtered.length.toLocaleString("fr-FR")}
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger size="sm" className="w-34" aria-label="Publications par page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} par page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="size-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Page précédente">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
              {current + 1} / {pageCount}
            </span>
            <Button variant="outline" size="icon" className="size-8" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Page suivante">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <EditPostSheet
        post={editing}
        connector={connector}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={async (patch) => {
          if (!editing) return null;
          const result = await updatePostAction(account.id, editing.id, patch);
          if (!result.ok) return result.error;
          // Le tiroir se ferme et la ligne montre le nouveau titre.
          replace(result.data);
          setEditing(null);
          return null;
        }}
      />
      <ScheduleDialog
        post={scheduling}
        onOpenChange={(open) => !open && setScheduling(null)}
        onSubmit={async (publishAt) => {
          if (!scheduling) return null;
          const result = await updatePostAction(account.id, scheduling.id, { publishAt, privacy: "private" });
          if (!result.ok) return result.error;
          // La fenêtre se ferme et la ligne passe à « Programmée ».
          replace(result.data);
          setScheduling(null);
          return null;
        }}
      />
      <AlertDialog open={Boolean(goingPublic)} onOpenChange={(open) => !open && setGoingPublic(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {goingPublic && goingPublic.length > 1 ? `Rendre publiques ${goingPublic.length} publications ?` : `Rendre publique « ${goingPublic?.[0]?.title} » ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Visible de tous, tout de suite, chez {connector.label}
              {goingPublic?.some(isScheduled) ? " ; la programmation prévue est retirée" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const targets = goingPublic ?? [];
                setGoingPublic(null);
                void applyPrivacy(targets, "public");
              }}
            >
              Rendre publique{goingPublic && goingPublic.length > 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              {removing && removing.length > 1 ? `Supprimer ${removing.length} publications ?` : `Supprimer « ${removing?.[0]?.title} » ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Supprimée{removing && removing.length > 1 ? "s" : ""} chez {connector.label}, définitivement : les vues, les commentaires et l’adresse disparaissent avec.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const targets = removing ?? [];
                setRemoving(null);
                void runOn(targets, "Suppression", async (post) => {
                  const result = await removePostAction(account.id, post.id, post.title);
                  if (!result.ok) return result.error;
                  setPosts((list) => list?.filter((entry) => entry.id !== post.id) ?? null);
                  return null;
                });
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SortButton({ label, active, desc, onClick, align }: { label: string; active: boolean; desc: boolean; onClick: () => void; align?: "right" }) {
  const Icon = desc ? ArrowDown : ArrowUp;
  return (
    <button type="button" onClick={onClick} className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground", align === "right" && "flex-row-reverse")}>
      {label}
      <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} aria-hidden />
    </button>
  );
}

function PrivacyLabel({ post, className }: { post: PostSummary; className?: string }) {
  if (isScheduled(post)) {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)} title={`Privée jusqu’au ${formatDateTime(post.publishAt)}, puis publique`}>
        <CalendarClock className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">Programmée</span>
      </span>
    );
  }
  const Icon = PRIVACY_ICONS[post.privacy] ?? Lock;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{PRIVACY_LABELS[post.privacy] ?? post.privacy}</span>
    </span>
  );
}

function Thumbnail({ post, className }: { post: PostSummary; className?: string }) {
  return post.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- miniature servie par le service
    <img src={post.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className={cn("aspect-video w-full rounded-md bg-muted object-cover", className)} />
  ) : (
    <span className={cn("block aspect-video w-full rounded-md bg-muted", className)} />
  );
}

/** Aperçu au survol : l'image en grand, le début de la description, les tags et les chiffres. */
function PostPreview({ post, connector }: { post: PostSummary; connector: ConnectorView }) {
  const stats = [
    post.views !== undefined && `${post.views.toLocaleString("fr-FR")} vue${post.views > 1 ? "s" : ""}`,
    post.likes !== undefined && `${post.likes.toLocaleString("fr-FR")} j’aime`,
    post.comments !== undefined && `${post.comments.toLocaleString("fr-FR")} commentaire${post.comments > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return (
    <div className="grid min-w-0 gap-2">
      <Thumbnail post={post} />
      <p className="text-sm font-medium [overflow-wrap:anywhere]">{post.title || "Sans titre"}</p>
      {post.description ? <p className="line-clamp-4 text-xs whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{post.description}</p> : null}
      {post.tags.length > 0 ? (
        <p className="flex flex-wrap gap-1">
          {post.tags.slice(0, 8).map((tag) => (
            <span key={tag} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {tag}
            </span>
          ))}
          {post.tags.length > 8 ? <span className="text-[11px] text-muted-foreground">+{post.tags.length - 8}</span> : null}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        <PrivacyLabel post={post} /> {stats.length ? `· ${stats.join(" · ")}` : ""}
      </p>
      <p className="text-[11px] text-muted-foreground">Clic pour ouvrir sur {connector.label}</p>
    </div>
  );
}

interface PostMenu {
  open: (post: PostSummary) => void;
  edit?: (post: PostSummary) => void;
  privacy?: (post: PostSummary, privacy: PostPrivacy) => void;
  schedule?: (post: PostSummary) => void;
  unschedule?: (post: PostSummary) => void;
  remove?: (post: PostSummary) => void;
}

/** Les mêmes entrées dans le menu « … » et au clic droit. */
function MenuEntries({
  post,
  connector,
  choices,
  menu,
  kit,
}: {
  post: PostSummary;
  connector: ConnectorView;
  choices: { value: PostPrivacy; label: string }[];
  menu: PostMenu;
  kit: "dropdown" | "context";
}) {
  const Item = kit === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator = kit === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;
  const Sub = kit === "dropdown" ? DropdownMenuSub : ContextMenuSub;
  const SubTrigger = kit === "dropdown" ? DropdownMenuSubTrigger : ContextMenuSubTrigger;
  const SubContent = kit === "dropdown" ? DropdownMenuSubContent : ContextMenuSubContent;
  return (
    <>
      <Item onClick={() => menu.open(post)}>
        <ExternalLink className="mr-2 size-4" />
        Ouvrir sur {connector.label}
      </Item>
      {menu.edit ? (
        <Item onClick={() => menu.edit!(post)}>
          <PencilLine className="mr-2 size-4" />
          Modifier
        </Item>
      ) : null}
      {menu.privacy ? (
        <Sub>
          <SubTrigger>
            <Eye className="mr-2 size-4" />
            Visibilité
          </SubTrigger>
          <SubContent>
            {choices.map((choice) => {
              const Icon = PRIVACY_ICONS[choice.value];
              const currentChoice = post.privacy === choice.value && !isScheduled(post);
              return (
                <Item key={choice.value} disabled={currentChoice} onClick={() => menu.privacy!(post, choice.value)}>
                  <Icon className="mr-2 size-4" />
                  {choice.label}
                  {currentChoice ? <span className="ml-auto pl-3 text-xs text-muted-foreground">actuelle</span> : null}
                </Item>
              );
            })}
          </SubContent>
        </Sub>
      ) : null}
      {menu.schedule ? (
        <Item onClick={() => menu.schedule!(post)}>
          <CalendarClock className="mr-2 size-4" />
          {isScheduled(post) ? "Reprogrammer" : "Programmer"}
        </Item>
      ) : null}
      {menu.unschedule && isScheduled(post) ? (
        <Item onClick={() => menu.unschedule!(post)}>
          <CalendarX className="mr-2 size-4" />
          Retirer la programmation
        </Item>
      ) : null}
      {menu.remove ? (
        <>
          <Separator />
          <Item variant="destructive" onClick={() => menu.remove!(post)}>
            <Trash2 className="mr-2 size-4" />
            Supprimer
          </Item>
        </>
      ) : null}
    </>
  );
}

function PostRow({
  post,
  connector,
  choices,
  menu,
  status,
  selectable,
  selected,
  onSelect,
}: {
  post: PostSummary;
  connector: ConnectorView;
  choices: { value: PostPrivacy; label: string }[];
  menu: PostMenu;
  /** Échec de la dernière action sur cette publication. */
  status: FeedbackState | null;
  selectable: boolean;
  selected: boolean;
  onSelect: (value: boolean) => void;
}) {
  const scheduled = isScheduled(post);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow data-state={selected ? "selected" : undefined} className="data-[state=selected]:bg-muted/40">
          {selectable ? (
            <TableCell className="pl-4">
              <Checkbox checked={selected} onCheckedChange={(value) => onSelect(value === true)} aria-label={`Sélectionner « ${post.title} »`} />
            </TableCell>
          ) : null}
          <TableCell className={cn(!selectable && "pl-4")}>
            <HoverCard openDelay={250} closeDelay={80}>
              <HoverCardTrigger asChild>
                <a href={post.url} target="_blank" rel="noreferrer noopener" className="block" tabIndex={-1} aria-hidden>
                  <Thumbnail post={post} />
                </a>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-80 max-w-[calc(100vw-2rem)]">
                <PostPreview post={post} connector={connector} />
              </HoverCardContent>
            </HoverCard>
          </TableCell>
          <TableCell className="whitespace-normal">
            <div className="grid min-w-0 gap-0.5">
              <a href={post.url} target="_blank" rel="noreferrer noopener" className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere] hover:underline">
                {post.title || "Sans titre"}
              </a>
              {post.description ? (
                <span className="hidden truncate text-xs text-muted-foreground xl:block" title={post.description.split("\n")[0]}>
                  {post.description.split("\n")[0]}
                </span>
              ) : null}
              {/* Ce que les colonnes masquées ne montrent plus, sous le titre. */}
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground xl:hidden">
                <PrivacyLabel post={post} className="md:hidden" />
                <span className="lg:hidden">{formatDateTime(scheduled ? post.publishAt : post.publishedAt)}</span>
                {post.views !== undefined ? <span className="tabular-nums">{`${numberText(post.views)} vue${(post.views ?? 0) > 1 ? "s" : ""}`}</span> : null}
              </span>
              {status ? <ActionStatus state={status} /> : null}
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <PrivacyLabel post={post} />
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <span className="block truncate text-xs text-muted-foreground" title={scheduled ? `Programmée pour le ${formatDateTime(post.publishAt)}` : formatDateTime(post.publishedAt)}>
              {formatDateTime(scheduled ? post.publishAt : post.publishedAt)}
            </span>
          </TableCell>
          <TableCell className="hidden text-right text-xs tabular-nums xl:table-cell">{numberText(post.views)}</TableCell>
          <TableCell className="hidden text-right text-xs tabular-nums xl:table-cell">{numberText(post.likes)}</TableCell>
          <TableCell className="pr-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions de « ${post.title} »`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <MenuEntries post={post} connector={connector} choices={choices} menu={menu} kit="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <MenuEntries post={post} connector={connector} choices={choices} menu={menu} kit="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Modification d'une publication dans un tiroir : les champs viennent du connecteur (titre, description, tags, catégorie). */
function EditPostSheet({
  post,
  connector,
  onOpenChange,
  onSubmit,
}: {
  post: PostSummary | null;
  connector: ConnectorView;
  onOpenChange: (open: boolean) => void;
  /** Renvoie le message d'erreur, ou `null` si l'envoi a réussi. */
  onSubmit: (patch: PostPatch) => Promise<string | null>;
}) {
  const fields = useMemo(
    // Le texte d'une publication est la « description » (YouTube) ou la « caption » (message Facebook).
    () => connector.publishFields.filter((field) => field.role === "title" || field.role === "description" || field.role === "caption" || field.role === "tags" || field.role === "category"),
    [connector.publishFields]
  );
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [busy, setBusy] = useState(false);
  // L'erreur d'envoi s'affiche au-dessus du pied du tiroir, près du bouton.
  const feedback = useFeedback();
  const { clear } = feedback;

  useEffect(() => {
    if (!post) return;
    clear();
    const next: Record<string, FieldValue> = {};
    for (const field of fields) {
      if (field.role === "title") next[field.key] = post.title;
      else if (field.role === "description" || field.role === "caption") next[field.key] = post.description;
      else if (field.role === "tags") next[field.key] = post.tags;
      else if (field.role === "category") next[field.key] = post.categoryId ?? defaultFieldValue(field);
    }
    setValues(next);
  }, [post, fields, clear]);

  const valueOf = (role: PublishField["role"]) => {
    const field = fields.find((entry) => entry.role === role);
    return field ? values[field.key] : undefined;
  };
  const problems = fields.map((field) => fieldProblem(field, values[field.key], connector.limits?.text?.count)).filter(Boolean) as string[];

  return (
    <Sheet open={Boolean(post)} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="gap-1 border-b px-5 pt-5 pb-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg">Modifier la publication</SheetTitle>
              <SheetDescription>Envoyée telle quelle à {connector.label}.</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Fermer">
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>
        <form
          id="edit-post-form"
          className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (problems.length > 0) return;
            setBusy(true);
            feedback.clear();
            const patch: PostPatch = {};
            const title = valueOf("title");
            const description = valueOf("description") ?? valueOf("caption");
            const tags = valueOf("tags");
            const category = valueOf("category");
            if (typeof title === "string") patch.title = title;
            if (typeof description === "string") patch.description = description;
            if (Array.isArray(tags)) patch.tags = tags;
            if (typeof category === "string" && category) patch.categoryId = category;
            const error = await onSubmit(patch);
            setBusy(false);
            if (error) feedback.error(error);
          }}
        >
          {post?.thumbnailUrl ? <Thumbnail post={post} className="max-w-xs" /> : null}
          {fields.map((field) => (
            <PublishFieldInput
              key={field.key}
              field={field}
              idPrefix="edit-post"
              value={values[field.key]}
              textCount={connector.limits?.text?.count}
              onChange={(value) => {
                setValues((now) => ({ ...now, [field.key]: value }));
                feedback.clear();
              }}
            />
          ))}
        </form>
        <FormStatus state={feedback.state} className="px-5 pb-3" />
        <SheetFooter className="flex-row items-center justify-between gap-2 border-t px-5 py-3">
          <span className="min-w-0 truncate text-xs text-destructive" title={problems[0]}>
            {problems[0] ?? ""}
          </span>
          <Button type="submit" form="edit-post-form" loading={busy} disabled={problems.length > 0} className="gap-2">
            Enregistrer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Programmer ou reprogrammer : calendrier et heure ; la publication reste privée jusque-là. */
function ScheduleDialog({
  post,
  onOpenChange,
  onSubmit,
}: {
  post: PostSummary | null;
  onOpenChange: (open: boolean) => void;
  /** Renvoie le message d'erreur, ou `null` si la programmation a réussi. */
  onSubmit: (publishAt: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // L'erreur s'affiche dans la fenêtre, au-dessus du bouton.
  const feedback = useFeedback();
  const { clear } = feedback;
  useEffect(() => {
    if (post) setValue(post.publishAt && isScheduled(post) ? post.publishAt : "");
    clear();
  }, [post, clear]);
  return (
    <Dialog open={Boolean(post)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{post && isScheduled(post) ? "Reprogrammer" : "Programmer"}</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">
            « {post?.title} » reste privée jusqu’à cette date, puis devient publique.
          </DialogDescription>
        </DialogHeader>
        <DateTimePicker
          value={value}
          onChange={(next) => {
            setValue(next);
            feedback.clear();
          }}
          aria-label="Date de publication"
          clearable={false}
          inline
          className="mx-auto"
        />
        {/* Enveloppe toujours présente : sa marge négative compense l'écart
            de la grille, et l'espacement s'ouvre avec le message. */}
        <div className="-mt-4">
          <FormStatus state={feedback.state} className="pt-4" />
        </div>
        <DialogFooter>
          <Button
            loading={busy}
            disabled={!value}
            className="gap-2"
            onClick={async () => {
              setBusy(true);
              feedback.clear();
              const error = await onSubmit(value);
              setBusy(false);
              if (error) feedback.error(error);
            }}
          >
            <CalendarClock className="size-4" />
            Programmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

