"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { DEFAULT_PASSWORD_MIN_LENGTH } from "@/lib/security/settings-schema";

/**
 * Longueur minimale lue dans les réglages de sécurité : le serveur applique
 * de toute façon la politique complète (mots de passe courants compris).
 * Pour une modification, un mot de passe vide garde l'actuel.
 */
function userFormSchema(minPasswordLength: number, editing: boolean) {
  const tooShort = `Le mot de passe doit faire au moins ${minPasswordLength} caractères`;
  return z.object({
    username: z
      .string()
      .min(3, "Le nom d'utilisateur doit faire au moins 3 caractères"),
    password: editing
      ? z.string().refine((value) => value === "" || value.length >= minPasswordLength, tooShort)
      : z.string().min(minPasswordLength, tooShort),
    role: z.enum(["admin", "user"], {
      error: "Veuillez sélectionner un rôle",
    }),
  });
}

type UserFormValues = z.infer<ReturnType<typeof userFormSchema>>;

/** Longueur minimale en vigueur, ou la valeur par défaut tant qu'elle n'est pas connue. */
function useMinPasswordLength() {
  const [minLength, setMinLength] = useState(DEFAULT_PASSWORD_MIN_LENGTH);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/security/settings", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { settings?: { passwords?: { minLength?: number } } } | null) => {
        const value = data?.settings?.passwords?.minLength;
        if (typeof value === "number") setMinLength(value);
      })
      .catch(() => {
        // Réglages indisponibles : la valeur par défaut reste, le serveur tranche.
      });
    return () => controller.abort();
  }, []);
  return minLength;
}

interface UserFormProps {
  user?: {
    id: string;
    username: string;
    role: "admin" | "user";
  };
  onSuccess?: () => void;
}

export function UserForm({ user, onSuccess }: UserFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  // L'échec se lit dans la fenêtre, au-dessus du bouton ; la réussite se voit
  // à la liste mise à jour, la fenêtre se refermant.
  const feedback = useFeedback();
  const minPasswordLength = useMinPasswordLength();
  const schema = useMemo(() => userFormSchema(minPasswordLength, Boolean(user)), [minPasswordLength, user]);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(schema),
    defaultValues: user
      ? {
          username: user.username,
          password: "",
          role: user.role,
        }
      : {
          username: "",
          password: "",
          role: "user",
        },
  });

  async function onSubmit(data: UserFormValues) {
    setIsLoading(true);
    feedback.clear();
    try {
      const response = await fetch("/api/admin/users", {
        method: user ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(user ? { ...data, id: user.id } : data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Une erreur est survenue");
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      feedback.error(
        errorMessage(
          error,
          user
            ? "L’utilisateur n’a pas pu être modifié. Réessayez."
            : "L’utilisateur n’a pas pu être créé. Réessayez.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        // Corriger sa saisie retire le message d'erreur.
        onChange={feedback.state?.tone === "error" ? feedback.clear : undefined}
        className="space-y-0"
      >
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel>Nom d'utilisateur</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  Nom visible dans l’interface et utilisé pour les recherches.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel>
                  {user ? "Nouveau mot de passe" : "Mot de passe"}
                </FormLabel>
                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>
                <FormDescription>
                  {user
                    ? "Laissez vide pour conserver le mot de passe actuel."
                    : `Au moins ${minPasswordLength} caractères ; les mots de passe trop courants sont refusés.`}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel>Rôle</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez un rôle" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="user">Utilisateur</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Réservez le rôle administrateur aux accès de supervision.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormStatus state={feedback.state} className="px-5 pb-4 sm:px-6" />

        <div className="flex justify-end border-t border-border/60 px-5 py-4 sm:px-6">
          <Button type="submit" disabled={isLoading}>
            {isLoading
              ? "Chargement..."
              : user
                ? "Modifier l'utilisateur"
                : "Créer l'utilisateur"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
