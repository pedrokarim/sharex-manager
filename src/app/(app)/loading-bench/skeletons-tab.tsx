"use client";

import { useState, type ComponentType } from "react";
import { Blocks, FileText, LayoutTemplate, Route, Sparkle } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { LoadingReveal } from "@/components/loading";
import {
  CardGridSkeleton,
  CardsPageSkeleton,
  FilterBarSkeleton,
  FormPageSkeleton,
  GalleryPageSkeleton,
  MediaGridSkeleton,
  PageHeaderSkeleton,
  RowsSkeleton,
  TablePageSkeleton,
} from "@/components/skeletons/page-skeletons";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { BenchCell, BenchGrid, PreviewFrame } from "./bench-parts";
// Les écrans d'attente des routes, tels que Next les affiche.
import AppLoading from "../loading";
import AdminLoading from "../admin/loading";
import AdminAiLoading from "../admin/ai/loading";
import AdminLogsLoading from "../admin/logs/loading";
import AdminSecurityLoading from "../admin/security/loading";
import AdminSystemLoading from "../admin/system/loading";
import AdminThemeLoading from "../admin/theme/loading";
import AdminUsersLoading from "../admin/users/loading";
import GalleryLoading from "../gallery/loading";
import SettingsLoading from "../settings/loading";
import SettingsApiKeysLoading from "../settings/api-keys/loading";
import SettingsPreferencesLoading from "../settings/preferences/loading";
import UploadsLoading from "../uploads/loading";
import UploadsConfigLoading from "../uploads/config/loading";
import UploadsHistoryLoading from "../uploads/history/loading";
import UploadsStatsLoading from "../uploads/stats/loading";

/** Chaque `loading.tsx` de `src/app/(app)/`, avec la route qu'il couvre et ce qu'il affiche. */
const ROUTE_LOADINGS: { route: string; file: string; shows: string; Component: ComponentType }[] = [
  { route: "/… (toute page sans attente propre)", file: "(app)/loading.tsx", shows: "LoadingState fill", Component: AppLoading },
  { route: "/admin", file: "admin/loading.tsx", shows: "CardsPageSkeleton", Component: AdminLoading },
  { route: "/admin/ai", file: "admin/ai/loading.tsx", shows: "écran sur mesure", Component: AdminAiLoading },
  { route: "/admin/logs", file: "admin/logs/loading.tsx", shows: "TablePageSkeleton", Component: AdminLogsLoading },
  { route: "/admin/security", file: "admin/security/loading.tsx", shows: "écran sur mesure", Component: AdminSecurityLoading },
  { route: "/admin/system", file: "admin/system/loading.tsx", shows: "FormPageSkeleton", Component: AdminSystemLoading },
  { route: "/admin/theme", file: "admin/theme/loading.tsx", shows: "écran sur mesure", Component: AdminThemeLoading },
  { route: "/admin/users", file: "admin/users/loading.tsx", shows: "TablePageSkeleton", Component: AdminUsersLoading },
  { route: "/gallery", file: "gallery/loading.tsx", shows: "GalleryPageSkeleton", Component: GalleryLoading },
  { route: "/settings", file: "settings/loading.tsx", shows: "CardsPageSkeleton", Component: SettingsLoading },
  { route: "/settings/api-keys", file: "settings/api-keys/loading.tsx", shows: "TablePageSkeleton", Component: SettingsApiKeysLoading },
  { route: "/settings/preferences", file: "settings/preferences/loading.tsx", shows: "FormPageSkeleton", Component: SettingsPreferencesLoading },
  { route: "/uploads", file: "uploads/loading.tsx", shows: "CardsPageSkeleton", Component: UploadsLoading },
  { route: "/uploads/config", file: "uploads/config/loading.tsx", shows: "FormPageSkeleton", Component: UploadsConfigLoading },
  { route: "/uploads/history", file: "uploads/history/loading.tsx", shows: "TablePageSkeleton", Component: UploadsHistoryLoading },
  { route: "/uploads/stats", file: "uploads/stats/loading.tsx", shows: "CardsPageSkeleton", Component: UploadsStatsLoading },
];

const FRAME_GRID = "grid min-w-0 gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))]";

export function SkeletonsTab() {
  return (
    <div className="grid min-w-0 gap-6">
      <RevealPanel />
      <BricksPanel />
      <PagesPanel />
      <RoutesPanel />
    </div>
  );
}

function RevealPanel() {
  const [loading, setLoading] = useState(true);
  return (
    <Panel>
      <PanelHeader
        icon={Sparkle}
        title="Passage au contenu"
        description="LoadingReveal : le squelette s’efface en se floutant, le contenu arrive net."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="bench-reveal-loading" checked={loading} onCheckedChange={setLoading} />
            <Label htmlFor="bench-reveal-loading" className="text-sm font-normal">
              En attente
            </Label>
          </div>
        }
      />
      <PanelBody>
        <BenchGrid wide>
          <BenchCell name="LoadingReveal" props={`loading={${loading}} fallback={<Skeleton …/>}`} note="Basculer « En attente » pour voir le passage dans les deux sens." stageClassName="items-stretch">
            <LoadingReveal
              loading={loading}
              className="grid w-full min-w-0 gap-3"
              fallback={Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex min-w-0 items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            >
              {["Première ligne", "Deuxième ligne", "Troisième ligne"].map((title) => (
                <div key={title} className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium">{title}</span>
                    <span className="truncate text-xs text-muted-foreground">Contenu de démonstration arrivé.</span>
                  </div>
                </div>
              ))}
            </LoadingReveal>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function BricksPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={Blocks}
        title="Briques de squelette"
        description="Skeleton et les morceaux de page-skeletons.tsx, dont les squelettes d’écran sont assemblés."
      />
      <PanelBody className="grid gap-4">
        <BenchGrid>
          <BenchCell name="Skeleton" props={`className="h-4 w-full"`} note="Ligne de texte." stageClassName="items-center">
            <Skeleton className="h-4 w-full" />
          </BenchCell>
          <BenchCell name="Skeleton" props={`className="size-10 rounded-full"`} note="Avatar.">
            <Skeleton className="size-10 rounded-full" />
          </BenchCell>
          <BenchCell name="Skeleton" props={`className="aspect-video w-full rounded-xl"`} note="Vignette.">
            <Skeleton className="aspect-video w-full rounded-xl" />
          </BenchCell>
          <BenchCell name="Skeleton" props={`className="h-8 w-full bg-primary/10"`} note="Une classe bg-* change la teinte, pas le reflet.">
            <Skeleton className="h-8 w-full bg-primary/10" />
          </BenchCell>
        </BenchGrid>
        <div className={FRAME_GRID}>
          <PreviewFrame title="PageHeaderSkeleton" detail="actions">
            <PageHeaderSkeleton actions />
          </PreviewFrame>
          <PreviewFrame title="FilterBarSkeleton">
            <FilterBarSkeleton />
          </PreviewFrame>
          <PreviewFrame title="RowsSkeleton" detail="rows={4}">
            <RowsSkeleton rows={4} />
          </PreviewFrame>
          <PreviewFrame title="CardGridSkeleton" detail="count={3}">
            <CardGridSkeleton count={3} />
          </PreviewFrame>
          <PreviewFrame title="MediaGridSkeleton" detail={`size="small" count={8}`}>
            <MediaGridSkeleton size="small" count={8} />
          </PreviewFrame>
          <PreviewFrame title="MediaGridSkeleton" detail={`size="medium" count={4}`}>
            <MediaGridSkeleton size="medium" count={4} />
          </PreviewFrame>
          <PreviewFrame title="MediaGridSkeleton" detail={`size="large" count={3}`}>
            <MediaGridSkeleton size="large" count={3} />
          </PreviewFrame>
        </div>
      </PanelBody>
    </Panel>
  );
}

function PagesPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={LayoutTemplate}
        title="Squelettes de pages"
        description="Les quatre pages entières de page-skeletons.tsx, au quart de leur surface."
      />
      <PanelBody>
        <div className={FRAME_GRID}>
          <PreviewFrame title="GalleryPageSkeleton" detail={`size="medium"`}>
            <GalleryPageSkeleton />
          </PreviewFrame>
          <PreviewFrame title="GalleryPageSkeleton" detail={`size="small"`}>
            <GalleryPageSkeleton size="small" />
          </PreviewFrame>
          <PreviewFrame title="TablePageSkeleton">
            <TablePageSkeleton />
          </PreviewFrame>
          <PreviewFrame title="CardsPageSkeleton">
            <CardsPageSkeleton />
          </PreviewFrame>
          <PreviewFrame title="FormPageSkeleton">
            <FormPageSkeleton />
          </PreviewFrame>
        </div>
      </PanelBody>
    </Panel>
  );
}

function RoutesPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={Route}
        title="Écrans d’attente des routes"
        description={`Chaque loading.tsx de l’espace connecté (${ROUTE_LOADINGS.length}), tel que Next l’affiche pendant l’arrivée de la page.`}
      />
      <PanelBody>
        <div className={FRAME_GRID}>
          {ROUTE_LOADINGS.map(({ route, file, shows, Component }) => (
            <PreviewFrame key={file} title={route} detail={`${file} · ${shows}`}>
              <Component />
            </PreviewFrame>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
