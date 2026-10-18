"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { readApiError } from "@/lib/utils/chunk";
import type { ApiKeyPolicy, CreatedApiKey } from "@/types/api-key";

const NEVER = "never";

/** Durées proposées, en jours, avant filtrage par la durée maximale de l'écran Sécurité. */
const EXPIRY_CHOICES = [7, 30, 90, 180, 365, 730];

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est requis").max(100),
    expiry: z.string(),
    permissions: z.object({
      uploadImages: z.boolean(),
      uploadText: z.boolean(),
      uploadFiles: z.boolean(),
      extractColors: z.boolean(),
    }),
  })
  .refine((value) => Object.values(value.permissions).some(Boolean), {
    message: "Choisissez au moins une permission.",
    path: ["permissions"],
  });

type FormValues = z.infer<typeof formSchema>;

const PERMISSION_FIELDS: { name: keyof FormValues["permissions"]; label: string; description: string }[] = [
  { name: "uploadImages", label: "Upload d'images", description: "Permet l'upload de fichiers images (PNG, JPG, etc.)" },
  { name: "uploadText", label: "Upload de texte", description: "Permet l'upload de fichiers texte (TXT, PDF, etc.)" },
  { name: "uploadFiles", label: "Upload de fichiers", description: "Permet l'upload de tout autre type de fichier" },
  {
    name: "extractColors",
    label: "Extraction de couleurs",
    description: "Permet d’extraire la palette d’une image (/api/colors)",
  },
];

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reçoit la clé créée, avec la clé complète : c'est la seule fois qu'elle est remise. */
  onCreated: (created: CreatedApiKey) => void;
}

function durationLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? "1 an" : `${days / 365} ans`;
  if (days % 30 === 0 && days >= 30) return `${days / 30} mois`;
  return days === 1 ? "1 jour" : `${days} jours`;
}

/** Durées permises par les réglages : jamais au-delà du maximum, « sans expiration » seulement sans maximum. */
function expiryOptions(policy: ApiKeyPolicy | null) {
  const max = policy?.maxExpiryDays ?? null;
  const days = new Set(EXPIRY_CHOICES.filter((value) => max === null || value <= max));
  if (max !== null) days.add(max);
  if (policy?.defaultExpiryDays) days.add(policy.defaultExpiryDays);
  const options = [...days].sort((a, b) => a - b).map((value) => ({ value: String(value), label: durationLabel(value) }));
  if (max === null) options.push({ value: NEVER, label: "Sans expiration" });
  return options;
}

function defaultExpiry(policy: ApiKeyPolicy | null): string {
  if (!policy) return "90";
  if (policy.defaultExpiryDays !== null) return String(policy.defaultExpiryDays);
  return policy.maxExpiryDays === null ? NEVER : String(policy.maxExpiryDays);
}

export function CreateApiKeyDialog({ open, onOpenChange, onCreated }: CreateApiKeyDialogProps) {
  const [policy, setPolicy] = useState<ApiKeyPolicy | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      expiry: defaultExpiry(null),
      permissions: {
        uploadImages: true,
        uploadText: false,
        uploadFiles: false,
        extractColors: false,
      },
    },
  });

  // Les durées permises viennent de l'écran Sécurité ; le serveur les
  // applique de toute façon.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/api-keys/policy")
      .then((response) => (response.ok ? (response.json() as Promise<ApiKeyPolicy>) : null))
      .then((value) => {
        if (cancelled || !value) return;
        setPolicy(value);
        form.setValue("expiry", defaultExpiry(value));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, form]);

  const options = useMemo(() => expiryOptions(policy), [policy]);

  // L'échec se lit dans la fenêtre, au-dessus du bouton ; la réussite ouvre
  // la clé créée, à copier tout de suite.
  const feedback = useFeedback();

  const onSubmit = async (data: FormValues) => {
    feedback.clear();
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          permissions: data.permissions,
          expiresInDays: data.expiry === NEVER ? null : Number(data.expiry),
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "La clé n’a pas pu être créée. Réessayez."));
      }

      const created = (await response.json()) as CreatedApiKey;
      onCreated(created);
      onOpenChange(false);
      form.reset({ ...form.getValues(), name: "" });
    } catch (error) {
      console.error("Erreur lors de la création de la clé:", error);
      feedback.error(errorMessage(error, "La clé n’a pas pu être créée. Réessayez."));
    }
  };

  const permissionsError = form.formState.errors.permissions?.root?.message ?? form.formState.errors.permissions?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <DialogTitle>Créer une nouvelle clé API</DialogTitle>
          <DialogDescription>
            Le serveur génère la clé. Elle ne s’affiche qu’une fois, juste après la création.
          </DialogDescription>
        </DialogHeader>

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
                name="name"
                render={({ field }) => (
                  <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input placeholder="ShareX Upload Key" {...field} />
                    </FormControl>
                    <FormDescription>
                      Utilisez un nom explicite pour repérer rapidement l’intégration concernée.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem className="min-w-0 rounded-xl border border-border/60 bg-muted/20 p-4">
                    <FormLabel>Durée de validité</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue placeholder="Choisir une durée" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {policy?.maxExpiryDays
                        ? `Les réglages de sécurité limitent la durée à ${durationLabel(policy.maxExpiryDays)}.`
                        : "La clé cesse de fonctionner à la fin de cette durée."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <Label>Permissions</Label>
                {PERMISSION_FIELDS.map((permission) => (
                  <FormField
                    key={permission.name}
                    control={form.control}
                    name={`permissions.${permission.name}`}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border/60 bg-background px-4 py-3">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </FormControl>
                        <div className="min-w-0 space-y-1 leading-none">
                          <FormLabel>{permission.label}</FormLabel>
                          <FormDescription>{permission.description}</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                ))}
                {permissionsError ? (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {permissionsError}
                  </p>
                ) : null}
              </div>
            </div>

            <FormStatus state={feedback.state} className="px-5 pb-4 sm:px-6" />

            <DialogFooter className="border-t border-border/60 px-5 py-4 sm:px-6">
              <Button type="submit" className="w-full sm:w-auto" loading={form.formState.isSubmitting}>
                Créer la clé
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
