"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Link2,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SquareArrowOutUpRight,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatCost } from "@/lib/connections/limits";
import type { AccountSummary } from "@/lib/connections/types";
import { ConnectAccountSheet, scopeSetFor, useConnectionReturn, type ConnectFlowStart } from "@/components/connections/connect-account-sheet";
import { ServiceSettingsSheet } from "@/components/connections/service-settings-sheet";
import { AccountAvatar, RelativeTime, ServiceLogo, StatusDot, accountHealth, capabilitiesText, countLabel, formatDateTime } from "@/components/connections/shared";
import type { ConnectionsOverview, ConnectorView } from "@/components/connections/types";
import { verifyAccountAction } from "./actions";
import { DisconnectDialog, RenameDialog } from "./shared";

type StateFilter = "all" | "attention" | "ok";
type SortKey = "name" | "checked";

/** Au-delà de cette taille, une recherche se justifie. */
const SEARCH_FROM = 9;

export function ConnectionsPageClient({ initial }: { initial: ConnectionsOverview }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowStart, setFlowStart] = useState<ConnectFlowStart | null>(null);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AccountSummary | null>(null);
  const [disconnecting, setDisconnecting] = useState<AccountSummary | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [service, setService] = useState("all");
  const [state, setState] = useState<StateFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [extending, setExtending] = useState<string | null>(null);

  // Retour d'une connexion par redirection : le parcours se rouvre à la bonne étape.
  const { start: returned, clear } = useConnectionReturn();
  useEffect(() => {
    if (!returned) return;
    setFlowStart(returned);
    setFlowOpen(true);
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois par retour
  }, [returned]);

  useEffect(() => {
    if (highlight.size === 0) return;
    const timer = setTimeout(() => setHighlight(new Set()), 6000);
    return () => clearTimeout(timer);
  }, [highlight]);

  const connectors = overview.connectors;
  const connectorOf = useCallback((account: AccountSummary) => connectors.find((entry) => entry.id === account.connector), [connectors]);

  const openFlow = (start: ConnectFlowStart | null) => {
    setFlowStart(start);
    setFlowOpen(true);
  };

  const replaceAccount = (account: AccountSummary) =>
    setOverview((current) => ({ ...current, accounts: current.accounts.map((entry) => (entry.id === account.id ? account : entry)) }));

  const actions: RowActions = {
    open: (account) => router.push(`/admin/connections/${account.id}`),
    reconnect: (account) => {
      const connector = connectorOf(account);
      openFlow({
        connectorId: account.connector,
        step: "authorize",
        scopeSet: connector ? scopeSetFor(connector, account.capabilities) : undefined,
        reconnect: { accountId: account.id, accountName: account.displayName },
      });
    },
    extend: async (account) => {
      setExtending(account.id);
      const result = await verifyAccountAction(account.id);
      setExtending(null);
      if (!result.ok) return void toast.error(result.error, { description: "Si le problème persiste, reconnectez le compte." });
      replaceAccount(result.data);
      toast.success(result.data.tokenState === "ok" ? "Accès prolongé" : "Compte vérifié", { description: result.data.tokenStateReason });
    },
    verify: async (account) => {
      setExtending(account.id);
      const result = await verifyAccountAction(account.id);
      setExtending(null);
      if (!result.ok) return void toast.error(result.error);
      replaceAccount(result.data);
      toast.success("Compte vérifié");
    },
    rename: (account) => setRenaming(account),
    disconnect: (account) => setDisconnecting(account),
  };

  // ─── Filtres et groupes ─────────────────────────────────────────

  const servicesWithAccounts = useMemo(() => connectors.filter((connector) => overview.accounts.some((account) => account.connector === connector.id)), [connectors, overview.accounts]);
  const attentionCount = overview.accounts.filter((account) => accountHealth(account).tone !== "ok").length;

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const list = overview.accounts.filter((account) => {
      if (service !== "all" && account.connector !== service) return false;
      const tone = accountHealth(account).tone;
      if (state === "attention" && tone === "ok") return false;
      if (state === "ok" && tone !== "ok") return false;
      if (needle && !`${account.displayName} ${account.name} ${account.handle ?? ""} ${account.externalId}`.toLocaleLowerCase("fr").includes(needle)) return false;
      return true;
    });
    const direction = sort.desc ? -1 : 1;
    return list.sort((a, b) =>
      sort.key === "checked" ? (a.lastCheckedAt - b.lastCheckedAt) * direction : a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" }) * direction
    );
  }, [overview.accounts, service, state, query, sort]);

  // Les comptes à traiter remontent en tête, avec leur geste sur la ligne ; les autres restent groupés par service.
  const attention = visible.filter((account) => accountHealth(account).tone !== "ok");
  // Un service garde son en-tête (et ses réglages) même quand tous ses comptes sont « à traiter » en tête de liste.
  const groups = servicesWithAccounts
    .map((connector) => ({
      connector,
      accounts: visible.filter((account) => account.connector === connector.id && accountHealth(account).tone === "ok"),
      shown: visible.some((account) => account.connector === connector.id),
    }))
    .filter((group) => group.shown);

  const settingsConnector = connectors.find((entry) => entry.id === settingsOf) ?? null;
  const unreachable = !overview.publicMedia.reachable;

  const toggleSort = (key: SortKey) => setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key === "checked" }));

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full min-w-0 space-y-6">
        <AdminPageHeader
          icon={Link2}
          title="Comptes connectés"
          description="Les comptes où ShareX Manager publie. Clip Studio, Image de marque et les modules à venir s’en servent tous."
          actions={
            <Button onClick={() => openFlow(null)} className="gap-2">
              <Plus className="size-4" />
              Connecter un compte
            </Button>
          }
        />

        {overview.keySource === null ? (
          <Notice tone="error">Ni CONNECTIONS_ENCRYPTION_KEY ni AUTH_SECRET ne sont définis : les jetons ne peuvent pas être chiffrés, aucun compte ne peut être connecté.</Notice>
        ) : overview.keySource === "auth-secret" ? (
          <p className="max-w-3xl text-xs text-pretty text-muted-foreground">
            Les jetons sont chiffrés avec une clé dérivée d’AUTH_SECRET : changer AUTH_SECRET obligera à reconnecter les comptes. Définissez CONNECTIONS_ENCRYPTION_KEY pour les en rendre indépendants.
          </p>
        ) : null}
        {!overview.authUrl ? <Notice tone="error">AUTH_URL n’est pas défini : les services ne sauraient pas où revenir après l’autorisation.</Notice> : null}

        {overview.accounts.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2 />
              </EmptyMedia>
              <EmptyTitle>Aucun compte connecté</EmptyTitle>
              <EmptyDescription>Reliez une chaîne, une page ou un compte pour y publier les clips de Clip Studio et suivre ses publications d’ici.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {connectors
                  .filter((connector) => connector.status === "ready")
                  .map((connector) => (
                    <Button key={connector.id} variant="outline" className="gap-2" onClick={() => openFlow({ connectorId: connector.id })}>
                      <ServiceLogo logo={connector.logo} />
                      {connector.label}
                    </Button>
                  ))}
                <Button onClick={() => openFlow(null)} className="gap-2">
                  <Plus className="size-4" />
                  Connecter un compte
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <section className="grid min-w-0 gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {servicesWithAccounts.length > 1 ? (
                <ToggleGroup type="single" variant="outline" size="sm" value={service} onValueChange={(next) => setService(next || "all")} aria-label="Filtrer par service" className="flex-wrap">
                  <ToggleGroupItem value="all" className="px-3">
                    Tous
                  </ToggleGroupItem>
                  {servicesWithAccounts.map((connector) => (
                    <ToggleGroupItem key={connector.id} value={connector.id} className="gap-1.5 px-3" aria-label={connector.label}>
                      <ServiceLogo logo={connector.logo} className="size-3.5" />
                      <span className="hidden sm:inline">{connector.label}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : null}
              <ToggleGroup type="single" variant="outline" size="sm" value={state} onValueChange={(next) => setState((next || "all") as StateFilter)} aria-label="Filtrer par état">
                <ToggleGroupItem value="all" className="px-3">
                  Tous les états
                </ToggleGroupItem>
                <ToggleGroupItem value="attention" className="gap-1.5 px-3" disabled={attentionCount === 0 && state !== "attention"}>
                  <span className="size-2 rounded-full bg-amber-500" aria-hidden />À traiter
                  {attentionCount > 0 ? <span className="tabular-nums text-foreground/65">{attentionCount}</span> : null}
                </ToggleGroupItem>
                <ToggleGroupItem value="ok" className="gap-1.5 px-3">
                  <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                  Connectés
                </ToggleGroupItem>
              </ToggleGroup>
              {overview.accounts.length >= SEARCH_FROM ? (
                <InputGroup className="w-full sm:ml-auto sm:w-64">
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un compte" aria-label="Chercher un compte" />
                </InputGroup>
              ) : null}
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">
                      <SortButton label="Compte" active={sort.key === "name"} desc={sort.desc} onClick={() => toggleSort("name")} />
                    </TableHead>
                    <TableHead className="hidden w-44 md:table-cell">Identifiant</TableHead>
                    <TableHead className="hidden w-36 sm:table-cell">État</TableHead>
                    <TableHead className="hidden w-60 2xl:table-cell">Droits</TableHead>
                    <TableHead className="hidden w-36 lg:table-cell">
                      <SortButton label="Vérifié" active={sort.key === "checked"} desc={sort.desc} onClick={() => toggleSort("checked")} />
                    </TableHead>
                    <TableHead className="w-[6.5rem] pr-3 text-right sm:w-48">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                        Aucun compte ne correspond à ces filtres.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {attention.length > 0 ? (
                    <>
                      <GroupRow>
                        <span className="flex min-w-0 items-center gap-2 font-semibold">
                          <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          À traiter
                          <span className="font-normal text-muted-foreground">{attention.length}</span>
                        </span>
                      </GroupRow>
                      <AccountRows accounts={attention} actions={actions} highlight={highlight} extending={extending} withService />
                    </>
                  ) : null}
                  {groups.map(({ connector, accounts }) => (
                    <Fragment key={connector.id}>
                      <GroupRow>
                        <ServiceGroupHeader
                          connector={connector}
                          count={overview.accounts.filter((account) => account.connector === connector.id).length}
                          billing={overview.billing[connector.id]}
                          unreachable={unreachable && Boolean(connector.publicMedia)}
                          allAttention={accounts.length === 0}
                          onSettings={() => setSettingsOf(connector.id)}
                        />
                      </GroupRow>
                      <AccountRows accounts={accounts} actions={actions} highlight={highlight} extending={extending} />
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>

      <ConnectAccountSheet
        open={flowOpen}
        onOpenChange={(open) => {
          setFlowOpen(open);
          if (!open) setFlowStart(null);
        }}
        start={flowStart}
        overview={overview}
        onOverviewChange={setOverview}
        onConnected={(accounts) => setHighlight(new Set(accounts.map((account) => account.id)))}
        returnTo="/admin/connections"
      />
      <ServiceSettingsSheet connector={settingsConnector} overview={overview} onOpenChange={(open) => !open && setSettingsOf(null)} onOverviewChange={setOverview} />
      <RenameDialog
        account={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        onRenamed={(account) => {
          setRenaming(null);
          replaceAccount(account);
        }}
      />
      <DisconnectDialog
        account={disconnecting}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        onDisconnected={(id) => {
          setDisconnecting(null);
          setOverview((current) => ({ ...current, accounts: current.accounts.filter((entry) => entry.id !== id) }));
        }}
      />
    </MotionConfig>
  );
}

function Notice({ tone, children }: { tone: "error" | "warning"; children: ReactNode }) {
  return (
    <p className={cn("flex max-w-3xl items-start gap-2 text-sm text-pretty", tone === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function SortButton({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  const Icon = desc ? ArrowDown : ArrowUp;
  return (
    <button type="button" onClick={onClick} className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground" aria-sort={active ? (desc ? "descending" : "ascending") : undefined}>
      {label}
      <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} aria-hidden />
    </button>
  );
}

function GroupRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={6} className="py-2 pr-3 pl-4 whitespace-normal">
        {children}
      </TableCell>
    </TableRow>
  );
}

function ServiceGroupHeader({
  connector,
  count,
  billing,
  unreachable,
  allAttention,
  onSettings,
}: {
  connector: ConnectorView;
  /** Tous ses comptes sont listés plus haut, « à traiter ». */
  allAttention?: boolean;
  count: number;
  billing?: ConnectionsOverview["billing"][string];
  unreachable: boolean;
  onSettings: () => void;
}) {
  const notes: { text: string; tone: "muted" | "warning" }[] = [];
  if (allAttention) notes.push({ text: count > 1 ? "Tous à traiter, plus haut" : "À traiter, plus haut", tone: "muted" });
  if (connector.status === "ready" && !connector.app?.configured) notes.push({ text: "Application à configurer", tone: "warning" });
  if (unreachable) notes.push({ text: "Instance non joignable depuis Internet : ce service ne pourra pas venir chercher les fichiers", tone: "warning" });
  if (billing) {
    notes.push({
      text: billing.creditsExhausted
        ? "Crédits épuisés"
        : `${formatCost(billing.spent, billing.currency)} ce mois${billing.budget !== null ? ` sur ${formatCost(billing.budget, billing.currency)}` : ", sans budget"}`,
      tone: billing.creditsExhausted || (billing.budget !== null && billing.spent >= billing.budget) ? "warning" : "muted",
    });
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <ServiceLogo logo={connector.logo} />
          {connector.label}
          <span className="font-normal text-muted-foreground">{countLabel(count, connector.accountNoun)}</span>
        </span>
        {notes.map((note) => (
          <span key={note.text} className={cn("min-w-0 text-xs text-pretty", note.tone === "warning" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {note.text}
          </span>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="-my-1 h-7 gap-1.5 text-muted-foreground" onClick={onSettings}>
        <Settings2 className="size-4" />
        Réglages
      </Button>
    </div>
  );
}

type RowActions = Record<"open" | "reconnect" | "extend" | "verify" | "rename" | "disconnect", (account: AccountSummary) => void>;

function AccountRows({
  accounts,
  actions,
  highlight,
  extending,
  withService = false,
}: {
  accounts: AccountSummary[];
  actions: RowActions;
  highlight: Set<string>;
  extending: string | null;
  withService?: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} actions={actions} highlighted={highlight.has(account.id)} busy={extending === account.id} withService={withService} />
      ))}
    </AnimatePresence>
  );
}

function AccountRow({
  account,
  actions,
  highlighted,
  busy,
  withService,
}: {
  account: AccountSummary;
  actions: RowActions;
  highlighted: boolean;
  busy: boolean;
  withService: boolean;
}) {
  const health = accountHealth(account);
  const href = `/admin/connections/${account.id}`;
  // Le menu « … » et le clic droit proposent exactement les mêmes entrées.
  const entries = [
    { key: "open", label: "Ouvrir la fiche", icon: SquareArrowOutUpRight, run: actions.open },
    { key: "verify", label: "Vérifier maintenant", icon: ShieldCheck, run: actions.verify },
    { key: "reconnect", label: "Reconnecter", icon: RefreshCw, run: actions.reconnect },
    { key: "rename", label: "Renommer", icon: PencilLine, run: actions.rename },
    { key: "disconnect", label: "Déconnecter", icon: Unplug, run: actions.disconnect, destructive: true },
  ];
  const inline = health.action === "reconnect" ? { label: "Reconnecter", run: actions.reconnect, icon: RefreshCw } : health.action === "extend" ? { label: "Prolonger", run: actions.extend, icon: ShieldCheck } : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.tr
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-slot="table-row"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a, [role=menuitem]")) return;
            actions.open(account);
          }}
          className={cn("cursor-pointer border-b transition-colors hover:bg-muted/50", highlighted && "bg-primary/5")}
        >
          {/* w-full + max-w-0 : la colonne du nom prend la place restante et son texte se tronque au lieu d'élargir le tableau. */}
          <TableCell className="w-full max-w-0 py-2.5 pl-4">
            <div className="flex min-w-0 items-center gap-3">
              <AccountAvatar account={account} withService={withService} />
              <div className="grid min-w-0">
                <Link href={href} className="truncate text-sm font-medium hover:underline" title={account.displayName}>
                  {account.displayName}
                </Link>
                {account.label ? (
                  <span className="truncate text-xs text-muted-foreground" title={account.name}>
                    {account.name}
                  </span>
                ) : (
                  <span className="truncate font-mono text-xs text-muted-foreground md:hidden">{account.handle ?? account.externalId}</span>
                )}
                <StatusDot tone={health.tone} label={health.label} reason={health.reason} className="mt-0.5 sm:hidden" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <span className="block max-w-44 truncate font-mono text-xs text-muted-foreground" title={account.externalId}>
              {account.handle ?? account.externalId}
            </span>
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <StatusDot tone={health.tone} label={health.label} reason={health.reason ?? (health.tone === "ok" && account.tokenExpiresAt ? `Jeton valable jusqu’au ${formatDateTime(account.tokenExpiresAt)}` : undefined)} />
          </TableCell>
          <TableCell className="hidden 2xl:table-cell">
            <span className="block max-w-60 truncate text-xs text-muted-foreground" title={capabilitiesText(account.capabilities)}>
              {capabilitiesText(account.capabilities)}
            </span>
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <RelativeTime value={account.lastCheckedAt} className="block max-w-36 truncate text-xs text-muted-foreground" />
          </TableCell>
          <TableCell className="pr-3">
            <div className="flex items-center justify-end gap-1">
              {inline ? (
                <Button size="sm" variant={health.tone === "error" ? "default" : "outline"} className="h-8 gap-1.5 px-2.5" loading={busy} onClick={() => inline.run(account)}>
                  <inline.icon className="size-3.5" />
                  <span className="hidden sm:inline">{inline.label}</span>
                  <span className="sr-only sm:hidden">{inline.label}</span>
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Actions du compte ${account.displayName}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {entries.map(({ key, label, icon: Icon, run, destructive }) => (
                    <Fragment key={key}>
                      {destructive ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem variant={destructive ? "destructive" : "default"} onClick={() => run(account)}>
                        <Icon className="mr-2 size-4" />
                        {label}
                      </DropdownMenuItem>
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TableCell>
        </motion.tr>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {entries.map(({ key, label, icon: Icon, run, destructive }) => (
          <Fragment key={key}>
            {destructive ? <ContextMenuSeparator /> : null}
            <ContextMenuItem variant={destructive ? "destructive" : "default"} onClick={() => run(account)}>
              <Icon className="mr-2 size-4" />
              {label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
