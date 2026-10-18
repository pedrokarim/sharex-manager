"use client";

/**
 * Onglet Clés API : toutes les clés de l'instance, en tableau filtrable
 * (actives, sans expiration, inutilisées, expirées, orphelines), avec ce
 * qu'elles ont envoyé dans la dernière heure face à la limite. Une ligne
 * s'ouvre dans un tiroir de détail, d'où la clé se révoque. À côté, les
 * règles des nouvelles clés.
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, CalendarClock, ChevronRight, KeyRound, RefreshCw, Search, ShieldAlert, X, type LucideIcon } from "lucide-react";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { BoundedNumberControl } from "@/components/ui/bounded-number-control";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Panel, PanelHeader, PanelRows } from "@/components/connections/panel";
import { RelativeTime, formatDateTime, formatRelative } from "@/components/connections/shared";
import { cn } from "@/lib/utils";
import { requestJson, type ApiKeyEntry, type SettingsPayload } from "./api";
import { useApiKeys, useSettings } from "./data";
import { useSectionForm } from "./settings-form";
import { PAGE_SIZE, Pager, PanelError, RowsSkeleton, SettingRow, SettingsFooter, SettingsSkeleton, UserAvatar, clampPage, daysLabel } from "./shared";

const MotionRow = motion.create(TableRow);
const DAY_MS = 86_400_000;
export const INACTIVE_DAYS = 90;

export type KeyFilter = "all" | "active" | "no-expiry" | "inactive" | "expired" | "orphan";

const FILTERS: [KeyFilter, string][] = [
  ["all", "Toutes"],
  ["active", "Actives"],
  ["no-expiry", "Sans expiration"],
  ["inactive", `Inactives depuis ${INACTIVE_DAYS} jours`],
  ["expired", "Expirées"],
  ["orphan", "Orphelines"],
];

/** Filtres auxquels une clé appartient (« Toutes » mis à part). */
export function keyFilters(key: ApiKeyEntry, now = Date.now()): Set<Exclude<KeyFilter, "all">> {
  const filters = new Set<Exclude<KeyFilter, "all">>();
  if (key.status === "active") filters.add("active");
  if (key.status === "expired") filters.add("expired");
  if (key.status === "orphan") filters.add("orphan");
  if (!key.expiresAt) filters.add("no-expiry");
  const lastSeen = new Date(key.lastUsedAt ?? key.createdAt).getTime();
  if (key.status !== "expired" && now - lastSeen > INACTIVE_DAYS * DAY_MS) filters.add("inactive");
  return filters;
}

const PERMISSIONS: [string, string][] = [
  ["uploadImages", "Images"],
  ["uploadText", "Texte"],
  ["uploadFiles", "Fichiers"],
  ["extractColors", "Couleurs"],
];

/** Droits d'une clé en libellés courts, quelle que soit la forme reçue. */
export function permissionLabels(permissions: ApiKeyEntry["permissions"]): string[] {
  if (Array.isArray(permissions)) return permissions.map((name) => PERMISSIONS.find(([key]) => key === name)?.[1] ?? name);
  return PERMISSIONS.filter(([key]) => permissions?.[key]).map(([, label]) => label);
}

/** Limite réelle par clé : celle du niveau de débit, resserrée par la règle des clés (comme `getRateLimits`). */
export function effectiveUploadLimit(payload: Pick<SettingsPayload, "settings" | "rateLimitPresets">): number {
  const preset = payload.rateLimitPresets[payload.settings.rateLimits.level]?.uploadsPerKeyPerHour ?? Infinity;
  return Math.min(preset, payload.settings.apiKeys.uploadsPerHour);
}

export function ApiKeysTab() {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <KeysPanel />
      <aside aria-label="Règles des clés" className="min-w-0 xl:sticky xl:top-4">
        <KeySettingsPanel />
      </aside>
    </div>
  );
}

// ─── Tableau des clés ─────────────────────────────────────────────

function KeysPanel() {
  const titleId = useId();
  const keys = useApiKeys();
  const settings = useSettings();
  const [filter, setFilter] = useState<KeyFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const limit = settings.state.status === "ready" ? effectiveUploadLimit(settings.state.data) : null;

  const list = useMemo(() => (keys.state.status === "ready" ? keys.state.data : []), [keys.state]);
  const flags = useMemo(() => new Map(list.map((key) => [key.id, keyFilters(key)])), [list]);
  const counts = useMemo(() => {
    const result: Record<KeyFilter, number> = { all: list.length, active: 0, "no-expiry": 0, inactive: 0, expired: 0, orphan: 0 };
    for (const set of flags.values()) for (const entry of set) result[entry] += 1;
    return result;
  }, [list, flags]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return list
      .filter((key) => filter === "all" || flags.get(key.id)?.has(filter))
      .filter((key) => !needle || `${key.name} ${key.prefix} ${key.owner?.username ?? ""}`.toLocaleLowerCase("fr").includes(needle))
      .sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));
  }, [list, flags, filter, query]);
  const current = clampPage(page, filtered.length);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const opened = list.find((key) => key.id === openId) ?? null;

  const changeFilter = (next: KeyFilter) => {
    setFilter(next);
    setPage(0);
  };

  const refresh = async () => {
    setRefreshing(true);
    await keys.reload();
    setRefreshing(false);
  };

  return (
    <Panel aria-labelledby={titleId} className="@container">
      <PanelHeader
        icon={KeyRound}
        title="Clés API"
        titleId={titleId}
        description={
          keys.state.status === "ready"
            ? `${list.length} clé${list.length > 1 ? "s" : ""} sur l’instance, de la plus récemment utilisée à la plus ancienne.`
            : "Les accès de ShareX, de l’application mobile et des scripts."
        }
        actions={
          <Button variant="outline" size="sm" className="gap-2" loading={refreshing} onClick={() => void refresh()}>
            <RefreshCw aria-hidden className="size-4" />
            Actualiser
          </Button>
        }
      />

      {keys.state.status === "loading" ? (
        <RowsSkeleton rows={5} />
      ) : keys.state.status === "error" ? (
        <PanelError message={keys.state.error} onRetry={() => void keys.reload()} />
      ) : list.length === 0 ? (
        <Empty className="p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle className="text-base">Aucune clé API</EmptyTitle>
            <EmptyDescription className="text-xs">Chaque compte crée ses clés depuis « Clés API » dans ses réglages ; elles apparaissent toutes ici.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid min-w-0 gap-2 border-b px-4 py-3">
            <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => changeFilter((next || "all") as KeyFilter)} aria-label="Filtrer les clés" className="flex-wrap">
              {FILTERS.filter(([value]) => value === "all" || value === filter || counts[value] > 0).map(([value, label]) => (
                <ToggleGroupItem key={value} value={value} className="gap-1.5 px-2.5">
                  {label}
                  <span className="tabular-nums text-foreground/65">{counts[value]}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
                placeholder="Nom, préfixe, compte"
                aria-label="Chercher une clé"
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
          </div>

          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Clé</TableHead>
                <TableHead className="hidden w-36 @lg:table-cell">Propriétaire</TableHead>
                <TableHead className="hidden w-36 @4xl:table-cell">Droits</TableHead>
                <TableHead className="hidden w-28 @md:table-cell">Utilisée</TableHead>
                <TableHead className="hidden w-28 @2xl:table-cell">Expiration</TableHead>
                <TableHead className="hidden w-28 @xl:table-cell" title="Envois de la dernière heure, sur la limite par clé">Envois (1 h)</TableHead>
                <TableHead className="w-9 pr-3">
                  <span className="sr-only">Détail</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody key={`${filter}-${current}`}>
              {shown.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                    Aucune clé ne correspond.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-4 hover:text-foreground"
                      onClick={() => {
                        setQuery("");
                        changeFilter("all");
                      }}
                    >
                      Tout afficher
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence initial={false}>
                  {shown.map((key) => (
                    <KeyRow key={key.id} entry={key} limit={limit} onOpen={() => setOpenId(key.id)} />
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
          <Pager page={current} total={filtered.length} onPage={setPage} />
        </>
      )}

      <KeySheet
        entry={opened}
        limit={limit}
        onOpenChange={(open) => !open && setOpenId(null)}
        onRevoked={(id) => {
          setOpenId(null);
          keys.mutate((current) => current.filter((key) => key.id !== id));
        }}
      />
    </Panel>
  );
}

/** Expiration en clair, avec son ton : rouge si passée, ambre si absente ou proche. */
function expiryOf(key: ApiKeyEntry, now = Date.now()): { label: string; title: string; tone: string; icon?: LucideIcon } {
  if (!key.expiresAt) return { label: "Jamais", title: "Sans date d’expiration", tone: "text-amber-700 dark:text-amber-400", icon: ShieldAlert };
  const at = new Date(key.expiresAt).getTime();
  if (key.status === "expired" || at <= now) return { label: "Expirée", title: `Expirée le ${formatDateTime(key.expiresAt)}`, tone: "text-red-700 dark:text-red-400", icon: Ban };
  const soon = at - now < 7 * DAY_MS;
  return { label: formatRelative(key.expiresAt), title: `Le ${formatDateTime(key.expiresAt)}`, tone: soon ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground" };
}

function ExpiryText({ entry, className }: { entry: ApiKeyEntry; className?: string }) {
  const expiry = expiryOf(entry);
  const Icon = expiry.icon;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", expiry.tone, className)} title={expiry.title} suppressHydrationWarning>
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
      <span className="min-w-0 truncate" suppressHydrationWarning>
        {expiry.label}
      </span>
    </span>
  );
}

/** Envois de la dernière heure face à la limite par clé, en petite jauge. */
function UploadGauge({ used, limit, className }: { used: number; limit: number | null; className?: string }) {
  if (!limit) return <span className={cn("text-xs tabular-nums", className)}>{used.toLocaleString("fr-FR")}</span>;
  const share = Math.min(100, (used / limit) * 100);
  return (
    <div className={cn("grid min-w-0 gap-1", className)} title={`${used.toLocaleString("fr-FR")} envois sur ${limit.toLocaleString("fr-FR")} permis par heure`}>
      <span className="text-xs tabular-nums">
        <span className="font-medium">{used.toLocaleString("fr-FR")}</span>
        <span className="text-muted-foreground"> / {limit.toLocaleString("fr-FR")}</span>
      </span>
      <Progress
        value={share}
        aria-label="Envois de la dernière heure"
        className={cn("h-1.5 bg-muted", share >= 100 ? "*:data-[slot=progress-indicator]:bg-destructive" : share >= 80 ? "*:data-[slot=progress-indicator]:bg-amber-500" : "")}
      />
    </div>
  );
}

function OwnerText({ entry }: { entry: ApiKeyEntry }) {
  if (!entry.owner) return <span className="text-xs font-medium text-red-700 dark:text-red-400">Compte supprimé</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={entry.owner.username} className="size-6" />
      <span className="min-w-0 truncate text-sm" title={entry.owner.username}>
        {entry.owner.username}
      </span>
    </span>
  );
}

function PermissionChips({ entry }: { entry: ApiKeyEntry }) {
  const labels = permissionLabels(entry.permissions);
  if (!labels.length) return <span className="text-xs text-muted-foreground">Aucun droit</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {labels.map((label) => (
        <span key={label} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80">
          {label}
        </span>
      ))}
    </span>
  );
}

function KeyRow({ entry, limit, onOpen }: { entry: ApiKeyEntry; limit: number | null; onOpen: () => void }) {
  return (
    <MotionRow
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={onOpen}
      className={cn("cursor-pointer", entry.status === "expired" && "text-muted-foreground")}
    >
      <TableCell className="py-3 pl-4 align-top whitespace-normal">
        <div className="grid min-w-0 gap-0.5">
          {/* Le nom est le vrai bouton : la ligne entière se clique, le clavier passe par lui. */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="min-w-0 truncate text-left text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
            title={entry.name}
          >
            {entry.name}
          </button>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={`Préfixe ${entry.prefix}`}>
              {entry.prefix}…
            </span>
            {entry.status === "orphan" ? <span className="text-[11px] font-medium text-red-700 dark:text-red-400">Orpheline</span> : null}
          </span>
          {/* Ce que les colonnes masquées ne montrent plus, sous le nom. */}
          <div className="grid min-w-0 gap-1 pt-1 @2xl:hidden">
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground @lg:hidden">
              <span className="min-w-0 truncate" title={entry.owner?.username ?? "Compte supprimé"}>
                {entry.owner?.username ?? "Compte supprimé"}
              </span>
            </span>
            <ExpiryText entry={entry} />
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden py-3 align-top @lg:table-cell">
        <OwnerText entry={entry} />
      </TableCell>
      <TableCell className="hidden py-3 align-top whitespace-normal @4xl:table-cell">
        <PermissionChips entry={entry} />
      </TableCell>
      <TableCell className="hidden py-3 align-top @md:table-cell">
        {entry.lastUsedAt ? <RelativeTime value={entry.lastUsedAt} className="mt-0.5 block truncate text-xs" /> : <span className="mt-0.5 block text-xs text-muted-foreground">Jamais</span>}
      </TableCell>
      <TableCell className="hidden py-3 align-top @2xl:table-cell">
        <ExpiryText entry={entry} className="mt-0.5" />
      </TableCell>
      <TableCell className="hidden py-3 align-top @xl:table-cell">
        <UploadGauge used={entry.uploadsLastHour} limit={limit} />
      </TableCell>
      <TableCell className="py-3 pr-3 align-top">
        <ChevronRight className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
      </TableCell>
    </MotionRow>
  );
}

// ─── Tiroir de détail ─────────────────────────────────────────────

function KeySheet({
  entry,
  limit,
  onOpenChange,
  onRevoked,
}: {
  entry: ApiKeyEntry | null;
  limit: number | null;
  onOpenChange: (open: boolean) => void;
  onRevoked: (id: string) => void;
}) {
  // La dernière clé ouverte reste dessinée pendant la fermeture du tiroir.
  const [shown, setShown] = useState(entry);
  useEffect(() => {
    if (entry) setShown(entry);
  }, [entry]);
  const current = entry ?? shown;

  return (
    <Sheet open={Boolean(entry)} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full max-w-full gap-0 overflow-hidden p-0 sm:max-w-md">
        {current ? <KeyDetail key={current.id} entry={current} limit={limit} onClose={() => onOpenChange(false)} onRevoked={onRevoked} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function KeyDetail({ entry, limit, onClose, onRevoked }: { entry: ApiKeyEntry; limit: number | null; onClose: () => void; onRevoked: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const feedback = useFeedback();
  const created = formatDateTime(entry.createdAt);

  const revoke = async () => {
    setRevoking(true);
    feedback.clear();
    try {
      await requestJson(`/api/admin/security/api-keys?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      onRevoked(entry.id);
    } catch (error) {
      feedback.error(errorMessage(error, "La clé n’a pas pu être révoquée."));
      setRevoking(false);
    }
  };

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Propriétaire", value: <OwnerText entry={entry} /> },
    { label: "Préfixe", value: <span className="font-mono text-xs">{entry.prefix}…</span> },
    { label: "Créée", value: <span title={created}>{formatRelative(entry.createdAt)}</span> },
    { label: "Dernière utilisation", value: entry.lastUsedAt ? <RelativeTime value={entry.lastUsedAt} /> : <span className="text-muted-foreground">Jamais</span> },
    { label: "Expiration", value: <ExpiryText entry={entry} className="text-sm" /> },
    { label: "Droits", value: <PermissionChips entry={entry} /> },
    { label: "Envois, dernière heure", value: <UploadGauge used={entry.uploadsLastHour} limit={limit} className="max-w-48" /> },
  ];

  return (
    <>
      <SheetHeader className="gap-3 border-b px-5 pt-5 pb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div className="grid min-w-0 gap-1">
              <SheetTitle className="text-lg [overflow-wrap:anywhere]">{entry.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {entry.status === "expired" ? "Expirée : elle est déjà refusée." : entry.status === "orphan" ? "Son compte a été supprimé, mais elle fonctionne toujours." : "Active."}
              </SheetDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>
      </SheetHeader>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.label} className="grid min-w-0 grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 px-5 py-3 text-sm">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="flex items-start gap-2 px-5 py-4 text-xs text-pretty text-muted-foreground">
          <CalendarClock aria-hidden className="mt-px size-3.5 shrink-0" />
          La clé complète n’est jamais gardée par le serveur : seule son empreinte l’est, et ce préfixe sert à la reconnaître.
        </p>
      </div>

      <div className="grid min-w-0 gap-3 border-t bg-muted/30 px-5 py-4">
        <FormStatus state={feedback.state} />
        <AnimatePresence initial={false} mode="wait">
          {confirming ? (
            <motion.div key="confirm" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="grid min-w-0 gap-3">
              <p className="text-sm text-pretty">
                Révoquer « {entry.name} » ? Les envois qui l’utilisent seront refusés aussitôt.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={revoking} onClick={() => setConfirming(false)}>
                  Annuler
                </Button>
                <Button variant="destructive" size="sm" loading={revoking} onClick={() => void revoke()}>
                  Révoquer la clé
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5 text-red-700 hover:text-red-700 dark:text-red-400" onClick={() => setConfirming(true)}>
                <Ban aria-hidden className="size-4" />
                Révoquer…
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─── Règles des clés ──────────────────────────────────────────────

const EXPIRY_CHOICES: (number | null)[] = [30, 90, 365, null];

const choiceValue = (days: number | null) => (days === null ? "never" : String(days));
const choiceLabel = (days: number | null) => (days === null ? "Jamais" : days === 365 ? "1 an" : `${days} j`);

/** Durées proposées, plus la valeur enregistrée si elle n'en fait pas partie. */
function expiryChoices(current: number | null): (number | null)[] {
  if (EXPIRY_CHOICES.includes(current)) return EXPIRY_CHOICES;
  return [...EXPIRY_CHOICES.slice(0, -1), current, null].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
}

/** La durée par défaut doit exister et ne pas dépasser la maximale (même règle que le serveur). */
export function apiKeysError(value: { defaultExpiryDays: number | null; maxExpiryDays: number | null }): string | null {
  if (value.maxExpiryDays === null) return null;
  if (value.defaultExpiryDays === null) return "Avec une durée maximale, la durée par défaut ne peut pas être « Jamais ».";
  if (value.defaultExpiryDays > value.maxExpiryDays) return "La durée par défaut dépasse la durée maximale.";
  return null;
}

function ExpiryToggle({
  label,
  value,
  onChange,
  isDisabled,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  isDisabled?: (choice: number | null) => boolean;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={choiceValue(value)}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next === "never" ? null : Number(next));
      }}
      aria-label={label}
      className="w-full"
      disabled={disabled}
    >
      {expiryChoices(value).map((choice) => (
        <ToggleGroupItem key={choiceValue(choice)} value={choiceValue(choice)} disabled={isDisabled?.(choice)} className="min-w-0 flex-1 px-1.5 text-xs">
          {choiceLabel(choice)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** La règle des clés ne fait que resserrer la limite du niveau de débit : le dire avec le chiffre du niveau. */
function levelLimitNote(payload: SettingsPayload | null): string {
  if (!payload) return "Au-delà, les envois de la clé sont refusés jusqu’à l’heure suivante.";
  const preset = payload.rateLimitPresets[payload.settings.rateLimits.level].uploadsPerKeyPerHour;
  return `Au-delà, ses envois sont refusés pour l’heure. Le niveau de débit choisi dans Règles plafonne déjà à ${preset.toLocaleString("fr-FR")} : la plus basse des deux s’applique.`;
}

function KeySettingsPanel() {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("apiKeys", settings);
  const value = form.value;
  const error = value ? apiKeysError(value) : null;

  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={CalendarClock} title="Règles des clés" titleId={titleId} description="Pour les clés créées à partir de maintenant ; la limite d’envoi vaut pour toutes." />
      {settings.state.status === "error" ? (
        <PanelError message={settings.state.error} onRetry={() => void settings.reload()} />
      ) : !value ? (
        <SettingsSkeleton rows={3} />
      ) : (
        <PanelRows>
          <SettingRow
            id="keys-default"
            label="Durée par défaut"
            value={value.defaultExpiryDays === null ? "Jamais" : daysLabel(value.defaultExpiryDays)}
            description="Proposée à la création d’une clé."
            error={error}
          >
            <ExpiryToggle
              label="Durée par défaut"
              value={value.defaultExpiryDays}
              onChange={(defaultExpiryDays) => form.update({ defaultExpiryDays })}
              isDisabled={(choice) => value.maxExpiryDays !== null && (choice === null || choice > value.maxExpiryDays)}
              disabled={form.saving}
            />
          </SettingRow>
          <SettingRow
            id="keys-max"
            label="Durée maximale"
            value={value.maxExpiryDays === null ? "Aucune" : daysLabel(value.maxExpiryDays)}
            description="Aucune clé ne peut être créée pour plus longtemps."
          >
            <ExpiryToggle
              label="Durée maximale"
              value={value.maxExpiryDays}
              onChange={(maxExpiryDays) =>
                // Une maximale plus courte ramène la durée par défaut avec elle.
                form.update({
                  maxExpiryDays,
                  defaultExpiryDays:
                    maxExpiryDays !== null && (value.defaultExpiryDays === null || value.defaultExpiryDays > maxExpiryDays) ? maxExpiryDays : value.defaultExpiryDays,
                })
              }
              disabled={form.saving}
            />
          </SettingRow>
          <SettingRow id="keys-rate" label="Envois par heure" value={`${value.uploadsPerHour.toLocaleString("fr-FR")} par clé`} description={levelLimitNote(settings.state.status === "ready" ? settings.state.data : null)}>
            <BoundedNumberControl
              value={value.uploadsPerHour}
              min={1}
              max={Math.max(1000, form.saved?.uploadsPerHour ?? 0)}
              unit="/ h"
              ariaLabel="Envois par heure et par clé"
              onChange={(uploadsPerHour) => form.update({ uploadsPerHour: Math.round(uploadsPerHour) })}
            />
          </SettingRow>
        </PanelRows>
      )}
      <SettingsFooter form={form} blocked={Boolean(error)} />
    </Panel>
  );
}
