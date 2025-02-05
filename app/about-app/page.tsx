import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Globe, ArrowLeft } from "lucide-react";
import { appConfig } from "@/lib/constant";
import { Separator } from "@/components/ui/separator";

export default function AboutPage() {
	return (
		<div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center">
			<div className="w-full max-w-3xl">
				<div className="mb-4">
					<Button variant="ghost" className="gap-2" asChild>
						<a href="/">
							<ArrowLeft className="h-4 w-4" />
							Retour
						</a>
					</Button>
				</div>
				<Card>
					<CardHeader className="text-center">
						<CardTitle className="text-4xl font-bold">
							{appConfig.name}
						</CardTitle>
						<CardDescription className="mt-2 text-lg">
							{appConfig.description}
						</CardDescription>
						<Badge variant="secondary" className="mt-2">
							Version {appConfig.version}
						</Badge>
					</CardHeader>
					<CardContent className="space-y-6">
						<Separator />

						<div className="space-y-4">
							<h2 className="text-2xl font-semibold">À propos du projet</h2>
							<p className="text-muted-foreground">
								ShareX Manager est un outil conçu pour simplifier la gestion de
								vos uploads ShareX. Cette application vous permet de gérer
								facilement vos fichiers téléchargés tout en garantissant la
								sécurité de vos données.
							</p>
						</div>

						<Separator />

						<div className="space-y-4">
							<h2 className="text-2xl font-semibold">Contact</h2>
							<div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
								<Button
									variant="outline"
									className="flex items-center gap-2"
									asChild
								>
									<a
										href={appConfig.authorUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										<Globe className="h-4 w-4" />
										Site web
									</a>
								</Button>
								<Button
									variant="outline"
									className="flex items-center gap-2"
									asChild
								>
									<a href={`mailto:${appConfig.authorEmail}`}>
										<Mail className="h-4 w-4" />
										Email
									</a>
								</Button>
							</div>
						</div>

						<Separator />

						<div className="text-center text-sm text-muted-foreground">
							Développé avec ❤️ par{" "}
							<a
								href={appConfig.authorUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium underline underline-offset-4"
							>
								{appConfig.author}
							</a>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
