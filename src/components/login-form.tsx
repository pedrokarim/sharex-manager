"use client";

import { useState } from "react";
import { authClient, signIn } from "@/lib/auth-client";

import { DISPLAY } from "@/components/front/fonts";
import { FIELD, PILL_SOLID } from "@/components/front/styles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus, useFeedback } from "@/components/feedback";

export function LoginForm({
  authProvider = "builtin",
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form"> & {
  authProvider?: "builtin" | "ascencia";
}) {
  const [isLoading, setIsLoading] = useState(false);
  // L'erreur s'affiche dans le formulaire, au-dessus du bouton : c'est là
  // que l'utilisateur regarde quand il vient de valider.
  const feedback = useFeedback();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (authProvider !== "builtin") return;
    setIsLoading(true);
    feedback.clear();

    const formData = new FormData(e.currentTarget);

    try {
      const { error } = await signIn.username({
        username: String(formData.get("username") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      if (error) {
        // Ne pas tout réduire à « identifiants invalides » : une erreur de
        // configuration (origine refusée, 500…) doit rester diagnosticable.
        feedback.error(
          error.status === 401
            ? "Nom d’utilisateur ou mot de passe incorrect."
            : (error.message ?? `Échec de la connexion (${error.status}).`)
        );
      } else {
        window.location.href = "/gallery";
      }
    } catch (error) {
      feedback.error("La connexion n’a pas abouti. Vérifiez votre réseau, puis réessayez.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAscenciaSignIn() {
    setIsLoading(true);
    feedback.clear();

    try {
      const { error } = await authClient.signIn.oauth2({
        providerId: "ascencia",
        callbackURL: "/gallery",
        errorCallbackURL: "/login?error=ascencia",
      });

      if (error) {
        feedback.error(error.message ?? "Connexion avec Ascencia ID impossible.");
        setIsLoading(false);
      }
    } catch {
      feedback.error("Connexion avec Ascencia ID impossible.");
      setIsLoading(false);
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      {...props}
      onSubmit={handleSubmit}
      // Corriger sa saisie retire le message d'erreur.
      onChange={feedback.state?.tone === "error" ? feedback.clear : undefined}
    >
      <div>
        <h1 className={cn(DISPLAY, "text-5xl leading-[1.05]")}>Connexion</h1>
        <p className="mt-3 text-pretty text-muted-foreground">
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
                autoComplete="username"
                required
                disabled={isLoading}
                className={FIELD}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Mot de passe</Label>
                <Button variant="link" className="ml-auto h-auto px-0 py-0 text-sm text-emerald-700 dark:text-emerald-400" asChild>
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
                autoComplete="current-password"
                className={FIELD}
              />
            </div>
            <div>
              <FormStatus state={feedback.state} className="pb-3" />
              <Button type="submit" className={cn(PILL_SOLID, "w-full justify-center")} loading={isLoading}>
                Se connecter
              </Button>
            </div>
          </>
        ) : (
          <div>
            <FormStatus state={feedback.state} className="pb-3" />
            <Button
              type="button"
              className={cn(PILL_SOLID, "w-full justify-center")}
              loading={isLoading}
              onClick={handleAscenciaSignIn}
            >
              Continuer avec Ascencia ID
            </Button>
          </div>
        )}
      </div>
      {authProvider === "builtin" && (
        <div className="text-sm text-muted-foreground">
          Vous n&apos;avez pas de compte ?{" "}
          <Button variant="link" className="h-auto px-0 py-0 text-emerald-700 dark:text-emerald-400" asChild>
            <a href="/register">Créer un compte</a>
          </Button>
        </div>
      )}
      <div className="text-pretty text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        En vous connectant, vous acceptez nos{" "}
        <a href="/legal/terms">Conditions Générales d&apos;Utilisation</a> et
        notre <a href="/legal/privacy">Politique de confidentialité</a>.
      </div>
    </form>
  );
}
