"use client";

import { useState } from "react";
import { useQueryState } from "nuqs";
import { MotionConfig } from "framer-motion";
import { Hourglass } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackTab } from "./feedback-tab";
import { IndicatorsTab } from "./indicators-tab";
import { SkeletonsTab } from "./skeletons-tab";
import { TextsTab } from "./texts-tab";
import { BENCH_TABS, resolveBenchTab } from "./tabs";

/*
 * Aperçu « Animations réduites » : les règles `prefers-reduced-motion` de
 * `global.css` (reflet du texte, squelettes, points du Spinner, fondus
 * `motion-reduce:`), reprises sous un attribut posé sur le banc. À garder
 * accordé à `global.css`.
 */
const REDUCED_MOTION_PREVIEW = `
[data-motion-preview="reduced"] [class*="shimmer"] { animation: none; }
[data-motion-preview="reduced"] .shimmer { background-image: none; color: var(--shimmer-base, var(--muted-foreground)); }
[data-motion-preview="reduced"] .sxm-matrix i { animation-duration: calc(var(--sxm-matrix-cycle) * 2); }
[data-motion-preview="reduced"] .sxm-skeleton { animation: none; background-image: none; }
[data-motion-preview="reduced"] [class*="motion-reduce:animate-none"] { animation: none; }
`;

export function LoadingBenchClient() {
  const [reduced, setReduced] = useState(false);
  // Onglet gardé dans l'adresse (?tab=) : un lien, un rechargement ou le bouton Retour rouvrent le même.
  const [tabParam, setTabParam] = useQueryState("tab", { history: "push" });
  const tab = resolveBenchTab(tabParam);
  const setTab = (next: string) => void setTabParam(next === BENCH_TABS[0].id ? null : next);

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <style>{REDUCED_MOTION_PREVIEW}</style>
      <div className="w-full min-w-0 space-y-6" data-motion-preview={reduced ? "reduced" : undefined}>
        <AdminPageHeader
          icon={Hourglass}
          title="Banc des chargements"
          description="Tous les visuels d’attente de l’application en un seul endroit, en direct, avec leurs variantes."
          actions={
            <div className="flex items-center gap-2">
              <Switch id="bench-reduced-motion" checked={reduced} onCheckedChange={setReduced} />
              <Label htmlFor="bench-reduced-motion" className="text-sm font-normal">
                Animations réduites
              </Label>
            </div>
          }
        />

        {reduced ? (
          <p className="max-w-3xl text-xs text-pretty text-muted-foreground">
            Aperçu partiel&nbsp;: reflets, squelettes, points du Spinner et fondus CSS suivent ce réglage. L’orbe, la lueur des cartes,
            l’assistant et les transitions de ThinkingStatus, LoadingReveal, ActionStatus et FormStatus ne lisent que le réglage du système
            (Windows&nbsp;: Accessibilité, Effets visuels, Effets d’animation).
          </p>
        ) : null}

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          {/* Onglets sur plusieurs lignes sur téléphone plutôt qu'une barre qui défile ; hauteur fixe des onglets, sinon ils s'étirent. */}
          <TabsList className="h-auto max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
            {BENCH_TABS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="indicators" className="min-w-0 pt-4">
            <IndicatorsTab />
          </TabsContent>
          <TabsContent value="texts" className="min-w-0 pt-4">
            <TextsTab />
          </TabsContent>
          <TabsContent value="feedback" className="min-w-0 pt-4">
            <FeedbackTab />
          </TabsContent>
          <TabsContent value="skeletons" className="min-w-0 pt-4">
            <SkeletonsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MotionConfig>
  );
}
