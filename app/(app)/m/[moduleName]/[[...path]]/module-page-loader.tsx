"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ModuleConfig } from "@/types/modules";

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

// Registry of module pages — explicit imports avoid Turbopack scanning all of @/modules/
const MODULE_PAGES: Record<
  string,
  Record<string, ReturnType<typeof dynamic>>
> = {
  "ai-image-gen": {
    "": dynamic(() => import("@/modules/ai-image-gen/pages/generate"), {
      ssr: false,
      loading: LoadingSpinner,
    }),
    settings: dynamic(() => import("@/modules/ai-image-gen/pages/settings"), {
      ssr: false,
      loading: LoadingSpinner,
    }),
  },
};

interface ModulePageLoaderProps {
  moduleName: string;
  pagePath: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

export function ModulePageLoader({
  moduleName,
  pagePath,
  moduleConfig,
  settings,
}: ModulePageLoaderProps) {
  const Component = MODULE_PAGES[moduleName]?.[pagePath];

  if (!Component) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>Page de module introuvable</p>
        <p className="text-sm mt-1">
          Module: {moduleName}, Page: {pagePath || "/"}
        </p>
      </div>
    );
  }

  return (
    <Component
      moduleName={moduleName}
      moduleConfig={moduleConfig}
      settings={settings}
    />
  );
}
