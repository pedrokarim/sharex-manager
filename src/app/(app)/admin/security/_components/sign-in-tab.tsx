"use client";

/**
 * Onglet Connexion : le journal des connexions (réussies, échouées,
 * bloquées, déconnexions), filtrable par résultat et paginé ; à côté, les
 * règles des mots de passe et du blocage quand l'instance gère ses comptes,
 * ou ce que fait Ascencia ID quand la connexion passe par lui.
 */

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CircleX, ExternalLink, History, KeySquare, LogIn, LogOut, RefreshCw, ShieldBan, ShieldEllipsis, type LucideIcon } from "lucide-react";
import { BoundedNumberControl } from "@/components/ui/bounded-number-control";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { RelativeTime, formatDateTime } from "@/components/connections/shared";
import { DeviceIcon, IpText } from "@/components/security/session-bits";
import { parseUserAgent } from "@/lib/security/sessions";
import { cn } from "@/lib/utils";
import type { SignInLog } from "./api";
import { useSettings, useSignInJournal } from "./data";
import { useSectionForm } from "./settings-form";
import { PAGE_SIZE, Pager, PanelError, RowsSkeleton, SettingRow, SettingsFooter, SettingsSkeleton, StopsSlider, SwitchRow, clampPage, displayAccount, minutesLabel } from "./shared";

const MotionRow = motion.create(TableRow);

export type SignInResult = "success" | "failed" | "blocked" | "logout";

const RESULT_OF: Record<string, SignInResult> = {
  "auth.login": "success",
  "auth.login.failed": "failed",
  "auth.login.blocked": "blocked",
  "auth.logout": "logout",
};

export const RESULTS: Record<SignInResult, { label: string; filter: string; icon: LucideIcon; tone: string }> = {
  success: { label: "Réussie", filter: "Réussies", icon: LogIn, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Échouée", filter: "Échouées", icon: CircleX, tone: "bg-destructive/10 text-red-700 dark:text-red-400" },
  blocked: { label: "Bloquée", filter: "Bloquées", icon: ShieldBan, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  logout: { label: "Déconnexion", filter: "Déconnexions", icon: LogOut, tone: "bg-muted text-foreground/75" },
};

export function resultOf(log: Pick<SignInLog, "action">): SignInResult {
  return RESULT_OF[log.action] ?? "failed";
}

/** Le compte d'une entrée : le compte connecté, sinon l'identifiant saisi, sinon le fournisseur. */
export function accountOf(log: Pick<SignInLog, "userEmail" | "metadata">): string {
  if (log.userEmail) return displayAccount(log.userEmail);
  const identifier = log.metadata?.identifier;
  if (typeof identifier === "string" && identifier) return identifier;
  if (log.metadata?.provider === "ascencia") return "Ascencia ID";
  return "Inconnu";
}

export function SignInTab({ ascenciaIssuer }: { ascenciaIssuer: string | null }) {
  const settings = useSettings();
  const mode = settings.state.status === "ready" ? settings.state.data.authMode : null;
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <JournalPanel />
      <aside aria-label="Règles de connexion" className="grid min-w-0 content-start gap-6">
        {settings.state.status === "error" ? (
          <Panel>
            <PanelHeader icon={KeySquare} title="Règles de connexion" />
            <PanelError message={settings.state.error} onRetry={() => void settings.reload()} />
          </Panel>
        ) : mode === null ? (
          <Panel aria-hidden>
            <PanelHeader icon={KeySquare} title="Mots de passe" />
            <SettingsSkeleton rows={2} />
          </Panel>
        ) : mode === "ascencia" ? (
          <AscenciaPanel issuer={ascenciaIssuer} />
        ) : (
          <>
            <PasswordsPanel />
            <AttemptsPanel />
          </>
        )}
      </aside>
    </div>
  );
}

// ─── Journal ──────────────────────────────────────────────────────

type ResultFilter = "all" | SignInResult;

function JournalPanel() {
  const titleId = useId();
  const journal = useSignInJournal();
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const list = useMemo(() => (journal.state.status === "ready" ? journal.state.data : []), [journal.state]);
  const counts = useMemo(() => {
    const result: Record<ResultFilter, number> = { all: list.length, success: 0, failed: 0, blocked: 0, logout: 0 };
    for (const log of list) result[resultOf(log)] += 1;
    return result;
  }, [list]);
  const filtered = useMemo(() => (filter === "all" ? list : list.filter((log) => resultOf(log) === filter)), [list, filter]);
  const current = clampPage(page, filtered.length);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const changeFilter = (next: ResultFilter) => {
    setFilter(next);
    setPage(0);
  };

  const refresh = async () => {
    setRefreshing(true);
    await journal.reload();
    setRefreshing(false);
  };

  return (
    <Panel aria-labelledby={titleId} className="@container">
      <PanelHeader
        icon={History}
        title="Journal des connexions"
        titleId={titleId}
        description="Connexions, échecs, blocages et déconnexions, des plus récents aux plus anciens."
        actions={
          <Button variant="outline" size="sm" className="gap-2" loading={refreshing} onClick={() => void refresh()}>
            <RefreshCw aria-hidden className="size-4" />
            Actualiser
          </Button>
        }
      />
      {journal.state.status === "loading" ? (
        <RowsSkeleton rows={6} action={false} />
      ) : journal.state.status === "error" ? (
        <PanelError message={journal.state.error} onRetry={() => void journal.reload()} />
      ) : list.length === 0 ? (
        <Empty className="p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle className="text-base">Aucune connexion notée</EmptyTitle>
            <EmptyDescription className="text-xs">Chaque connexion, échec, blocage ou déconnexion s’inscrit ici, tant que les journaux sont gardés.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b px-4 py-3">
            <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(next) => changeFilter((next || "all") as ResultFilter)} aria-label="Filtrer par résultat" className="flex-wrap">
              <ToggleGroupItem value="all" className="gap-1.5 px-2.5">
                Toutes
                <span className="tabular-nums text-foreground/65">{counts.all}</span>
              </ToggleGroupItem>
              {(Object.keys(RESULTS) as SignInResult[])
                .filter((value) => value === filter || counts[value] > 0)
                .map((value) => (
                  <ToggleGroupItem key={value} value={value} className="gap-1.5 px-2.5">
                    {RESULTS[value].filter}
                    <span className="tabular-nums text-foreground/65">{counts[value]}</span>
                  </ToggleGroupItem>
                ))}
            </ToggleGroup>
          </div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="hidden w-36 pl-4 @md:table-cell">Date</TableHead>
                <TableHead className="pl-4 @md:pl-2">Compte</TableHead>
                <TableHead className="hidden w-36 @sm:table-cell">Résultat</TableHead>
                <TableHead className="hidden w-36 @xl:table-cell">Adresse IP</TableHead>
                <TableHead className="hidden w-44 pr-4 @2xl:table-cell">Appareil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody key={`${filter}-${current}`}>
              {shown.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                    Aucune entrée dans ce filtre.{" "}
                    <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => changeFilter("all")}>
                      Tout afficher
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence initial={false}>
                  {shown.map((log) => (
                    <JournalRow key={log.id} log={log} />
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
          <Pager page={current} total={filtered.length} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

function ResultPill({ result, className }: { result: SignInResult; className?: string }) {
  const { label, icon: Icon, tone } = RESULTS[result];
  return (
    <span className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", tone, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function JournalRow({ log }: { log: SignInLog }) {
  const result = resultOf(log);
  const account = accountOf(log);
  const device = parseUserAgent(log.userAgent);
  const reason = typeof log.metadata?.reason === "string" ? log.metadata.reason : null;
  return (
    <MotionRow initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <TableCell className="hidden py-3 pl-4 align-top @md:table-cell">
        <RelativeTime value={log.timestamp} className="block truncate text-xs" />
        <span className="block truncate text-[11px] text-muted-foreground" title={formatDateTime(log.timestamp)}>
          {formatDateTime(log.timestamp)}
        </span>
      </TableCell>
      <TableCell className="py-3 pl-4 align-top whitespace-normal @md:pl-2">
        <div className="grid min-w-0 gap-0.5">
          <span className="min-w-0 truncate text-sm font-medium" title={account}>
            {account}
          </span>
          {reason ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={reason}>
              {reason}
            </span>
          ) : null}
          {/* Ce que les colonnes masquées ne montrent plus, sous le compte. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground @xl:hidden">
            <ResultPill result={result} className="@sm:hidden" />
            <RelativeTime value={log.timestamp} className="@md:hidden" />
            <IpText ip={log.ip} className="max-w-40" />
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden py-3 align-top @sm:table-cell">
        <ResultPill result={result} />
      </TableCell>
      <TableCell className="hidden py-3 align-top @xl:table-cell">
        <IpText ip={log.ip} className="mt-0.5" />
      </TableCell>
      <TableCell className="hidden py-3 pr-4 align-top @2xl:table-cell">
        <span className="flex min-w-0 items-center gap-1.5 text-xs" title={log.userAgent ?? device.label}>
          <DeviceIcon type={device.type} className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 truncate">{device.label}</span>
        </span>
      </TableCell>
    </MotionRow>
  );
}

// ─── Règles (mode « builtin ») ────────────────────────────────────

function PasswordsPanel() {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("passwords", settings);
  const value = form.value;
  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={KeySquare} title="Mots de passe" titleId={titleId} description="Vérifiés à la création d’un compte et à chaque changement de mot de passe." />
      {!value ? (
        <SettingsSkeleton rows={2} />
      ) : (
        <PanelRows>
          <SettingRow id="password-length" label="Longueur minimale" value={`${value.minLength} caractères`}>
            <BoundedNumberControl
              value={value.minLength}
              min={8}
              max={Math.max(64, form.saved?.minLength ?? 0)}
              unit="car."
              ariaLabel="Longueur minimale des mots de passe"
              onChange={(minLength) => form.update({ minLength: Math.round(minLength) })}
            />
          </SettingRow>
          <SwitchRow
            id="password-common"
            label="Refuser les mots de passe courants"
            description="« motdepasse », « azerty123 » et les milliers d’autres que les attaques essaient en premier."
            checked={value.rejectCommon}
            disabled={form.saving}
            onChange={(rejectCommon) => form.update({ rejectCommon })}
          />
        </PanelRows>
      )}
      <SettingsFooter form={form} note="Les mots de passe existants restent valables." />
    </Panel>
  );
}

const LOCK_STOPS = [5, 15, 60, 1440] as const;

function AttemptsPanel() {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("signIn", settings);
  const value = form.value;
  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={ShieldEllipsis} title="Tentatives" titleId={titleId} description="Après trop d’échecs, le compte visé et l’adresse d’où ils viennent sont bloqués." />
      {!value ? (
        <SettingsSkeleton rows={2} />
      ) : (
        <PanelRows>
          <SettingRow id="sign-in-attempts" label="Échecs avant blocage" value={value.maxAttempts}>
            <BoundedNumberControl
              value={value.maxAttempts}
              min={3}
              max={20}
              unit="échecs"
              ariaLabel="Échecs avant blocage"
              onChange={(maxAttempts) => form.update({ maxAttempts: Math.round(maxAttempts) })}
            />
          </SettingRow>
          <SettingRow id="sign-in-lock" label="Durée du blocage" value={minutesLabel(value.lockMinutes)}>
            <StopsSlider
              stops={LOCK_STOPS}
              value={value.lockMinutes}
              onChange={(lockMinutes) => form.update({ lockMinutes })}
              format={(minutes) => (minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`)}
              label="Durée du blocage"
              disabled={form.saving}
            />
          </SettingRow>
        </PanelRows>
      )}
      <SettingsFooter form={form} />
    </Panel>
  );
}

// ─── Mode Ascencia ID ─────────────────────────────────────────────

function AscenciaPanel({ issuer }: { issuer: string | null }) {
  const titleId = useId();
  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={BadgeCheck} title="Géré par Ascencia ID" titleId={titleId} description="La connexion passe par le fournisseur d’identité." />
      <PanelBody className="grid gap-3 text-sm text-pretty">
        <p>Mots de passe, double authentification et blocage après des échecs se règlent dans Ascencia ID : cette instance ne voit jamais les mots de passe.</p>
        <p className="text-xs text-muted-foreground">Le journal note quand même chaque retour de connexion, réussi ou refusé, avec son adresse et son appareil.</p>
      </PanelBody>
      {issuer ? (
        <PanelFooter className="justify-end">
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
            <a href={issuer} target="_blank" rel="noreferrer noopener">
              <ExternalLink aria-hidden className="size-4" />
              Ouvrir Ascencia ID
            </a>
          </Button>
        </PanelFooter>
      ) : null}
    </Panel>
  );
}
