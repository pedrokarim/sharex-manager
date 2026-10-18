"use client";

/**
 * Page d'accueil du compte (sections) et playlists, quand le connecteur les
 * gère (`connector.profileSections`, `connector.playlists`), chacune dans son
 * panneau : liste ordonnée, ajout dans l'en-tête ou le pied, état vide et
 * erreur de lecture dans le panneau. Chaque écriture part aussitôt chez le
 * service, puis la liste est relue.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, CircleAlert, ExternalLink, Globe, LayoutList, Link2, ListPlus, ListVideo, Lock, PencilLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ActionStatus, FormStatus, useFeedback } from "@/components/feedback";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CharacterCount } from "@/components/ui/character-count";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { resolveManualUrl } from "@/lib/connections/profile";
import type { AccountSummary, ConnectionCapability, PlaylistInput, PlaylistSummary, PostPrivacy, PostSummary, ProfileSection } from "@/lib/connections/types";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import type { ConnectorView } from "@/components/connections/types";
import {
  addPlaylistVideoAction,
  addSectionAction,
  createPlaylistAction,
  listPlaylistsAction,
  listPostsAction,
  listSectionsAction,
  moveSectionAction,
  removeSectionAction,
  updatePlaylistAction,
} from "../actions";
import type { FieldAccess, LoadState } from "./profile-fields";

const PRIVACY: Record<PostPrivacy, { label: string; icon: typeof Lock }> = {
  private: { label: "Privée", icon: Lock },
  unlisted: { label: "Non répertoriée", icon: Link2 },
  public: { label: "Publique", icon: Globe },
};

/** Ancres des panneaux, reprises par le sommaire de l'onglet. */
export const SECTIONS_PANEL_ID = "channel-sections";
export const PLAYLISTS_PANEL_ID = "channel-playlists";

/** Échec d'une lecture chez le service, dans le panneau concerné, avec de quoi réessayer. */
function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Lecture impossible</AlertTitle>
      <AlertDescription>
        <p className="break-words">{message}</p>
        <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={onRetry}>
          <RefreshCw />
          Réessayer
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function AccessButton({ access, serviceLabel }: { access: FieldAccess; serviceLabel: string }) {
  if (access.state === "ok") return null;
  if (access.state === "authorize") {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={access.href}>Autoriser…</a>
      </Button>
    );
  }
  return (
    <span className="text-xs text-pretty text-amber-700 dark:text-amber-400">
      {access.state === "reconnect" ? "Compte à reconnecter." : `Le rôle de ce compte chez ${serviceLabel} ne le permet pas.`}
    </span>
  );
}

export function ChannelLayout({
  account,
  connector,
  accessFor,
}: {
  account: AccountSummary;
  connector: ConnectorView;
  accessFor: (capability?: ConnectionCapability) => FieldAccess;
}) {
  const [playlists, setPlaylists] = useState<LoadState<PlaylistSummary[]> | null>(connector.playlists ? { status: "loading" } : null);

  const loadPlaylists = useCallback(async () => {
    if (!connector.playlists) return;
    setPlaylists({ status: "loading" });
    const result = await listPlaylistsAction(account.id);
    setPlaylists(result.ok ? { status: "ready", data: result.data } : { status: "error", error: result.error });
  }, [account.id, connector.playlists]);

  useEffect(() => {
    if (account.status === "connected") void loadPlaylists();
  }, [account.status, loadPlaylists]);

  if (!connector.profileSections && !connector.playlists) return null;
  return (
    <>
      {connector.profileSections ? <HomeSections account={account} connector={connector} access={accessFor(connector.profileSections.capability)} playlists={playlists} /> : null}
      {connector.playlists ? (
        <Playlists account={account} connector={connector} access={accessFor(connector.playlists.capability)} playlists={playlists} onReload={loadPlaylists} onChanged={setPlaylists} />
      ) : null}
    </>
  );
}

// ─── Sections de la page d'accueil ────────────────────────────────

function HomeSections({
  account,
  connector,
  access,
  playlists,
}: {
  account: AccountSummary;
  connector: ConnectorView;
  access: FieldAccess;
  playlists: LoadState<PlaylistSummary[]> | null;
}) {
  const support = connector.profileSections!;
  const [sections, setSections] = useState<LoadState<ProfileSection[]>>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [addType, setAddType] = useState(support.types[0]?.value ?? "");
  const [addPlaylist, setAddPlaylist] = useState("");
  const [removing, setRemoving] = useState<ProfileSection | null>(null);
  const canEdit = access.state === "ok";
  const type = support.types.find((entry) => entry.value === addType);
  const playlistList = playlists?.status === "ready" ? playlists.data : [];
  const manualUrl = support.manualUrl ? resolveManualUrl(support.manualUrl, account) : null;

  const load = useCallback(async () => {
    setSections({ status: "loading" });
    const result = await listSectionsAction(account.id);
    setSections(result.ok ? { status: "ready", data: result.data } : { status: "error", error: result.error });
  }, [account.id]);

  useEffect(() => {
    if (account.status === "connected") void load();
  }, [account.status, load]);

  // Une section ajoutée, déplacée ou retirée se voit dans la liste ; un échec
  // s'affiche sur la section concernée, ou sous « Ajouter ».
  const applyFeedback = useFeedback();
  const [applyKey, setApplyKey] = useState<string | null>(null);
  const applyStatusOf = (key: string) => (applyKey === key ? applyFeedback.state : null);

  const apply = async (key: string, task: () => Promise<{ ok: true; data: ProfileSection[] } | { ok: false; error: string }>) => {
    setBusy(key);
    setApplyKey(key);
    applyFeedback.clear();
    const result = await task();
    setBusy(null);
    if (!result.ok) return void applyFeedback.error(result.error);
    setSections({ status: "ready", data: result.data });
  };

  const list = sections.status === "ready" ? sections.data : [];
  const full = list.length >= support.maxSections;
  const describe = (section: ProfileSection) => {
    if (section.title) return section.title;
    if (section.playlistIds?.length) {
      const names = section.playlistIds.map((id) => playlistList.find((playlist) => playlist.id === id)?.title ?? id);
      return names.join(", ");
    }
    if (section.channelIds?.length) return `${section.channelIds.length} chaîne${section.channelIds.length > 1 ? "s" : ""}`;
    return null;
  };

  return (
    <Panel id={SECTIONS_PANEL_ID} aria-labelledby={`${SECTIONS_PANEL_ID}-title`} className="@container scroll-mt-4">
      <PanelHeader
        icon={LayoutList}
        titleId={`${SECTIONS_PANEL_ID}-title`}
        title={
          <>
            Page d’accueil
            {sections.status === "ready" ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                {list.length}/{support.maxSections}
              </span>
            ) : null}
          </>
        }
        description="Les sections affichées sous la bande-annonce, dans l’ordre."
        actions={
          <>
            <AccessButton access={access} serviceLabel={connector.label} />
            {manualUrl ? (
              <Button asChild size="sm" variant="ghost" className="gap-1.5">
                <a href={manualUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Ouvrir {connector.label}
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" className="gap-1.5" loading={sections.status === "loading"} onClick={() => void load()}>
              <RefreshCw />
              Relire
            </Button>
          </>
        }
      />

      {sections.status === "loading" ? (
        <PanelRows aria-hidden>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex min-w-0 items-center gap-3 px-4 py-3">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </PanelRows>
      ) : sections.status === "error" ? (
        <PanelBody>
          <ReadError message={sections.error} onRetry={() => void load()} />
        </PanelBody>
      ) : list.length === 0 ? (
        <Empty className="gap-4 p-6 md:p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutList />
            </EmptyMedia>
            <EmptyTitle className="text-base">Aucune section</EmptyTitle>
            <EmptyDescription>La page d’accueil ne montre que la bande-annonce.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="min-w-0 divide-y">
          <AnimatePresence initial={false}>
            {list.map((section, index) => {
              const detail = describe(section);
              const label = support.labels[section.type] ?? section.type;
              return (
                <motion.li
                  key={section.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex min-w-0 items-center gap-3 overflow-hidden px-4 py-2.5"
                >
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium" title={label}>
                      <span className="sr-only">{index + 1}. </span>
                      {label}
                    </span>
                    {detail ? (
                      <span className="truncate text-xs text-muted-foreground" title={detail}>
                        {detail}
                      </span>
                    ) : null}
                    <ActionStatus state={applyStatusOf(section.id)} />
                  </span>
                  {canEdit ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      {busy === section.id ? <Spinner className="mr-1 size-4 text-muted-foreground" /> : null}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Monter « ${label} »`}
                        disabled={busy !== null || index === 0}
                        onClick={() => void apply(section.id, () => moveSectionAction(account.id, section.id, list[index - 1].position))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Descendre « ${label} »`}
                        disabled={busy !== null || index === list.length - 1}
                        onClick={() => void apply(section.id, () => moveSectionAction(account.id, section.id, list[index + 1].position))}
                      >
                        <ArrowDown />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Retirer « ${label} »`} className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => setRemoving(section)}>
                        <Trash2 />
                      </Button>
                    </span>
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}

      {canEdit && sections.status === "ready" ? (
        <PanelFooter className="py-3">
          {full ? (
            <span className="text-pretty">
              {support.maxSections} sections au plus chez {connector.label} : retirez-en une pour en ajouter une autre.
            </span>
          ) : (
            <div className="grid w-full min-w-0 gap-2 text-foreground @xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] @xl:items-center">
              <Select value={addType} onValueChange={setAddType}>
                <SelectTrigger size="sm" className="w-full min-w-0 bg-background" aria-label="Type de section à ajouter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {support.types.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type?.needsPlaylist ? (
                <Select value={addPlaylist || undefined} onValueChange={setAddPlaylist} disabled={playlistList.length === 0}>
                  <SelectTrigger size="sm" className="w-full min-w-0 bg-background" aria-label="Playlist">
                    <SelectValue placeholder={playlists?.status === "loading" ? "Lecture des playlists…" : playlistList.length === 0 ? "Aucune playlist" : "Choisir une playlist"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {playlistList.map((playlist) => (
                      <SelectItem key={playlist.id} value={playlist.id} disabled={playlist.privacy === "private"}>
                        <span className="truncate">
                          {playlist.title}
                          {playlist.privacy === "private" ? " (privée)" : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="hidden @xl:block" />
              )}
              <Button
                size="sm"
                className="gap-1.5"
                loading={busy === "add"}
                disabled={busy !== null || !type || (type.needsPlaylist && !addPlaylist)}
                onClick={() => void apply("add", () => addSectionAction(account.id, { type: addType, ...(type?.needsPlaylist ? { playlistId: addPlaylist } : {}) }))}
              >
                <Plus />
                Ajouter la section
              </Button>
            </div>
          )}
          {/* Rendu seulement s'il y a un message : vide, il ajouterait un écart. */}
          {applyStatusOf("add") ? <ActionStatus state={applyStatusOf("add")} className="basis-full" /> : null}
        </PanelFooter>
      ) : null}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette section ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {removing ? (support.labels[removing.type] ?? removing.type) : ""} » disparaît de la page d’accueil chez {connector.label}. Les vidéos et les playlists restent en ligne.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const section = removing;
                setRemoving(null);
                if (section) void apply(section.id, () => removeSectionAction(account.id, section.id));
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

// ─── Playlists ────────────────────────────────────────────────────

function Playlists({
  account,
  connector,
  access,
  playlists,
  onReload,
  onChanged,
}: {
  account: AccountSummary;
  connector: ConnectorView;
  access: FieldAccess;
  playlists: LoadState<PlaylistSummary[]> | null;
  onReload: () => void;
  onChanged: (next: LoadState<PlaylistSummary[]>) => void;
}) {
  const support = connector.playlists!;
  const [editing, setEditing] = useState<PlaylistSummary | "new" | null>(null);
  const canEdit = access.state === "ok";
  const canListVideos = account.capabilities.includes("posts.list");
  const list = playlists?.status === "ready" ? playlists.data : [];

  const saved = (playlist: PlaylistSummary, created: boolean) => {
    const next = created ? [playlist, ...list] : list.map((entry) => (entry.id === playlist.id ? playlist : entry));
    onChanged({ status: "ready", data: next });
  };

  return (
    <Panel id={PLAYLISTS_PANEL_ID} aria-labelledby={`${PLAYLISTS_PANEL_ID}-title`} className="scroll-mt-4">
      <PanelHeader
        icon={ListVideo}
        titleId={`${PLAYLISTS_PANEL_ID}-title`}
        title={
          <>
            Playlists
            {playlists?.status === "ready" ? <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{list.length}</span> : null}
          </>
        }
        description="Créer, renommer, décrire, régler la visibilité et ajouter des vidéos."
        actions={
          <>
            <AccessButton access={access} serviceLabel={connector.label} />
            <Button size="sm" variant="ghost" className="gap-1.5" loading={playlists?.status === "loading"} onClick={onReload}>
              <RefreshCw />
              Relire
            </Button>
            {canEdit ? (
              <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
                <Plus />
                Nouvelle playlist
              </Button>
            ) : null}
          </>
        }
      />

      {!playlists || playlists.status === "loading" ? (
        <PanelRows aria-hidden>
          {[0, 1].map((index) => (
            <div key={index} className="flex min-w-0 items-center gap-3 px-4 py-3">
              <Skeleton className="aspect-video w-20 shrink-0 rounded-sm" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </PanelRows>
      ) : playlists.status === "error" ? (
        <PanelBody>
          <ReadError message={playlists.error} onRetry={onReload} />
        </PanelBody>
      ) : list.length === 0 ? (
        <Empty className="gap-4 p-6 md:p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListVideo />
            </EmptyMedia>
            <EmptyTitle className="text-base">Aucune playlist</EmptyTitle>
            <EmptyDescription>Ce compte n’a encore aucune playlist.</EmptyDescription>
          </EmptyHeader>
          {canEdit ? (
            <EmptyContent>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing("new")}>
                <Plus />
                Créer une playlist
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ul className="min-w-0 divide-y">
          <AnimatePresence initial={false}>
            {list.map((playlist) => {
              const privacy = PRIVACY[playlist.privacy];
              return (
                <motion.li
                  key={playlist.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex min-w-0 items-center gap-3 overflow-hidden px-4 py-3"
                >
                  {playlist.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniature servie par le service
                    <img src={playlist.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="aspect-video w-16 max-w-full shrink-0 rounded-sm bg-muted object-cover sm:w-20" />
                  ) : (
                    <span className="flex aspect-video w-16 shrink-0 items-center justify-center rounded-sm bg-muted sm:w-20">
                      <ListVideo className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium" title={playlist.title}>
                      {playlist.title || "Sans titre"}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <privacy.icon className="size-3" aria-hidden />
                        {privacy.label}
                      </span>
                      {playlist.itemCount !== undefined ? (
                        <span className="tabular-nums">
                          {playlist.itemCount}&nbsp;vidéo{playlist.itemCount > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {canEdit && support.addVideo && canListVideos ? <AddVideoButton accountId={account.id} playlist={playlist} onAdded={onReload} /> : null}
                    {canEdit ? (
                      <Button size="icon-sm" variant="ghost" aria-label={`Modifier « ${playlist.title} »`} onClick={() => setEditing(playlist)}>
                        <PencilLine />
                      </Button>
                    ) : null}
                    <Button asChild size="icon-sm" variant="ghost" aria-label={`Voir « ${playlist.title} » sur ${connector.label}`}>
                      <a href={playlist.url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink />
                      </a>
                    </Button>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <PlaylistDialog
        accountId={account.id}
        playlist={editing}
        limits={support}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(playlist, created) => {
          setEditing(null);
          saved(playlist, created);
        }}
      />
    </Panel>
  );
}

/** Ajoute une vidéo du compte à une playlist : recherche parmi les derniers envois. */
function AddVideoButton({ accountId, playlist, onAdded }: { accountId: string; playlist: PlaylistSummary; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<LoadState<PostSummary[]> | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // Un échec s'affiche dans la liste, qui reste ouverte ; une réussite la
  // ferme et le compteur de la playlist augmente.
  const feedback = useFeedback();

  const load = async () => {
    setVideos({ status: "loading" });
    const result = await listPostsAction(accountId);
    setVideos(result.ok ? { status: "ready", data: result.data.posts } : { status: "error", error: result.error });
  };

  const add = async (video: PostSummary) => {
    setAdding(video.id);
    feedback.clear();
    const result = await addPlaylistVideoAction(accountId, playlist.id, video.id);
    setAdding(null);
    if (!result.ok) return void feedback.error(result.error);
    setOpen(false);
    onAdded();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) feedback.clear();
        if (next && !videos) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Ajouter une vidéo à « ${playlist.title} »`}>
          <ListPlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Chercher une vidéo…" />
          <FormStatus state={feedback.state} className="px-2 pt-2" />
          <CommandList className="max-h-72">
            {!videos || videos.status === "loading" ? (
              <div className="grid gap-2 p-2" aria-hidden>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : videos.status === "error" ? (
              <p className="p-3 text-sm text-destructive">{videos.error}</p>
            ) : (
              <>
                <CommandEmpty>Aucune vidéo.</CommandEmpty>
                <CommandGroup>
                  {videos.data.map((video) => (
                    <CommandItem key={video.id} value={video.id} keywords={[video.title]} disabled={adding !== null} onSelect={() => void add(video)} className="min-w-0 gap-2">
                      {adding === video.id ? <Spinner className="size-4 shrink-0" /> : <Check className="size-4 shrink-0 opacity-0" />}
                      {video.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniature servie par le service
                        <img src={video.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="aspect-video w-16 shrink-0 rounded-sm bg-muted object-cover" />
                      ) : null}
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate" title={video.title}>
                          {video.title || video.id}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{PRIVACY[video.privacy].label}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PlaylistDialog({
  accountId,
  playlist,
  limits,
  onOpenChange,
  onSaved,
}: {
  accountId: string;
  playlist: PlaylistSummary | "new" | null;
  limits: { titleMax: number; descriptionMax: number };
  onOpenChange: (open: boolean) => void;
  onSaved: (playlist: PlaylistSummary, created: boolean) => void;
}) {
  const creating = playlist === "new";
  const [input, setInput] = useState<PlaylistInput>({ title: "", description: "", privacy: "private" });
  const [busy, setBusy] = useState(false);
  // L'erreur s'affiche dans la fenêtre ; une réussite la ferme et la
  // playlist apparaît (ou change) dans la liste.
  const feedback = useFeedback();
  const { clear } = feedback;

  useEffect(() => {
    if (playlist === null) return;
    setInput(playlist === "new" ? { title: "", description: "", privacy: "private" } : { title: playlist.title, description: playlist.description, privacy: playlist.privacy });
    clear();
  }, [playlist, clear]);

  const tooLong = Array.from(input.title).length > limits.titleMax || Array.from(input.description).length > limits.descriptionMax;

  const submit = async () => {
    if (playlist === null) return;
    setBusy(true);
    feedback.clear();
    const result =
      playlist === "new"
        ? await createPlaylistAction(accountId, input)
        : await updatePlaylistAction(accountId, playlist.id, {
            ...(input.title !== playlist.title ? { title: input.title } : {}),
            ...(input.description !== playlist.description ? { description: input.description } : {}),
            ...(input.privacy !== playlist.privacy ? { privacy: input.privacy } : {}),
          });
    setBusy(false);
    if (!result.ok) return void feedback.error(result.error);
    onSaved(result.data, creating);
  };

  const unchanged = playlist !== null && playlist !== "new" && input.title === playlist.title && input.description === playlist.description && input.privacy === playlist.privacy;

  return (
    <Dialog open={playlist !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{creating ? "Nouvelle playlist" : "Modifier la playlist"}</DialogTitle>
          <DialogDescription>Envoyé tout de suite chez le service.</DialogDescription>
        </DialogHeader>
        <form
          id="playlist-form"
          className="grid min-w-0 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          // Corriger la saisie retire le message d'erreur.
          onChange={feedback.state ? feedback.clear : undefined}
        >
          <div className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <label htmlFor="playlist-title" className="text-xs font-medium">
                Titre
              </label>
              <CharacterCount value={input.title} max={limits.titleMax} />
            </div>
            <Input id="playlist-title" value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} autoFocus className="min-w-0" />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <label htmlFor="playlist-description" className="text-xs font-medium">
                Description
              </label>
              <CharacterCount value={input.description} max={limits.descriptionMax} />
            </div>
            <Textarea id="playlist-description" rows={4} value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} className="max-h-72 min-w-0" />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <span className="text-xs font-medium">Visibilité</span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={input.privacy}
              onValueChange={(value) => value && setInput({ ...input, privacy: value as PostPrivacy })}
              className="w-full flex-wrap"
            >
              {(Object.keys(PRIVACY) as PostPrivacy[]).map((value) => {
                const Icon = PRIVACY[value].icon;
                return (
                  <ToggleGroupItem key={value} value={value} className="min-w-max flex-1 gap-1.5">
                    <Icon aria-hidden className="size-4" />
                    {PRIVACY[value].label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
          {/* Enveloppe toujours présente : sa marge négative compense l'écart
              de la grille, et l'espacement s'ouvre avec le message. */}
          <div className="-mt-4">
            <FormStatus state={feedback.state} className="pt-4" />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="playlist-form" loading={busy} disabled={!input.title.trim() || tooLong || unchanged} className="gap-2">
            {creating ? "Créer" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
