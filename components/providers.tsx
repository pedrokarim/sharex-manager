"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode, Suspense } from "react";
import { TranslationProvider } from "./providers/TranslationProvider";
import { ChatProvider } from "@/hooks/use-chat-context";

export function Providers({ children }: { children: ReactNode }) {
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
      <ChatProvider>
        <Suspense fallback={null}>
          <NuqsAdapter>
            <ThemeProvider>
              <TranslationProvider>
                <SessionProvider>{children}</SessionProvider>
              </TranslationProvider>
            </ThemeProvider>
          </NuqsAdapter>
        </Suspense>
      </ChatProvider>
    </QueryClientProvider>
  );
}
