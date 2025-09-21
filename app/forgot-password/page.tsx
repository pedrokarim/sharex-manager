import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md text-center">
        <Alert variant="default" className="border-primary">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <AlertTitle className="text-base sm:text-lg">
            Récupération de mot de passe non disponible
          </AlertTitle>
          <AlertDescription className="mt-2 text-sm sm:text-base">
            La récupération de mot de passe n&apos;est pas encore disponible.
            Veuillez contacter l&apos;administrateur pour réinitialiser votre
            mot de passe.
          </AlertDescription>
        </Alert>
        <Button variant="link" className="mt-4 text-sm" asChild>
          <a href="/login">Retourner à la connexion</a>
        </Button>
      </div>
    </div>
  );
}
