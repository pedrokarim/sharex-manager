"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { ArrowLeft, CircleAlert, ExternalLink, Link2, Loader2, MoreHorizontal, PencilLine, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AccountSummary, PublishJobSummary } from "@/lib/connections/types";
import { ConnectAccountSheet, scopeSetFor, useConnectionReturn, type ConnectFlowStart } from "@/components/connections/connect-account-sheet";
import { AccountAvatar, RelativeTime, ServiceLogo, StatusDot, accountHealth, capabilitiesText, formatDateTime } from "@/components/connections/shared";
import type { AccountPageData } from "../data";
import { accountActivityAction, verifyAccountAction } from "../actions";
import { DisconnectDialog, RenameDialog } from "../shared";
import { PostsTab } from "./posts-tab";
import { QueueTab, isActiveJob, isOpenJob } from "./queue-tab";
import { QuotaTab } from "./quota-tab";
import { ChannelTab } from "./channel-tab";

export function AccountPageClient({ initial }: { initial: AccountPageData }) {
  const router = useRouter();
  const [account, setAccount] = useState(initial.account);
  const [jobs, setJobs] = useState<PublishJobSummary[]>(initial.jobs);
  const [quota, setQuota] = useState(initial.quota);
  const [accountQuota, setAccountQuota] = useState(initial.accountQuota);
  const [renaming, setRenaming] = useState<AccountSummary | null>(null);
  const [disconnecting, setDisconnecting] = useState<AccountSummary | null>(null);
  const [flow, setFlow] = useState<ConnectFlowStart | null>(null);
  const [verifying, setVerifying] = useState(false);
  const connector = initial.connector;
  const caps = account.capabilities;
  const health = accountHealth(account);

  const refreshActivity = useCallback(async () => {
    const result = await accountActivityAction(account.id);
    if (!result.ok) return;
    setJobs(result.data.jobs);
    setQuota(result.data.quota);
    setAccountQuota(result.data.accountQuota);
    if (result.data.account) setAccount(result.data.account);
  }, [account.id]);

  // Suivi de la file : toutes les trois secondes tant qu'un travail avance, sinon toutes les trente.
  const active = jobs.some(isActiveJob);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshActivity();
    }, active ? 3000 : 30000);
    return () => clearInterval(timer);
  }, [active, refreshActivity]);

  // Reconnexion revenue par redirection.
  const { start: returned, clear } = useConnectionReturn();
  useEffect(() => {
    if (!returned) return;
    setFlow(returned);
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois par retour
  }, [returned]);

  const reconnect = () =>
    setFlow({ connectorId: connector.id, step: "authorize", scopeSet: scopeSetFor(connector, caps), reconnect: { accountId: account.id, accountName: account.displayName } });

  const verify = async (extend = false) => {
    setVerifying(true);
    const result = await verifyAccountAction(account.id);
    setVerifying(false);
    if (!result.ok) {
      toast.error(result.error, extend ? { description: "Si le problème persiste, reconnectez le compte." } : undefined);
      void refreshActivity();
      return;
    }
    setAccount(result.data);
    toast.success(extend && result.data.tokenState === "ok" ? "Accès prolongé" : "Compte vérifié");
  };

  const openJobs = jobs.filter(isOpenJob).length;
  const hasPosts = caps.includes("posts.list") || connector.capabilities.includes("posts.list");
  const hasQueue = caps.some((capability) => capability.startsWith("publish.")) || jobs.length > 0;
  const hasQuota = Boolean(quota || accountQuota);
  const hasProfile = connector.capabilities.includes("profile.banner") || connector.capabilities.includes("profile.watermark");
  const tabs = [
    hasPosts && { id: "posts", label: "Publications" },
    hasQueue && { id: "queue", label: "File", count: openJobs },
    hasQuota && { id: "quota", label: "Quotas" },
    hasProfile && { id: "profile", label: connector.accountNoun.one === "chaîne" ? "Chaîne" : "Profil" },
  ].filter(Boolean) as { id: string; label: string; count?: number }[];
  const [tab, setTab] = useState(() => tabs[0]?.id ?? "queue");

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full min-w-0 space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
          <Link href="/admin/connections">
            <ArrowLeft className="size-4" />
            Comptes connectés
          </Link>
        </Button>

        <AdminPageHeader
          icon={Link2}
          title={<span className="block [overflow-wrap:anywhere]">{account.displayName}</span>}
          description={
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex min-w-0 items-center gap-2">
                <AccountAvatar account={account} className="size-6 text-xs" />
                <ServiceLogo logo={connector.logo} />
                <span className="min-w-0 break-all">{account.handle ?? account.externalId}</span>
              </span>
              <StatusDot tone={health.tone} label={health.label} reason={health.reason} />
              <RelativeTime value={account.lastCheckedAt} prefix="Vérifié " />
            </span>
          }
          actions={
            <>
              {account.url ? (
                <Button asChild variant="outline" className="gap-2">
                  <a href={account.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="size-4" />
                    Voir sur {connector.label}
                  </a>
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Actions du compte">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem disabled={verifying} onClick={() => void verify()}>
                    <ShieldCheck className="mr-2 size-4" />
                    Vérifier maintenant
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={reconnect}>
                    <RefreshCw className="mr-2 size-4" />
                    Reconnecter
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRenaming(account)}>
                    <PencilLine className="mr-2 size-4" />
                    Renommer
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDisconnecting(account)}>
                    <Unplug className="mr-2 size-4" />
                    Déconnecter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        {health.action ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p className={cn("flex min-w-0 items-start gap-2 text-sm text-pretty", health.tone === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{health.reason ?? (health.tone === "error" ? "Ce compte doit être reconnecté." : "L’accès expire bientôt.")}</span>
            </p>
            <Button size="sm" variant={health.tone === "error" ? "default" : "outline"} disabled={verifying} onClick={() => (health.action === "extend" ? void verify(true) : reconnect())} className="gap-2">
              {verifying ? <Loader2 className="size-4 animate-spin" /> : health.action === "extend" ? <ShieldCheck className="size-4" /> : <RefreshCw className="size-4" />}
              {health.action === "extend" ? "Prolonger" : "Reconnecter"}
            </Button>
          </div>
        ) : null}

        <p className="text-xs text-pretty text-muted-foreground">
          Droits accordés : {capabilitiesText(caps).toLowerCase()}.
          {account.tokenExpiresAt && account.tokenRenewal !== "automatic" ? ` Accès valable jusqu’au ${formatDateTime(account.tokenExpiresAt)}, sans prolongation possible.` : ""}
        </p>

        {tabs.length > 0 ? (
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="max-w-full overflow-x-auto">
              {tabs.map((entry) => (
                <TabsTrigger key={entry.id} value={entry.id} className="gap-1.5">
                  {entry.label}
                  {entry.count ? <span className="rounded-full bg-primary/10 px-1.5 text-[11px] tabular-nums text-primary">{entry.count}</span> : null}
                </TabsTrigger>
              ))}
            </TabsList>
            {hasPosts ? (
              <TabsContent value="posts" className="min-w-0 pt-4">
                <PostsTab account={account} connector={connector} />
              </TabsContent>
            ) : null}
            {hasQueue ? (
              <TabsContent value="queue" className="min-w-0 pt-4">
                <QueueTab jobs={jobs} connector={connector} onChanged={refreshActivity} />
              </TabsContent>
            ) : null}
            {hasQuota ? (
              <TabsContent value="quota" className="min-w-0 pt-4">
                <QuotaTab quota={quota} accountQuota={accountQuota} connector={connector} />
              </TabsContent>
            ) : null}
            {hasProfile ? (
              <TabsContent value="profile" className="min-w-0 pt-4">
                <ChannelTab account={account} connector={connector} kits={initial.kits} onPushed={refreshActivity} />
              </TabsContent>
            ) : null}
          </Tabs>
        ) : null}
      </div>

      <ConnectAccountSheet
        open={flow !== null}
        onOpenChange={(open) => !open && setFlow(null)}
        start={flow}
        returnTo={`/admin/connections/${account.id}`}
        onConnected={(accounts) => {
          const same = accounts.find((entry) => entry.id === account.id);
          if (same) setAccount(same);
          void refreshActivity();
        }}
      />
      <RenameDialog
        account={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        onRenamed={(next) => {
          setRenaming(null);
          setAccount(next);
        }}
      />
      <DisconnectDialog
        account={disconnecting}
        connectorLabel={connector.label}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        onDisconnected={() => router.push("/admin/connections")}
      />
    </MotionConfig>
  );
}
