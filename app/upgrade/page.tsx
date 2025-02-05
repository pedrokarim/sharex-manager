import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Construction } from "lucide-react";

export default function UpgradePage() {
	return (
		<div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center">
			<div className="w-full max-w-4xl">
				<div className="mb-4">
					<Button variant="ghost" className="gap-2" asChild>
						<a href="/">
							<ArrowLeft className="h-4 w-4" />
							Retour
						</a>
					</Button>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Passer à Pro</CardTitle>
						<CardDescription>
							Découvrez les avantages de la version Pro
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Alert>
							<Construction className="h-4 w-4" />
							<AlertDescription>
								Cette fonctionnalité sera bientôt disponible. Restez à
								l&apos;écoute !
							</AlertDescription>
						</Alert>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
