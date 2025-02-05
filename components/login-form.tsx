"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { siDiscord } from "simple-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "./ui/icons";

export function LoginForm({
	className,
	...props
}: React.ComponentPropsWithoutRef<"form">) {
	const [isLoading, setIsLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setIsLoading(true);

		const formData = new FormData(e.currentTarget);

		try {
			const res = await signIn("credentials", {
				username: formData.get("username"),
				password: formData.get("password"),
				redirect: true,
				callbackUrl: "/gallery",
			});

			if (res?.error) {
				toast.error("Identifiants invalides");
			}
		} catch (error) {
			toast.error("Une erreur est survenue");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<form
			className={cn("flex flex-col gap-6", className)}
			{...props}
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Connexion</h1>
				<p className="text-balance text-sm text-muted-foreground">
					Entrez vos identifiants pour accéder à votre compte
				</p>
			</div>
			<div className="grid gap-6">
				<div className="grid gap-2">
					<Label htmlFor="username">Nom d&apos;utilisateur</Label>
					<Input
						id="username"
						name="username"
						type="text"
						placeholder="Votre nom d'utilisateur"
						required
						disabled={isLoading}
					/>
				</div>
				<div className="grid gap-2">
					<div className="flex items-center">
						<Label htmlFor="password">Mot de passe</Label>
						<Button variant="link" className="ml-auto px-0 text-sm" asChild>
							<a href="/forgot-password">Mot de passe oublié ?</a>
						</Button>
					</div>
					<Input
						id="password"
						name="password"
						type="password"
						required
						disabled={isLoading}
						placeholder="Votre mot de passe"
					/>
				</div>
				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
					Se connecter
				</Button>
				{/* <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
					<span className="relative z-10 bg-background px-2 text-muted-foreground">
						Ou continuer avec
					</span>
				</div>
				<Button
					variant="outline"
					className="w-full"
					onClick={() => signIn("discord", { callbackUrl: "/gallery" })}
					disabled={isLoading}
					type="button"
				>
					<svg
						role="img"
						viewBox="0 0 24 24"
						className="mr-2 h-4 w-4"
						fill="currentColor"
					>
						<title>Discord</title>
						<path d={siDiscord.path} />
					</svg>
					Discord
				</Button> */}
			</div>
			<div className="text-center text-sm">
				Vous n&apos;avez pas de compte ?{" "}
				<Button variant="link" className="px-0" asChild>
					<a href="/register">Créer un compte</a>
				</Button>
			</div>
			<div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
				By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
				and <a href="#">Privacy Policy</a>.
			</div>
		</form>
	);
}
