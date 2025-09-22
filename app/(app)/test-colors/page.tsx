"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, Palette } from "lucide-react";

export default function TestColorsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const testColorExtraction = async () => {
    if (!file) {
      setError("Veuillez sélectionner un fichier");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      // Pas de clé API - on utilise la session utilisateur

      const response = await fetch("/api/colors", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'extraction");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Test d'extraction de couleurs
        </h1>
        <p className="text-muted-foreground">
          Testez l'API d'extraction de couleurs dominantes avec vos images
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload d'image
            </CardTitle>
            <CardDescription>
              Sélectionnez une image pour tester l'extraction de couleurs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="image">Image</Label>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-1"
              />
            </div>

            {file && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Fichier sélectionné : {file.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Taille : {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="text-sm text-muted-foreground">
                  Type : {file.type}
                </p>
              </div>
            )}

            <Button
              onClick={testColorExtraction}
              disabled={!file || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extraction en cours...
                </>
              ) : (
                <>
                  <Palette className="mr-2 h-4 w-4" />
                  Extraire les couleurs
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle>Résultats</CardTitle>
            <CardDescription>Couleurs extraites de l'image</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Couleur dominante</h3>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-gray-300"
                      style={{ backgroundColor: result.colors.dominant }}
                    />
                    <div>
                      <p className="font-mono text-sm">
                        {result.colors.dominant}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.colors.isDark
                          ? "Couleur sombre"
                          : "Couleur claire"}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Palette complète</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.colors.palette.map(
                      (color: string, index: number) => (
                        <div
                          key={index}
                          className="flex flex-col items-center gap-1"
                        >
                          <div
                            className="w-8 h-8 rounded border border-gray-300"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-xs font-mono">{color}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-2">Détails techniques</h3>
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Succès :</strong> {result.success ? "Oui" : "Non"}
                    </p>
                    <p>
                      <strong>Nombre de couleurs :</strong>{" "}
                      {result.colors.palette.length}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!result && !error && (
              <p className="text-muted-foreground text-center py-8">
                Sélectionnez une image et cliquez sur "Extraire les couleurs"
                pour voir les résultats
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Section */}
      {file && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Aperçu de l'image</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <img
                src={URL.createObjectURL(file)}
                alt="Aperçu"
                className="max-w-full max-h-64 rounded-lg border"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
