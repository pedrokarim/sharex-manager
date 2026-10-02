import { AuthNotice, AuthShell } from "@/components/front/auth-shell";
import { PageTransition } from "@/components/page-transition";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata({ title: "Mot de passe oublié" });

export default function ForgotPasswordPage() {
  return (
    <PageTransition>
      <AuthShell photo="pines">
        <AuthNotice title="Mot de passe" titleAccent="oublié ?" action={{ label: "Retour à la connexion", href: "/login" }}>
          La récupération en ligne n&apos;est pas encore disponible. Contactez l&apos;administrateur de cette instance :
          il peut réinitialiser votre mot de passe.
        </AuthNotice>
      </AuthShell>
    </PageTransition>
  );
}
