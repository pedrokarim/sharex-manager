"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UseFormReturn } from "react-hook-form";
import { UploadConfig } from "@/schemas/upload-config";

interface StorageTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function StorageTab({ form }: StorageTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Configuration du stockage</CardTitle>
          <CardDescription>
            Paramètres de stockage des fichiers uploadés
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="storage.path"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chemin de stockage</FormLabel>
                <FormControl>
                  <Input value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="storage.structure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Structure des dossiers</FormLabel>
                <FormControl>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="flat"
                        value="flat"
                        checked={field.value === "flat"}
                        onChange={(e) => field.onChange(e.target.value as "flat" | "date" | "type")}
                      />
                      <Label htmlFor="flat">Plat</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="date"
                        value="date"
                        checked={field.value === "date"}
                        onChange={(e) => field.onChange(e.target.value as "flat" | "date" | "type")}
                      />
                      <Label htmlFor="date">Par date</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="type"
                        value="type"
                        checked={field.value === "type"}
                        onChange={(e) => field.onChange(e.target.value as "flat" | "date" | "type")}
                      />
                      <Label htmlFor="type">Par type</Label>
                    </div>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="storage.preserveFilenames"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>Préserver les noms de fichiers</FormLabel>
                <FormControl>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="storage.replaceExisting"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>Remplacer les fichiers existants</FormLabel>
                <FormControl>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="storage.thumbnailsPath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chemin des miniatures</FormLabel>
                <FormControl>
                  <Input value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="storage.dateFormat.folderStructure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Format de la structure des dossiers par date</FormLabel>
                  <FormControl>
                    <Input value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Format: YYYY/MM/DD
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storage.dateFormat.timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fuseau horaire</FormLabel>
                  <FormControl>
                    <Input value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Ex: Europe/Paris
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="storage.permissions.files"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissions des fichiers</FormLabel>
                  <FormControl>
                    <Input value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Ex: 0644
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storage.permissions.directories"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissions des dossiers</FormLabel>
                  <FormControl>
                    <Input value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Ex: 0755
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 