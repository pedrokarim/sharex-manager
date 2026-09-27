"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { FileArchive, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ModuleUploadProps {
  onUploadSuccess: () => void;
}

export const ModuleUpload = ({ onUploadSuccess }: ModuleUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [iconUrl, setIconUrl] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
      }
    },
  });

  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("module", file);

      // Ajouter l'URL de l'icône si elle est définie
      if (iconUrl) {
        formData.append("iconUrl", iconUrl);
      }

      const response = await fetch("/api/modules/install", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erreur lors de l'installation du module"
        );
      }

      toast.success("Module installé avec succès");
      setFile(null);
      setIconUrl("");
      onUploadSuccess();
    } catch (error) {
      console.error("Erreur lors de l'installation du module:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Erreur lors de l'installation du module"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Installer un nouveau module</CardTitle>
        <CardDescription>
          Téléchargez un fichier ZIP contenant un module compatible
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!file ? (
          <div
            {...getRootProps()}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/60 hover:bg-muted/40"
            )}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {isDragActive
                ? "Déposez le fichier ici..."
                : "Glissez-déposez un fichier ZIP ici, ou cliquez pour sélectionner un fichier"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Seuls les fichiers ZIP sont acceptés
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileArchive className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} Ko
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Retirer le fichier"
              onClick={handleRemoveFile}
              className="h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {file && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="icon-url">Icône du module (facultatif)</Label>
              <Input
                id="icon-url"
                placeholder="https://exemple.com/icone.png"
                value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                URL d&apos;une image carrée. Sans elle, le module reçoit une
                icône générique.
              </p>
            </div>

            {iconUrl && (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={iconUrl}
                  alt="Aperçu de l'icône"
                  className="h-full w-full object-cover"
                  onError={() => toast.error("Impossible de charger l'image")}
                />
              </div>
            )}
          </div>
        )}

      </CardContent>
      <CardFooter className="justify-end">
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full sm:w-auto"
        >
          {isUploading ? "Installation en cours…" : "Installer le module"}
        </Button>
      </CardFooter>
    </Card>
  );
};
