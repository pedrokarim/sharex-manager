"use client";

import { useSession } from "next-auth/react";

// Simple auth client wrapper for NextAuth compatibility
// This provides the methods that components expect from better-auth client

export const authClient = {
  useSession: () => {
    const { data: session, status } = useSession();
    return {
      data: session,
      isPending: status === "loading",
    };
  },
};
