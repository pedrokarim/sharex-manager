import { connection } from "next/server";

import { AuthShell } from "@/components/front/auth-shell";
import { LoginForm } from "@/components/login-form";
import { PageTransition } from "@/components/page-transition";
import { resolveAuthConfig } from "@/lib/auth-config";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Connexion" });

export default async function LoginPage() {
  // Le fournisseur est une configuration runtime. Cette page ne doit pas le
  // figer au moment où l'image Docker est construite.
  await connection();
  const authConfig = resolveAuthConfig();

  return (
    <PageTransition>
      <AuthShell photo="glade">
        <LoginForm authProvider={authConfig.provider} />
      </AuthShell>
    </PageTransition>
  );
}
