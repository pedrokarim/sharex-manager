import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
	return (
		<div className="flex h-screen items-center justify-center">
			<div className="max-w-md text-center">
				<Alert variant="default" className="border-primary">
					<AlertCircle className="h-5 w-5 text-primary" />
					<AlertTitle>Récupération de mot de passe non disponible</AlertTitle>
					<AlertDescription className="mt-2">
						La récupération de mot de passe n&apos;est pas encore disponible.
						Veuillez contacter l&apos;administrateur pour réinitialiser votre
						mot de passe.
					</AlertDescription>
				</Alert>
				<Button variant="link" className="mt-4" asChild>
					<a href="/login">Retourner à la connexion</a>
				</Button>
			</div>
		</div>
	);
}
