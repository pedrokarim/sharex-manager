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
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ModuleUploadProps {
  onUploadSuccess: () => void;
}

export const ModuleUpload = ({ onUploadSuccess }: ModuleUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [iconUrl, setIconUrl] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [iconTab, setIconTab] = useState<string>("url");

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
      <CardContent className="space-y-6">
        {!file ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-gray-300 hover:border-primary"
            }`}
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
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {file && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-medium">
                Icône du module (optionnel)
              </h3>
            </div>

            <Tabs
              defaultValue="url"
              onValueChange={setIconTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-1">
                <TabsTrigger value="url">URL de l'image</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="icon-url">URL de l'icône</Label>
                  <Input
                    id="icon-url"
                    placeholder="https://exemple.com/icone.png"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Entrez l'URL d'une image pour l'utiliser comme icône du
                    module
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {iconUrl && (
              <div className="mt-4 flex justify-center">
                <div className="h-16 w-16 rounded-md overflow-hidden border">
                  <img
                    src={iconUrl}
                    alt="Aperçu de l'icône"
                    className="h-full w-full object-cover"
                    onError={() => {
                      toast.error("Impossible de charger l'image");
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full"
        >
          {isUploading ? "Installation en cours..." : "Installer le module"}
        </Button>
      </CardFooter>
    </Card>
  );
};
