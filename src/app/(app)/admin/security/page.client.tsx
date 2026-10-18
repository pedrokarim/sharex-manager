"use client";

/**
 * Écran « Sécurité » : l'en-tête (et « Revérifier », qui relit les points de
 * contrôle), puis cinq onglets gardés dans l'adresse (`?tab=`) : État,
 * Sessions, Clés API, Connexion, Règles. Chaque onglet ne lit que ses
 * propres données, au moment où il s'ouvre, avec son attente dessinée à sa
 * place.
 */

import { useState } from "react";
import { useQueryState } from "nuqs";
import { MotionConfig } from "framer-motion";
import { RefreshCw, Shield } from "lucide-react";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SecurityTabId } from "@/lib/security/checks";
import { ApiKeysTab } from "./_components/api-keys-tab";
import { useAlerts, useChecks } from "./_components/data";
import { OverviewTab, reviewCount } from "./_components/overview-tab";
import { ResourceProvider } from "./_components/resource";
import { RulesTab } from "./_components/rules-tab";
import { SessionsTab } from "./_components/sessions-tab";
import { SignInTab } from "./_components/sign-in-tab";

export const SECURITY_TABS: { id: SecurityTabId; label: string }[] = [
  { id: "overview", label: "État" },
  { id: "sessions", label: "Sessions" },
  { id: "keys", label: "Clés API" },
  { id: "sign-in", label: "Connexion" },
  { id: "rules", label: "Règles" },
];

/** Onglet demandé par l'adresse, ou État pour une valeur absente ou inconnue. */
export function resolveTab(value: string | null | undefined): SecurityTabId {
  return SECURITY_TABS.some((tab) => tab.id === value) ? (value as SecurityTabId) : "overview";
}

export default function SecurityPageClient({ ascenciaIssuer = null }: { ascenciaIssuer?: string | null }) {
  return (
    <ResourceProvider>
      <SecurityScreen ascenciaIssuer={ascenciaIssuer} />
    </ResourceProvider>
  );
}

function SecurityScreen({ ascenciaIssuer }: { ascenciaIssuer: string | null }) {
  // Onglet gardé dans l'adresse (?tab=) : un lien, un rechargement ou le bouton Retour rouvrent le même.
  const [tabParam, setTabParam] = useQueryState("tab", { history: "push" });
  const tab = resolveTab(tabParam);
  const setTab = (next: string) => void setTabParam(next === "overview" ? null : next);

  const checks = useChecks({ auto: false });
  const alerts = useAlerts({ auto: false });
  const [checking, setChecking] = useState(false);
  const feedback = useFeedback({ successDuration: 4000 });
  const review = checks.state.status === "ready" ? reviewCount(checks.state.data.checks) : 0;

  const recheck = async () => {
    setChecking(true);
    feedback.clear();
    const [result] = await Promise.all([checks.reload(), alerts.reload()]);
    setChecking(false);
    if (!result.ok) return void feedback.error(result.error);
    const count = reviewCount(result.data.checks);
    feedback.success(count ? `${count} point${count > 1 ? "s" : ""} à revoir` : "Tout est en ordre");
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full min-w-0 space-y-6">
        <AdminPageHeader
          icon={Shield}
          title="Sécurité"
          description="L’état de l’instance, les sessions ouvertes, les clés API, les connexions et les règles qui les encadrent."
          actions={
            <>
              <ActionStatus state={feedback.state} />
              <Button variant="outline" size="sm" className="gap-2" loading={checking} onClick={() => void recheck()}>
                <RefreshCw aria-hidden className="size-4" />
                Revérifier
              </Button>
            </>
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          {/* Onglets sur plusieurs lignes sur téléphone plutôt qu'une barre qui défile pour quelques pixels ; hauteur fixe des onglets, sinon ils s'étirent. */}
          <TabsList className="h-auto max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
            {SECURITY_TABS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} className="gap-1.5">
                {entry.label}
                {entry.id === "overview" && review ? (
                  <span className="rounded-full bg-amber-500/15 px-1.5 text-[11px] tabular-nums text-amber-800 dark:text-amber-300" title={`${review} point${review > 1 ? "s" : ""} à revoir`}>
                    {review}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview" className="min-w-0 pt-4">
            <OverviewTab onOpenTab={setTab} />
          </TabsContent>
          <TabsContent value="sessions" className="min-w-0 pt-4">
            <SessionsTab />
          </TabsContent>
          <TabsContent value="keys" className="min-w-0 pt-4">
            <ApiKeysTab />
          </TabsContent>
          <TabsContent value="sign-in" className="min-w-0 pt-4">
            <SignInTab ascenciaIssuer={ascenciaIssuer} />
          </TabsContent>
          <TabsContent value="rules" className="min-w-0 pt-4">
            <RulesTab />
          </TabsContent>
        </Tabs>
      </div>
    </MotionConfig>
  );
}
