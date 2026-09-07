import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { resolveAuthConfig } from "@/lib/auth-config";
import { privatePageMetadata } from "@/lib/seo";

import { AccountPageClient } from "./page.client";

export const metadata: Metadata = privatePageMetadata({ title: "Mon compte" });

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const authProvider = resolveAuthConfig().provider;

  return (
    <AccountPageClient
      account={{
        name: session.user.name || session.user.email.split("@")[0],
        email: session.user.email,
        image: session.user.image ?? null,
        role: session.user.role === "admin" ? "admin" : "user",
        createdAt: session.user.createdAt.toISOString(),
        expiresAt: session.session.expiresAt.toISOString(),
        provider: authProvider,
      }}
    />
  );
}
