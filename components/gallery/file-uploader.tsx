"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export const FileUploader = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setProgress(0);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Erreur lors de l'upload");
        }

        const data = await response.json();
        toast.success(`Le fichier ${file.name} a été uploadé avec succès`);
        setProgress(100);
      } catch (error) {
        console.error("Erreur d'upload:", error);
        toast.error(`Erreur lors de l'upload de ${file.name}`);
      }
    }

    setIsUploading(false);
    setProgress(0);
    
    // Rafraîchir la page pour voir les nouveaux fichiers
    window.location.reload();
  };

  return (
    <div className="w-full p-4 border-2 border-dashed rounded-lg border-gray-300 dark:border-gray-700">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleUpload(e.target.files)}
        className="hidden"
        multiple
      />
      <div className="flex flex-col items-center justify-center gap-4">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full"
        >
          <Upload className="w-4 h-4 mr-2" />
          {isUploading ? "Upload en cours..." : "Sélectionner des fichiers"}
        </Button>
        {isUploading && (
          <Progress value={progress} className="w-full" />
        )}
      </div>
    </div>
  );
}; 