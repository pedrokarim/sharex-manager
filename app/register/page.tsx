import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
	return (
		<div className="flex h-screen items-center justify-center">
			<div className="max-w-md text-center">
				<Alert variant="default" className="border-primary">
					<AlertCircle className="h-5 w-5 text-primary" />
					<AlertTitle>Inscription non disponible</AlertTitle>
					<AlertDescription className="mt-2">
						L&apos;inscription n&apos;est pas encore disponible. Veuillez
						contacter l&apos;administrateur pour créer un compte.
					</AlertDescription>
				</Alert>
				<Button variant="link" className="mt-4" asChild>
					<a href="/login">Retourner à la connexion</a>
				</Button>
			</div>
		</div>
	);
}
