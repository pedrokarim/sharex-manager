"use client";

import { useState } from "react";
import { authClient, signIn } from "@/lib/auth-client";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "./ui/icons";

export function LoginForm({
  authProvider = "builtin",
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form"> & {
  authProvider?: "builtin" | "ascencia";
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (authProvider !== "builtin") return;
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const { error } = await signIn.username({
        username: String(formData.get("username") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      if (error) {
        // Ne pas tout réduire à « identifiants invalides » : une erreur de
        // configuration (origine refusée, 500…) doit rester diagnosticable.
        toast.error(
          error.status === 401
            ? "Identifiants invalides"
            : (error.message ?? `Échec de la connexion (${error.status})`)
        );
      } else {
        window.location.href = "/gallery";
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAscenciaSignIn() {
    setIsLoading(true);

    try {
      const { error } = await authClient.signIn.oauth2({
        providerId: "ascencia",
        callbackURL: "/gallery",
        errorCallbackURL: "/login?error=ascencia",
      });

      if (error) {
        toast.error(error.message ?? "Connexion avec Ascencia ID impossible");
        setIsLoading(false);
      }
    } catch {
      toast.error("Connexion avec Ascencia ID impossible");
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
          {authProvider === "ascencia"
            ? "Utilisez votre compte Ascencia ID autorisé"
            : "Entrez vos identifiants pour accéder à votre compte"}
        </p>
      </div>
      <div className="grid gap-6">
        {authProvider === "builtin" ? (
          <>
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
              {isLoading && (
                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              )}
              Se connecter
            </Button>
          </>
        ) : (
          <Button
            type="button"
            className="w-full"
            disabled={isLoading}
            onClick={handleAscenciaSignIn}
          >
            {isLoading && (
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
            )}
            Continuer avec Ascencia ID
          </Button>
        )}
      </div>
      {authProvider === "builtin" && (
        <div className="text-center text-sm">
          Vous n&apos;avez pas de compte ?{" "}
          <Button variant="link" className="px-0" asChild>
            <a href="/register">Créer un compte</a>
          </Button>
        </div>
      )}
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        En vous connectant, vous acceptez nos{" "}
        <a href="/legal/terms">Conditions Générales d&apos;Utilisation</a> et
        notre <a href="/legal/privacy">Politique de confidentialité</a>.
      </div>
    </form>
  );
}
