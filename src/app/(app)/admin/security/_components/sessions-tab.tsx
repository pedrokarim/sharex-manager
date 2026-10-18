"use client";

/**
 * Onglet Sessions : toutes les sessions ouvertes de l'instance, en tableau
 * filtrable par compte et par recherche, chacune révocable sur sa ligne ;
 * filtrées sur un compte, elles se ferment toutes d'un geste. À côté, la
 * durée des sessions, lue par better-auth au démarrage du serveur.
 */

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronsUpDown, LogOut, MonitorSmartphone, RefreshCw, Search, Timer, UsersRound, X } from "lucide-react";
import { ActionStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Panel, PanelHeader, PanelRows } from "@/components/connections/panel";
import { RelativeTime, formatDateTime } from "@/components/connections/shared";
import { CurrentSessionPill, DeviceLabel, IpText } from "@/components/security/session-bits";
import { cn } from "@/lib/utils";
import { requestJson, type SessionEntry } from "./api";
import { useSessions, useSettings } from "./data";
import { useSectionForm } from "./settings-form";
import { PAGE_SIZE, Pager, PanelError, RowsSkeleton, SettingRow, SettingsFooter, SettingsSkeleton, StopsSlider, UserAvatar, clampPage, daysLabel, hoursLabel } from "./shared";

const MotionRow = motion.create(TableRow);

export function SessionsTab() {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <SessionsPanel />
      <aside aria-label="Durée des sessions" className="min-w-0 xl:sticky xl:top-4">
        <SessionSettingsPanel />
      </aside>
    </div>
  );
}

// ─── Tableau des sessions ─────────────────────────────────────────

interface AccountOption {
  id: string;
  username: string;
  admin: boolean;
  count: number;
}

/** Comptes qui ont au moins une session, du plus de sessions au moins. */
export function sessionAccounts(sessions: SessionEntry[]): AccountOption[] {
  const byId = new Map<string, AccountOption>();
  for (const session of sessions) {
    const entry = byId.get(session.userId) ?? { id: session.userId, username: session.user?.username ?? "Compte supprimé", admin: session.user?.role === "admin", count: 0 };
    entry.count += 1;
    byId.set(session.userId, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.username.localeCompare(b.username, "fr"));
}

function SessionsPanel() {
  const titleId = useId();
  const sessions = useSessions();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rowFeedback = useFeedback();
  const [rowFeedbackId, setRowFeedbackId] = useState<string | null>(null);
  const bulkFeedback = useFeedback({ successDuration: 5000 });

  const list = useMemo(() => (sessions.state.status === "ready" ? sessions.state.data : []), [sessions.state]);
  const accounts = useMemo(() => sessionAccounts(list), [list]);
  const account = accounts.find((entry) => entry.id === accountId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return list.filter((session) => {
      if (accountId && session.userId !== accountId) return false;
      if (!needle) return true;
      return `${session.user?.username ?? ""} ${session.device.label} ${session.ip ?? ""}`.toLocaleLowerCase("fr").includes(needle);
    });
  }, [list, accountId, query]);
  const current = clampPage(page, filtered.length);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const chooseAccount = (id: string | null) => {
    setAccountId(id);
    setPage(0);
    bulkFeedback.clear();
  };

  const refresh = async () => {
    setRefreshing(true);
    await sessions.reload();
    setRefreshing(false);
  };

  const revoke = async (session: SessionEntry) => {
    setBusy(session.id);
    setRowFeedbackId(session.id);
    rowFeedback.clear();
    try {
      await requestJson(`/api/admin/security/sessions?id=${encodeURIComponent(session.id)}`, { method: "DELETE" });
      sessions.mutate((current) => current.filter((entry) => entry.id !== session.id));
    } catch (error) {
      rowFeedback.error(errorMessage(error, "La session n’a pas pu être fermée."));
    } finally {
      setBusy(null);
    }
  };

  const revokeAll = async () => {
    if (!account) return;
    setBusy("all");
    bulkFeedback.clear();
    try {
      const { revoked } = await requestJson<{ revoked: number }>(`/api/admin/security/sessions?userId=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      sessions.mutate((current) => current.filter((entry) => entry.userId !== account.id || entry.current));
      bulkFeedback.success(revoked ? `${revoked} session${revoked > 1 ? "s" : ""} fermée${revoked > 1 ? "s" : ""}` : "Aucune session à fermer");
    } catch (error) {
      bulkFeedback.error(errorMessage(error, "Les sessions n’ont pas pu être fermées."));
    } finally {
      setBusy(null);
    }
  };

  const closable = account ? list.filter((session) => session.userId === account.id && !session.current).length : 0;

  return (
    <Panel aria-labelledby={titleId} className="@container">
      <PanelHeader
        icon={MonitorSmartphone}
        title="Sessions ouvertes"
        titleId={titleId}
        description={
          sessions.state.status === "ready"
            ? `${list.length} session${list.length > 1 ? "s" : ""} sur ${accounts.length} compte${accounts.length > 1 ? "s" : ""}, de la plus récemment active à la plus ancienne.`
            : "Chaque appareil connecté à un compte de l’instance."
        }
        actions={
          <Button variant="outline" size="sm" className="gap-2" loading={refreshing} onClick={() => void refresh()}>
            <RefreshCw aria-hidden className="size-4" />
            Actualiser
          </Button>
        }
      />

      {sessions.state.status === "loading" ? (
        <RowsSkeleton rows={5} />
      ) : sessions.state.status === "error" ? (
        <PanelError message={sessions.state.error} onRetry={() => void sessions.reload()} />
      ) : list.length === 0 ? (
        <Empty className="p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MonitorSmartphone />
            </EmptyMedia>
            <EmptyTitle className="text-base">Aucune session ouverte</EmptyTitle>
            <EmptyDescription className="text-xs">Chaque connexion à un compte ouvre une session, qui s’affiche ici jusqu’à son expiration.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b px-4 py-3">
            <AccountFilter accounts={accounts} value={account} onChange={chooseAccount} />
            <InputGroup className="h-8 w-full min-w-0 @md:w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder="Appareil, adresse IP"
                aria-label="Chercher une session"
                className="h-8"
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <Button variant="ghost" size="icon" className="size-6" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                    <X className="size-3.5" />
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            {account ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 @2xl:ml-auto">
                <ActionStatus state={bulkFeedback.state} />
                <ConfirmButton
                  label="Fermer toutes ses sessions"
                  title={`Fermer les sessions de ${account.username} ?`}
                  description={
                    list.some((session) => session.userId === account.id && session.current)
                      ? "Tous ses appareils devront se reconnecter. Cette session-ci reste ouverte."
                      : "Tous ses appareils devront se reconnecter."
                  }
                  confirm="Fermer"
                  busy={busy === "all"}
                  disabled={busy !== null || closable === 0}
                  onConfirm={() => void revokeAll()}
                  icon={LogOut}
                  variant="outline"
                />
              </div>
            ) : null}
          </div>

          <TooltipProvider delayDuration={150}>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Compte</TableHead>
                  <TableHead className="hidden w-44 @lg:table-cell">Appareil</TableHead>
                  <TableHead className="hidden w-28 @md:table-cell">Activité</TableHead>
                  <TableHead className="hidden w-24 @2xl:table-cell">Ouverte le</TableHead>
                  <TableHead className="hidden w-24 @2xl:table-cell">Expire</TableHead>
                  <TableHead className="w-14 pr-3 @md:w-28">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody key={`${accountId}-${current}`}>
                {shown.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                      Aucune session ne correspond.{" "}
                      <button
                        type="button"
                        className="underline underline-offset-4 hover:text-foreground"
                        onClick={() => {
                          setQuery("");
                          chooseAccount(null);
                        }}
                      >
                        Tout afficher
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence initial={false}>
                    {shown.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        busy={busy === session.id}
                        disabled={busy !== null}
                        status={rowFeedbackId === session.id ? rowFeedback.state : null}
                        onRevoke={() => void revoke(session)}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
          <Pager page={current} total={filtered.length} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

function AccountFilter({ accounts, value, onChange }: { accounts: AccountOption[]; value: AccountOption | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const choose = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label="Filtrer par compte" className="h-8 w-full max-w-full min-w-0 justify-between gap-2 @md:w-56">
          <span className="flex min-w-0 items-center gap-2">
            {value ? <UserAvatar name={value.username} admin={value.admin} className="size-5" /> : <UsersRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 truncate" title={value?.username}>
              {value ? value.username : "Tous les comptes"}
            </span>
          </span>
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Chercher un compte" className="h-9" />
          <CommandList>
            <CommandEmpty>Aucun compte.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all" onSelect={() => choose(null)} className="gap-2">
                <UsersRound aria-hidden className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Tous les comptes</span>
                {value === null ? <Check aria-hidden className="size-4" /> : null}
              </CommandItem>
              {accounts.map((entry) => (
                <CommandItem key={entry.id} value={`${entry.username} ${entry.id}`} onSelect={() => choose(entry.id)} className="gap-2">
                  <UserAvatar name={entry.username} admin={entry.admin} className="size-5" />
                  <span className="min-w-0 flex-1 truncate" title={entry.username}>
                    {entry.username}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{entry.count}</span>
                  {value?.id === entry.id ? <Check aria-hidden className="size-4 shrink-0" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SessionRow({
  session,
  busy,
  disabled,
  status,
  onRevoke,
}: {
  session: SessionEntry;
  busy: boolean;
  disabled: boolean;
  status: FeedbackState | null;
  onRevoke: () => void;
}) {
  const username = session.user?.username ?? "Compte supprimé";
  return (
    <MotionRow layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
      <TableCell className="py-3 pl-4 align-top whitespace-normal">
        <div className="flex min-w-0 items-start gap-2.5">
          <UserAvatar name={username} admin={session.user?.role === "admin"} className="mt-0.5" />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate text-sm font-medium" title={username}>
                {username}
              </span>
              {session.current ? <CurrentSessionPill /> : null}
            </span>
            <span className="text-xs text-muted-foreground">{session.user?.role === "admin" ? "Administrateur" : "Utilisateur"}</span>
            {/* Ce que les colonnes masquées ne montrent plus, sous le compte. */}
            <span className="grid min-w-0 gap-0.5 pt-1 text-xs text-muted-foreground @lg:hidden">
              <span className="min-w-0 truncate" title={session.device.label}>
                {session.device.label}
              </span>
              <IpText ip={session.ip} />
              <RelativeTime value={session.lastActiveAt} prefix="Active " className="@md:hidden" />
            </span>
            {status ? <ActionStatus state={status} /> : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden py-3 align-top @lg:table-cell">
        <div className="grid min-w-0 gap-1">
          <DeviceLabel device={session.device} />
          <IpText ip={session.ip} className="pl-9 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="hidden py-3 align-top @md:table-cell">
        <RelativeTime value={session.lastActiveAt} className="mt-1 block truncate text-xs" />
      </TableCell>
      <TableCell className="hidden py-3 align-top @2xl:table-cell">
        <span className="mt-1 block truncate text-xs text-muted-foreground" title={formatDateTime(session.createdAt)}>
          {new Date(session.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </TableCell>
      <TableCell className="hidden py-3 align-top @2xl:table-cell">
        <RelativeTime value={session.expiresAt} className="mt-1 block truncate text-xs text-muted-foreground" />
      </TableCell>
      <TableCell className="py-2.5 pr-3 pl-0 align-top">
        <div className="flex justify-end">
          {session.current ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="mt-1 inline-flex items-center rounded-md px-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <span className="hidden @md:inline">Protégée</span>
                  <span className="@md:hidden" aria-label="Session protégée">
                    –
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">C’est la session de cet écran : pour la fermer, déconnectez-vous.</TooltipContent>
            </Tooltip>
          ) : (
            <ConfirmButton
              label="Révoquer"
              title="Fermer cette session ?"
              description={`${session.device.label}${session.ip ? `, ${session.ip}` : ""} devra se reconnecter.`}
              confirm="Révoquer"
              busy={busy}
              disabled={disabled}
              onConfirm={onRevoke}
              icon={LogOut}
              compact
            />
          )}
        </div>
      </TableCell>
    </MotionRow>
  );
}

/**
 * Bouton d'un geste qui ferme quelque chose : il ouvre une petite bulle de
 * confirmation sous lui plutôt qu'une fenêtre, le geste reste à sa place.
 */
export function ConfirmButton({
  label,
  title,
  description,
  confirm,
  busy,
  disabled,
  onConfirm,
  icon: Icon,
  variant = "ghost",
  compact,
}: {
  label: string;
  title: string;
  description: string;
  confirm: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  icon: typeof LogOut;
  variant?: "ghost" | "outline";
  /** Sur un écran étroit, l'icône seule (le libellé reste lu). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className={cn("h-7 gap-1.5 px-2 text-xs", variant === "ghost" && "text-muted-foreground hover:text-red-700 dark:hover:text-red-400")}
          loading={busy}
          disabled={disabled && !busy}
          aria-label={label}
        >
          <Icon aria-hidden className="size-3.5" />
          <span className={cn(compact && "hidden @md:inline")}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-3 p-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">{title}</p>
          <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirm}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Durée des sessions ───────────────────────────────────────────

const AGE_STOPS = [1, 7, 14, 30] as const;
const REFRESH_STOPS = [1, 12, 24] as const;

/** Le renouvellement doit tomber avant la fin de la session (même règle que le serveur). */
export function sessionsError(value: { maxAgeDays: number; refreshHours: number }): string | null {
  return value.refreshHours >= value.maxAgeDays * 24 ? "Le renouvellement doit être plus court que la durée de la session." : null;
}

function SessionSettingsPanel() {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("sessions", settings);
  const value = form.value;
  const error = value ? sessionsError(value) : null;
  const restart = settings.state.status === "ready" && settings.state.data.restartRequired.includes("sessions");

  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={Timer} title="Durée des sessions" titleId={titleId} description="Combien de temps un appareil reste connecté sans se reconnecter." />
      {settings.state.status === "error" ? (
        <PanelError message={settings.state.error} onRetry={() => void settings.reload()} />
      ) : !value ? (
        <SettingsSkeleton rows={2} />
      ) : (
        <PanelRows>
          <SettingRow id="session-age" label="Durée d’une session" value={daysLabel(value.maxAgeDays)} description="Une session inutilisée pendant ce délai se ferme.">
            <StopsSlider stops={AGE_STOPS} value={value.maxAgeDays} onChange={(maxAgeDays) => form.update({ maxAgeDays })} format={(days) => `${days} j`} label="Durée d’une session" disabled={form.saving} />
          </SettingRow>
          <SettingRow
            id="session-refresh"
            label="Prolongée toutes les"
            value={hoursLabel(value.refreshHours)}
            description="Une session utilisée repart pour une durée complète, au plus une fois par intervalle."
            error={error}
          >
            <StopsSlider stops={REFRESH_STOPS} value={value.refreshHours} onChange={(refreshHours) => form.update({ refreshHours })} format={(hours) => `${hours} h`} label="Prolongée toutes les" disabled={form.saving} />
          </SettingRow>
        </PanelRows>
      )}
      <SettingsFooter form={form} blocked={Boolean(error)} note={restart ? "S’applique au prochain redémarrage du serveur." : null} />
    </Panel>
  );
}
