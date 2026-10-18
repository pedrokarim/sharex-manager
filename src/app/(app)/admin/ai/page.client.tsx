"use client";

/**
 * Écran « Intelligence artificielle » : ce que l'application consomme chez
 * chaque IA et service à quota. D'abord ce qui va manquer (les limites, les
 * plus tendues en tête), puis les fournisseurs en tableau, et le journal des
 * derniers appels dans un second onglet. Un fournisseur s'ouvre dans un
 * tiroir de détail, où se lit aussi son solde chez lui.
 */

import { useCallback, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { BrainCircuit, RefreshCw } from "lucide-react";
import type { AiLimit, AiProviderId, AiUsageOverview } from "@/lib/ai-usage/types";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime, formatRelative } from "@/components/connections/shared";
import { aiUsageOverviewAction, readRemoteLimitsAction } from "./actions";
import { mergeLimits } from "./_components/format";
import { LimitsPanel } from "./_components/limits-panel";
import { ProviderSheet } from "./_components/provider-sheet";
import { ProvidersTable } from "./_components/providers-table";
import { RecentCallsTable } from "./_components/recent-calls";

type RemoteLimits = Partial<Record<AiProviderId, AiLimit[]>>;

export function AiUsagePageClient({ initial }: { initial: AiUsageOverview }) {
  const [overview, setOverview] = useState(initial);
  // Soldes lus chez les fournisseurs pendant la visite : ils priment sur les chiffres de l'aperçu.
  const [remote, setRemote] = useState<RemoteLimits>({});
  const [openId, setOpenId] = useState<AiProviderId | null>(null);
  const [tab, setTab] = useState("providers");
  const [recentFilter, setRecentFilter] = useState<"all" | "failures">("all");
  const [refreshing, setRefreshing] = useState(false);
  const refreshFeedback = useFeedback();

  const providers = useMemo(
    () => overview.providers.map((provider) => (remote[provider.id] ? { ...provider, limits: mergeLimits(provider.limits, remote[provider.id]) } : provider)),
    [overview.providers, remote]
  );
  const opened = providers.find((provider) => provider.id === openId) ?? null;
  const failures = overview.recent.filter((event) => !event.ok);
  const recent = recentFilter === "failures" ? failures : overview.recent;

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
          icon={BrainCircuit}
          title="Intelligence artificielle"
          description="Ce que l’application consomme chez chaque IA et service à quota : les limites qui approchent, les fournisseurs, les derniers appels."
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
              {failures.length ? (
                <span className="rounded-full bg-destructive/10 px-1.5 text-[11px] tabular-nums text-red-700 dark:text-red-300" title={`${failures.length} en échec`}>
                  {failures.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="providers" className="min-w-0 pt-4">
            <ProvidersTable providers={providers} onOpen={setOpenId} />
          </TabsContent>
          <TabsContent value="recent" className="grid min-w-0 gap-3 pt-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <ToggleGroup type="single" variant="outline" size="sm" value={recentFilter} onValueChange={(next) => setRecentFilter((next || "all") as "all" | "failures")} aria-label="Filtrer les appels">
                <ToggleGroupItem value="all" className="gap-1.5 px-2.5">
                  Tous
                  <span className="tabular-nums text-foreground/65">{overview.recent.length}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="failures" className="gap-1.5 px-2.5" disabled={failures.length === 0 && recentFilter !== "failures"}>
                  Échecs
                  <span className="tabular-nums text-foreground/65">{failures.length}</span>
                </ToggleGroupItem>
              </ToggleGroup>
              <span className="text-xs text-muted-foreground">Les cinquante derniers, tous fournisseurs confondus.</span>
            </div>
            <RecentCallsTable events={recent} providers={providers} empty={recentFilter === "failures" ? "Aucun échec parmi les derniers appels." : "Aucun appel noté pour l’instant."} />
          </TabsContent>
        </Tabs>
      </div>

      <ProviderSheet
        provider={opened}
        recent={overview.recent}
        onOpenChange={(open) => !open && setOpenId(null)}
        onReadRemote={readRemote}
      />
    </MotionConfig>
  );
}
