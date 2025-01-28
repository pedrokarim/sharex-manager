"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <SessionProvider>{children}</SessionProvider>
    </NuqsAdapter>
  );
}
