import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { privatePageMetadata } from "@/lib/seo";
import { IntegrationsPageClient } from "./page.client";

export const metadata = privatePageMetadata({
  title: "Intégrations",
  description: "Branchez ShareX, Flameshot et l’application mobile sur ShareX Manager",
});

export default async function IntegrationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // L'état de chaque outil ne compte que les clés de ce compte, même pour un
  // administrateur, qui reçoit toutes les clés de l'instance.
  return <IntegrationsPageClient viewerId={session.user.id} />;
}
