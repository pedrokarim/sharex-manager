"use client";

/**
 * Page des tags (docs/organisation.md, § 5) : le tableau de tous les tags de
 * l'instance, avec leur nombre de fichiers, leur dernière pose et leur
 * créateur. Création en ligne, renommage et description sur place, fusion
 * (administrateur) et suppression depuis le menu de la ligne. Le nom d'un tag
 * mène à la galerie filtrée.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  Images,
  Merge,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCw,
  Search,
  Text,
  Trash2,
  X,
} from "lucide-react";
import { ActionStatus, errorMessage, FormStatus, useFeedback } from "@/components/feedback";
import { THEMED_ICONS } from "@/components/icon-theme";
import { PageTitleIcon } from "@/components/page-title-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { cleanTagName, TAG_DESCRIPTION_MAX, TAG_NAME_MAX, type Tag } from "@/lib/organization/types";
import { fileCountLabel } from "@/components/tags/tag-editor";
import { galleryTagHref, tagsApi } from "@/components/tags/tags-api";

export interface TagsViewer {
  id: string;
  isAdmin: boolean;
}

type SortKey = "name" | "files" | "lastUsed" | "creator";
type Editing = { id: number; field: "name" | "description" } | null;

const COLUMN_COUNT = 5;

/** Comparaison sans casse ni accents, pour la recherche. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");
}

const relativeFormat = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const fullDateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

/** « il y a 3 jours », « hier », « à l’instant ». */
export function relativeDate(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "à l’instant";
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let chosen = units[0];
  for (const unit of units) if (abs >= unit[1]) chosen = unit;
  return relativeFormat.format(Math.round(seconds / chosen[1]), chosen[0]);
}

export function sortTags(tags: Tag[], key: SortKey, desc: boolean, creatorLabel: (tag: Tag) => string): Tag[] {
  const direction = desc ? -1 : 1;
  const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  return [...tags].sort((a, b) => {
    let comparison = 0;
    if (key === "files") comparison = a.fileCount - b.fileCount;
    else if (key === "lastUsed") {
      // Un tag jamais posé reste en bas, dans les deux sens.
      if (!a.lastUsedAt || !b.lastUsedAt) {
        if (a.lastUsedAt === b.lastUsedAt) return byName(a, b);
        return a.lastUsedAt ? -1 : 1;
      }
      comparison = new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();
    } else if (key === "creator") comparison = creatorLabel(a).localeCompare(creatorLabel(b), "fr", { sensitivity: "base" });
    else comparison = byName(a, b);
    return comparison * direction || byName(a, b);
  });
}

const NO_USER_NAMES: Record<string, string> = {};

export function TagsPageClient({
  viewer,
  userNames = NO_USER_NAMES,
}: {
  viewer: TagsViewer;
  /** Nom de chaque compte, par identifiant : la colonne « Créateur ». */
  userNames?: Record<string, string>;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [merging, setMerging] = useState<Tag | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  // Le retour d'un renommage ou d'une description se lit sur la ligne du tag.
  const rowFeedback = useFeedback();
  const [rowFeedbackId, setRowFeedbackId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await tagsApi.list());
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, "Les tags n’ont pas pu être chargés."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (highlight === null) return;
    const timer = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(timer);
  }, [highlight]);

  const isMine = useCallback((tag: Tag) => tag.createdBy !== null && tag.createdBy === viewer.id, [viewer.id]);
  // Même règle que le serveur : le créateur du tag ou un administrateur.
  const canEdit = (tag: Tag) => viewer.isAdmin || isMine(tag);
  const creatorLabel = useCallback(
    (tag: Tag) => {
      if (tag.createdBy === null) return "";
      if (isMine(tag)) return "Vous";
      return userNames[tag.createdBy] ?? "Compte supprimé";
    },
    [isMine, userNames],
  );

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    const filtered = needle ? tags.filter((tag) => fold(`${tag.name} ${tag.description ?? ""}`).includes(needle)) : tags;
    return sortTags(filtered, sort.key, sort.desc, creatorLabel);
  }, [tags, query, sort, creatorLabel]);

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key === "files" || key === "lastUsed" }));

  const replaceTag = (tag: Tag) => setTags((current) => current.map((entry) => (entry.id === tag.id ? tag : entry)));

  /** Le tag créé rejoint la liste ; `true` s'il y était déjà. */
  const onCreated = (tag: Tag): boolean => {
    const existed = tags.some((entry) => entry.id === tag.id);
    setTags((current) =>
      current.some((entry) => entry.id === tag.id) ? current.map((entry) => (entry.id === tag.id ? tag : entry)) : [...current, tag],
    );
    setQuery("");
    setHighlight(tag.id);
    return existed;
  };

  const saveEdit = async (tag: Tag, field: "name" | "description", raw: string) => {
    setRowFeedbackId(tag.id);
    rowFeedback.clear();
    let patch: { name?: string; description?: string | null };
    if (field === "name") {
      const name = cleanTagName(raw);
      if (!name) return void rowFeedback.error("Le nom ne peut pas être vide.");
      if (name === tag.name) return void setEditing(null);
      patch = { name };
    } else {
      const description = raw.trim().slice(0, TAG_DESCRIPTION_MAX) || null;
      if (description === (tag.description ?? null)) return void setEditing(null);
      patch = { description };
    }
    try {
      const updated = await tagsApi.update(tag.id, patch);
      replaceTag(updated ?? { ...tag, ...patch });
      setEditing(null);
      rowFeedback.success(field === "name" ? "Renommé" : "Description enregistrée");
    } catch (error) {
      rowFeedback.error(errorMessage(error, "Le tag n’a pas pu être modifié."));
    }
  };

  const startEdit = (tag: Tag, field: "name" | "description") => {
    rowFeedback.clear();
    setEditing({ id: tag.id, field });
  };

  const sortHead = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <SortButton label={label} active={sort.key === key} desc={sort.desc} onClick={() => toggleSort(key)} />
    </TableHead>
  );

  const empty = !loading && !loadError && tags.length === 0;

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex min-h-full w-full min-w-0 shrink-0 flex-col gap-6 pt-2 pb-2">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <PageTitleIcon icon={THEMED_ICONS.tags} />
            Tags
          </h1>
          <p className="max-w-3xl text-sm text-pretty text-muted-foreground sm:text-base">
            Des mots posés sur les fichiers, communs à toute l’instance. Le nom d’un tag ouvre la galerie de ses fichiers.
          </p>
        </header>

        {loadError ? (
          <div role="alert" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 break-words">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()} loading={loading} className="shrink-0">
              <RotateCw className="size-4" />
              Réessayer
            </Button>
          </div>
        ) : null}

        {empty ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Aucun tag pour l’instant</EmptyTitle>
              <EmptyDescription>
                Créez le premier ici, ou posez-en un depuis la galerie : menu d’un fichier, « Tags… ».
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="w-full max-w-md">
              <CreateTagForm onCreated={onCreated} />
            </EmptyContent>
          </Empty>
        ) : loadError && tags.length === 0 ? null : (
          <section className="grid min-w-0 gap-3" aria-label="Liste des tags">
            <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3">
              <CreateTagForm onCreated={onCreated} className="w-full sm:w-auto sm:min-w-80" />
              <div className="flex w-full min-w-0 items-center gap-3 sm:ml-auto sm:w-auto">
                {!loading ? (
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {tags.length.toLocaleString("fr-FR")} tag{tags.length > 1 ? "s" : ""}
                  </span>
                ) : null}
                <InputGroup className="min-w-0 flex-1 sm:w-64 sm:flex-none">
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Chercher un tag"
                    aria-label="Chercher un tag"
                  />
                </InputGroup>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {sortHead("name", "Nom", "pl-4")}
                    {sortHead("files", "Fichiers", "w-24 text-right")}
                    {sortHead("lastUsed", "Dernière pose", "hidden w-40 sm:table-cell")}
                    {sortHead("creator", "Créateur", "hidden w-40 md:table-cell")}
                    <TableHead className="w-12 pr-3">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && tags.length === 0 ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent" aria-hidden>
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-40 max-w-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="ml-auto h-4 w-8" />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))
                  ) : visible.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={COLUMN_COUNT} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                        <p className="break-words">Aucun tag ne correspond à « {query.trim()} ».</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery("")}>
                          Effacer la recherche
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {visible.map((tag) => (
                      <TagRow
                        key={tag.id}
                        tag={tag}
                        editing={editing?.id === tag.id ? editing.field : null}
                        highlighted={highlight === tag.id}
                        creator={creatorLabel(tag)}
                        canEdit={canEdit(tag)}
                        canMerge={viewer.isAdmin && tags.length > 1}
                        status={rowFeedbackId === tag.id ? rowFeedback.state : null}
                        onStartEdit={(field) => startEdit(tag, field)}
                        onCancelEdit={() => {
                          setEditing(null);
                          rowFeedback.clear();
                        }}
                        onSave={(field, value) => saveEdit(tag, field, value)}
                        onDelete={() => setDeleting(tag)}
                        onMerge={() => setMerging(tag)}
                      />
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </main>

      <DeleteTagDialog
        tag={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => {
          setDeleting(null);
          setTags((current) => current.filter((entry) => entry.id !== id));
        }}
      />
      <MergeTagDialog
        tag={merging}
        tags={tags}
        onOpenChange={(open) => !open && setMerging(null)}
        onMerged={(sourceId, target) => {
          setMerging(null);
          setTags((current) => current.filter((entry) => entry.id !== sourceId));
          setHighlight(target.id);
          // Les compteurs de la cible changent : la liste se relit sans repasser par le squelette.
          void tagsApi.list().then(setTags, () => undefined);
        }}
      />
    </MotionConfig>
  );
}

function SortButton({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  const Icon = desc ? ArrowDown : ArrowUp;
  return (
    <button type="button" onClick={onClick} className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground">
      {label}
      <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} aria-hidden />
    </button>
  );
}

function TagRow({
  tag,
  editing,
  highlighted,
  creator,
  canEdit,
  canMerge,
  status,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onMerge,
}: {
  tag: Tag;
  editing: "name" | "description" | null;
  highlighted: boolean;
  creator: string;
  canEdit: boolean;
  canMerge: boolean;
  status: ReturnType<typeof useFeedback>["state"];
  onStartEdit: (field: "name" | "description") => void;
  onCancelEdit: () => void;
  onSave: (field: "name" | "description", value: string) => Promise<void>;
  onDelete: () => void;
  onMerge: () => void;
}) {
  // Après « Renommer », le curseur va dans le champ plutôt que revenir au bouton du menu.
  const keepFocusRef = useRef(false);
  const href = galleryTagHref(tag.slug);

  return (
    <motion.tr
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      data-slot="table-row"
      data-tag-row={tag.slug}
      className={cn("border-b transition-colors hover:bg-muted/50", highlighted && "bg-primary/5")}
    >
      <TableCell className="min-w-0 py-2.5 pl-4 whitespace-normal">
        <div className="min-w-0">
          {editing === "name" ? (
            <InlineField
              label={`Nouveau nom de ${tag.name}`}
              initial={tag.name}
              maxLength={TAG_NAME_MAX}
              onSave={(value) => onSave("name", value)}
              onCancel={onCancelEdit}
            />
          ) : (
            <Link href={href} className="block min-w-0 truncate font-medium hover:underline" title={`Ouvrir les fichiers tagués « ${tag.name} »`}>
              {tag.name}
            </Link>
          )}
          {editing === "description" ? (
            <div className="mt-1.5">
              <InlineField
                label={`Description de ${tag.name}`}
                initial={tag.description ?? ""}
                placeholder="Une phrase sur ce que le tag regroupe"
                maxLength={TAG_DESCRIPTION_MAX}
                onSave={(value) => onSave("description", value)}
                onCancel={onCancelEdit}
              />
            </div>
          ) : tag.description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={tag.description}>
              {tag.description}
            </p>
          ) : null}
          {status ? (
            <div className="mt-1 flex min-w-0">
              <ActionStatus state={status} />
            </div>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums" title={fileCountLabel(tag.fileCount)}>
        {tag.fileCount.toLocaleString("fr-FR")}
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {tag.lastUsedAt ? (
          <time dateTime={tag.lastUsedAt} title={fullDateFormat.format(new Date(tag.lastUsedAt))} className="block truncate">
            {relativeDate(tag.lastUsedAt)}
          </time>
        ) : (
          "Jamais posé"
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className={cn("block truncate", !creator && "text-muted-foreground")} title={creator || undefined}>
          {creator || "Inconnu"}
        </span>
      </TableCell>
      <TableCell className="pr-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions du tag ${tag.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-60"
            onCloseAutoFocus={(event) => {
              if (keepFocusRef.current) {
                event.preventDefault();
                keepFocusRef.current = false;
              }
            }}
          >
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Images className="size-4" />
                Voir les fichiers
              </Link>
            </DropdownMenuItem>
            {canEdit ? (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    keepFocusRef.current = true;
                    onStartEdit("name");
                  }}
                >
                  <PencilLine className="size-4" />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    keepFocusRef.current = true;
                    onStartEdit("description");
                  }}
                >
                  <Text className="size-4" />
                  {tag.description ? "Modifier la description" : "Ajouter une description"}
                </DropdownMenuItem>
              </>
            ) : null}
            {canMerge || canEdit ? <DropdownMenuSeparator /> : null}
            {canMerge ? (
              <DropdownMenuItem onSelect={onMerge}>
                <Merge className="size-4" />
                Fusionner dans un autre tag…
              </DropdownMenuItem>
            ) : null}
            {canEdit ? (
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 className="size-4" />
                Supprimer le tag…
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </motion.tr>
  );
}

/** Champ de modification sur place : Entrée enregistre, Échap annule. */
function InlineField({
  label,
  initial,
  placeholder,
  maxLength,
  onSave,
  onCancel,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  maxLength: number;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    await onSave(value);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 items-center gap-1">
      <Input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={busy}
        className="h-8 min-w-0 flex-1"
      />
      <Button type="submit" variant="ghost" size="icon" className="size-8 shrink-0" loading={busy} aria-label="Enregistrer">
        <Check className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onCancel} disabled={busy} aria-label="Annuler">
        <X className="size-4" />
      </Button>
    </form>
  );
}

function CreateTagForm({ onCreated, className }: { onCreated: (tag: Tag) => boolean; className?: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = cleanTagName(name);
    feedback.clear();
    if (!clean) return void feedback.error("Donnez un nom au tag.");
    setBusy(true);
    try {
      const tag = await tagsApi.create(clean);
      if (!tag) throw new Error("Le tag n’a pas pu être créé.");
      // Un nom au même slug renvoie le tag existant (« Jeu vidéo » et « jeu-video »).
      const existed = onCreated(tag);
      setName("");
      feedback.success(existed ? `« ${tag.name} » existait déjà` : `« ${tag.name} » créé`);
    } catch (error) {
      feedback.error(errorMessage(error, "Le tag n’a pas pu être créé."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            feedback.clear();
          }}
          placeholder="Nom du nouveau tag"
          aria-label="Nom du nouveau tag"
          maxLength={TAG_NAME_MAX}
          className="min-w-0 flex-1"
        />
        <Button type="submit" loading={busy} className="shrink-0 gap-2">
          <Plus className="size-4" />
          Créer le tag
        </Button>
      </div>
      <ActionStatus state={feedback.state} className="min-h-4" />
    </form>
  );
}

function DeleteTagDialog({
  tag,
  onOpenChange,
  onDeleted,
}: {
  tag: Tag | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const { clear } = feedback;
  useEffect(() => clear(), [tag, clear]);

  return (
    <AlertDialog open={tag !== null} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <AlertDialogContent>
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle className="break-words">Supprimer le tag « {tag?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            {tag && tag.fileCount > 0
              ? `Il est retiré des ${fileCountLabel(tag.fileCount)} qui le portent ; les fichiers restent dans la galerie.`
              : "Aucun fichier ne le porte."}{" "}
            Les collections qui le citent ne le citent plus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="-mt-4">
          <FormStatus state={feedback.state} className="pt-4" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={async (event) => {
              event.preventDefault();
              if (!tag) return;
              setBusy(true);
              feedback.clear();
              try {
                await tagsApi.remove(tag.id);
                onDeleted(tag.id);
              } catch (error) {
                feedback.error(errorMessage(error, "Le tag n’a pas pu être supprimé."));
              } finally {
                setBusy(false);
              }
            }}
          >
            Supprimer le tag
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MergeTagDialog({
  tag,
  tags,
  onOpenChange,
  onMerged,
}: {
  tag: Tag | null;
  tags: Tag[];
  onOpenChange: (open: boolean) => void;
  onMerged: (sourceId: number, target: Tag) => void;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const { clear } = feedback;
  useEffect(() => {
    setTargetId(null);
    clear();
  }, [tag, clear]);

  const others = useMemo(
    () => tags.filter((entry) => entry.id !== tag?.id).sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" })),
    [tags, tag],
  );
  const target = others.find((entry) => entry.id === targetId) ?? null;

  const submit = async () => {
    if (!tag || !target) return;
    setBusy(true);
    feedback.clear();
    try {
      const merged = await tagsApi.merge(tag.id, target.id);
      onMerged(tag.id, merged ?? target);
    } catch (error) {
      feedback.error(errorMessage(error, "Les tags n’ont pas pu être fusionnés."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={tag !== null} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Fusionner « {tag?.name} »</DialogTitle>
          <DialogDescription>
            {tag && tag.fileCount > 0 ? `Les ${fileCountLabel(tag.fileCount)} qui le portent reçoivent le tag choisi` : "Le tag choisi le remplace"}, puis « {tag?.name} » est supprimé.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-md border" label="Tag de destination">
          <CommandInput placeholder="Chercher un tag" />
          <CommandList className="max-h-56">
            <CommandEmpty>Aucun tag ne correspond.</CommandEmpty>
            {others.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`${entry.name} ${entry.slug}`}
                onSelect={() => setTargetId(entry.id)}
                data-checked={entry.id === targetId || undefined}
                className="min-w-0"
              >
                <Check className={cn("size-4 shrink-0", entry.id === targetId ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="min-w-0 flex-1 truncate" title={entry.name}>
                  {entry.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fileCountLabel(entry.fileCount)}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <FormStatus state={feedback.state} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!target} loading={busy} className="min-w-0">
            <span className="truncate">{target ? `Fusionner dans « ${target.name} »` : "Choisir un tag"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

