"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { X, Trash2, Upload, XCircle, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileWithPreview extends File {
  preview?: string;
  id: string;
}

interface UploadZoneProps {
  children: React.ReactNode;
}

export const UploadZone = ({ children }: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<FileWithPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filesWithPreview = acceptedFiles.map(file => 
      Object.assign(file, {
        preview: URL.createObjectURL(file),
        id: Math.random().toString(36).substring(7)
      })
    );
    setFilesToUpload(prev => [...prev, ...filesWithPreview]);
    setIsDragging(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    noClick: true
  });

  const removeFile = (fileId: string) => {
    setFilesToUpload(files => {
      const remainingFiles = files.filter(f => f.id !== fileId);
      files
        .filter(f => f.id === fileId)
        .forEach(f => f.preview && URL.revokeObjectURL(f.preview));
      return remainingFiles;
    });
  };

  const clearFiles = () => {
    filesToUpload.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
    setFilesToUpload([]);
  };

  const uploadFiles = async () => {
    setIsUploading(true);
    setUploadProgress(0);

    const totalFiles = filesToUpload.length;
    let uploadedFiles = 0;

    for (const file of filesToUpload) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/gallery/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Erreur lors de l'upload de ${file.name}`);
        }

        const data = await response.json();
        uploadedFiles++;
        setUploadProgress((uploadedFiles / totalFiles) * 100);
        toast.success(`${file.name} uploadé avec succès`);
      } catch (error: any) {
        console.error("Erreur d'upload:", error);
        toast.error(error.message || `Erreur lors de l'upload de ${file.name}`);
      }
    }

    setIsUploading(false);
    clearFiles();
    window.location.reload();
  };

  return (
    <div
      {...getRootProps()}
      className="relative w-full h-full"
    >
      <input {...getInputProps()} />
      
      {/* Le contenu de la galerie */}
      {children}
      
      {/* Bouton flottant pour sélectionner les fichiers */}
      <Button
        size="lg"
        className="fixed bottom-6 right-6 shadow-lg z-40"
        onClick={(e) => {
          e.stopPropagation();
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'image/*';
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) {
              onDrop(Array.from(files));
            }
          };
          input.click();
        }}
      >
        <Upload className="w-4 h-4 mr-2" />
        Ajouter des images
      </Button>
      
      {/* Overlay de drop */}
      {isDragActive && (
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background/95 p-8 rounded-lg shadow-lg text-center border-2 border-dashed border-primary">
            <Upload className="w-16 h-16 mx-auto mb-4 text-primary animate-bounce" />
            <h3 className="text-2xl font-semibold">Déposez vos fichiers ici</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Formats supportés: PNG, JPG, GIF, WEBP
            </p>
          </div>
        </div>
      )}

      {/* Liste des fichiers à uploader */}
      {filesToUpload.length > 0 && (
        <div className="fixed top-0 right-0 bottom-0 w-96 bg-background border-l shadow-lg z-50 flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Fichiers à uploader ({filesToUpload.length})
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFiles}
                disabled={isUploading}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFiles}
                disabled={isUploading}
                className="flex-1"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Tout supprimer
              </Button>
              <Button
                size="sm"
                onClick={uploadFiles}
                disabled={isUploading || filesToUpload.length === 0}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isUploading ? "Upload en cours..." : "Uploader"}
              </Button>
            </div>
            {isUploading && (
              <Progress value={uploadProgress} className="w-full mt-4" />
            )}
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2">
              {filesToUpload.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-muted/50 group relative"
                >
                  <div className="w-8 h-8 rounded-md border bg-background overflow-hidden flex-shrink-0">
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image className="w-4 h-4 m-2 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate max-w-[160px]">{file.name}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    className="flex-shrink-0 h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Bouton pour ajouter plus d'images */}
          <div className="p-4 border-t mt-auto">
            <Button
              variant="outline"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'image/*';
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files) {
                    onDrop(Array.from(files));
                  }
                };
                input.click();
              }}
              disabled={isUploading}
            >
              <Image className="w-4 h-4 mr-2" />
              Ajouter plus d'images
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}; 