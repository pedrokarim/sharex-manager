import { AuthNotice, AuthShell } from "@/components/front/auth-shell";
import { PageTransition } from "@/components/page-transition";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Créer un compte" });

export default function RegisterPage() {
  return (
    <PageTransition>
      <AuthShell photo="lake">
        <AuthNotice title="Inscription" titleAccent="sur invitation." action={{ label: "Retour à la connexion", href: "/login" }}>
          L&apos;inscription n&apos;est pas encore ouverte. Pour obtenir un compte, contactez l&apos;administrateur de
          cette instance.
        </AuthNotice>
      </AuthShell>
    </PageTransition>
  );
}
