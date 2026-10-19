"use client";

/**
 * Écran « Services externes » : ce que l'application consomme chez chaque
 * service qu'elle appelle, IA ou non (DeepL, voix d'Edge, SerpApi, Openverse,
 * trace.moe, Pexels…). D'abord ce qui va manquer (les limites, les plus
 * tendues en tête), puis les fournisseurs en tableau, et le journal des
 * derniers appels dans un second onglet. Un fournisseur s'ouvre dans un
 * tiroir de détail, où se lit aussi son solde chez lui ; un appel s'ouvre
 * dans un tiroir qui explique ce qui s'est passé.
 */

import { useCallback, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { PlugZap, RefreshCw } from "lucide-react";
import type { AiLimit, AiProviderId, AiUsageEvent, AiUsageOverview } from "@/lib/ai-usage/types";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { aiUsageOverviewAction, readRemoteLimitsAction } from "./actions";
import { CallSheet } from "./_components/call-detail";
import { mergeLimits } from "./_components/format";
import { LimitsPanel } from "./_components/limits-panel";
import { ProviderSheet } from "./_components/provider-sheet";
import { ProvidersTable } from "./_components/providers-table";
import { RecentCalls } from "./_components/recent-calls";

type RemoteLimits = Partial<Record<AiProviderId, AiLimit[]>>;

export function ServicesPageClient({ initial }: { initial: AiUsageOverview }) {
  const [overview, setOverview] = useState(initial);
  // Soldes lus chez les fournisseurs pendant la visite : ils priment sur les chiffres de l'aperçu.
  const [remote, setRemote] = useState<RemoteLimits>({});
  const [openId, setOpenId] = useState<AiProviderId | null>(null);
  const [call, setCall] = useState<AiUsageEvent | null>(null);
  const [tab, setTab] = useState("providers");
  const [refreshing, setRefreshing] = useState(false);
  const refreshFeedback = useFeedback();

  const providers = useMemo(
    () => overview.providers.map((provider) => (remote[provider.id] ? { ...provider, limits: mergeLimits(provider.limits, remote[provider.id]) } : provider)),
    [overview.providers, remote]
  );
  const opened = providers.find((provider) => provider.id === openId) ?? null;
  const callProvider = call ? (providers.find((provider) => provider.id === call.provider) ?? { id: call.provider, label: call.provider, kind: "api" as const }) : null;
  const failures = overview.recent.filter((event) => !event.ok).length;

  const refresh = async () => {
    setRefreshing(true);
    refreshFeedback.clear();
    const result = await aiUsageOverviewAction();
    setRefreshing(false);
    if (!result.ok) return void refreshFeedback.error(result.error);
    setOverview(result.data);
    refreshFeedback.success("À jour");
  };

  const readRemote = useCallback(async (provider: { id: AiProviderId }) => {
    const result = await readRemoteLimitsAction(provider.id);
    if (!result.ok) return result.error;
    setRemote((current) => ({ ...current, [provider.id]: result.data }));
    return null;
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full min-w-0 space-y-6">
        <AdminPageHeader
          icon={PlugZap}
          title="Services externes"
          description="Consommation, quotas et derniers appels des services utilisés par l’application."
          actions={
            <>
              <ActionStatus state={refreshFeedback.state} />
              <span className="hidden text-xs text-muted-foreground sm:inline" title={formatDateTime(overview.generatedAt)} suppressHydrationWarning>
                Relevé {formatRelative(overview.generatedAt)}
              </span>
              <Button variant="outline" size="sm" className="gap-2" loading={refreshing} onClick={() => void refresh()}>
                <RefreshCw className="size-4" aria-hidden />
                Actualiser
              </Button>
            </>
          }
        />

        <LimitsPanel providers={providers} onOpenProvider={setOpenId} />

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="h-auto max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
            <TabsTrigger value="providers" className="gap-1.5">
              Fournisseurs
              <span className="rounded-full bg-primary/10 px-1.5 text-[11px] tabular-nums text-primary">{providers.length}</span>
            </TabsTrigger>
            <TabsTrigger value="recent" className="gap-1.5">
              Derniers appels
              {failures ? (
                <span className="rounded-full bg-destructive/10 px-1.5 text-[11px] tabular-nums text-red-700 dark:text-red-300" title={`${failures} en échec`}>
                  {failures}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="providers" className="min-w-0 pt-4">
            <ProvidersTable providers={providers} onOpen={setOpenId} />
          </TabsContent>
          <TabsContent value="recent" className="min-w-0 pt-4">
            <RecentCalls
              events={overview.recent}
              providers={providers}
              hint="Les cinquante derniers, tous services confondus. Un appel se clique pour lire ce qui s’est passé."
              selected={call}
              onSelect={setCall}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ProviderSheet
        provider={opened}
        recent={overview.recent}
        onOpenChange={(open) => !open && setOpenId(null)}
        onReadRemote={readRemote}
      />
      <CallSheet event={call} provider={callProvider} onOpenChange={(open) => !open && setCall(null)} />
    </MotionConfig>
  );
}
