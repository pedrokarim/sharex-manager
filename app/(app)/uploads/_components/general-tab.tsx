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
import { UseFormReturn } from "react-hook-form";
import { UploadConfig } from "@/schemas/upload-config";

interface GeneralTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function GeneralTab({ form }: GeneralTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Types de fichiers autorisés</CardTitle>
          <CardDescription>
            Définissez les types de fichiers qui peuvent être uploadés
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="allowedTypes.images"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>Images (jpg, png, gif, webp)</FormLabel>
                <FormControl>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="allowedTypes.documents"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>Documents (pdf, doc, txt)</FormLabel>
                <FormControl>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="allowedTypes.archives"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>Archives (zip, rar)</FormLabel>
                <FormControl>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limites</CardTitle>
          <CardDescription>
            Configurez les limites pour les uploads
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="limits.maxFileSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taille maximale des fichiers (MB)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.minFileSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taille minimale des fichiers (KB)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerUpload"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre maximum de fichiers par upload</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerType.images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Images</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerType.documents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documents</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerType.archives"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Archives</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Format du nom de fichier</CardTitle>
          <CardDescription>
            Configurez le format des noms de fichiers uploadés
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="filenamePattern"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Format du nom de fichier</FormLabel>
                <FormControl>
                  <Input value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
                <FormDescription>
                  Variables disponibles: {"{timestamp}"}, {"{original}"}, {"{random}"}
                </FormDescription>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
} 