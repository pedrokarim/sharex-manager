"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { Session } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode, Suspense } from "react";
import { TranslationProvider } from "./providers/TranslationProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ResolvedThemePayload } from "@/types/theme-runtime";

export function Providers({
  children,
  initialTheme,
  session,
}: {
  children: ReactNode;
  initialTheme: ResolvedThemePayload;
  session: Session | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <NuqsAdapter>
          <ThemeProvider initialTheme={initialTheme}>
            <TranslationProvider>
              <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
            </TranslationProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </Suspense>
    </QueryClientProvider>
  );
}
