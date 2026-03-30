"use client";

import { useState } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  key: z.string().optional(),
  expiresAt: z.date().optional(),
  permissions: z.object({
    uploadImages: z.boolean(),
    uploadText: z.boolean(),
    uploadFiles: z.boolean(),
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function generateApiKey() {
  // Génère une clé de 32 caractères avec nanoid
  return `sk_${nanoid(32)}`;
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateApiKeyDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      permissions: {
        uploadImages: true,
        uploadText: false,
        uploadFiles: false,
      },
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error();

      toast.success("Clé API créée avec succès");
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error("Erreur lors de la création de la clé:", error);
      toast.error("Erreur lors de la création de la clé");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <DialogTitle>Créer une nouvelle clé API</DialogTitle>
          <DialogDescription>
            Créez une clé API pour permettre l'upload via ShareX
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
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
                      Utilisez un nom explicite pour repérer rapidement
                      l’intégration concernée.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <FormLabel>Clé (optionnelle)</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Laissez vide pour générer automatiquement"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const newKey = generateApiKey();
                          form.setValue("key", newKey);
                        }}
                        title="Générer une nouvelle clé"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormDescription>
                      Vous pouvez saisir votre propre clé ou en générer une
                      automatiquement
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem className="flex flex-col rounded-xl border border-border/60 bg-muted/20 p-4">
                    <FormLabel>Date d'expiration</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: fr })
                            ) : (
                              <span>Pas de date d'expiration</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <Label>Permissions</Label>
                <FormField
                  control={form.control}
                  name="permissions.uploadImages"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Upload d'images</FormLabel>
                        <FormDescription>
                          Permet l'upload de fichiers images (PNG, JPG, etc.)
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="permissions.uploadText"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Upload de texte</FormLabel>
                        <FormDescription>
                          Permet l'upload de fichiers texte (TXT, MD, etc.)
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="permissions.uploadFiles"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Upload de fichiers</FormLabel>
                        <FormDescription>
                          Permet l'upload de tout type de fichier
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t border-border/60 px-5 py-4 sm:px-6">
              <Button type="submit">Créer la clé</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
