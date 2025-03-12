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
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";
import { EnrichedAnimeResult, TraceMoeResponse, AnilistMedia } from "./types";
import { Loader2, ExternalLink, Upload } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useLocalCache } from "./hooks/useLocalCache";
import { createHash } from "crypto";

interface AnimeTraceUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

// Configuration du cache
const CACHE_CONFIG = {
  ttl: 24 * 60 * 60 * 1000, // 24 heures
  maxEntries: 50, // Maximum 50 entrées en cache
};

export default function AnimeTraceUI({
  fileInfo,
  onComplete,
}: AnimeTraceUIProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<EnrichedAnimeResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Enregistrer les traductions du module
  useModuleTranslations("anime_trace", moduleTranslations);
  const { t } = useTranslation();

  // Créer une clé de cache unique basée sur l'URL de l'image
  const generateCacheKey = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const hash = createHash("md5").update(Buffer.from(buffer)).digest("hex");
    return `image_${hash}`;
  };

  const fetchAnilistInfo = async (
    anilistId: number
  ): Promise<AnilistMedia | undefined> => {
    // Cache pour les informations Anilist
    const anilistCache = useLocalCache<AnilistMedia>(
      `anilist_${anilistId}`,
      CACHE_CONFIG
    );

    // Vérifier le cache
    const cachedData = anilistCache.get();
    if (cachedData) {
      return cachedData;
    }

    try {
      const query = `
        query ($id: Int) {
          Media (id: $id, type: ANIME) {
            id
            title {
              native
              romaji
              english
            }
            coverImage {
              large
            }
            season
            seasonYear
            episodes
            duration
            genres
            averageScore
            description
          }
        }
      `;

      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { id: anilistId },
        }),
      });

      const data = await response.json();
      const anilistInfo = data.data.Media;

      // Sauvegarder dans le cache
      if (anilistInfo) {
        anilistCache.set(anilistInfo);
      }

      return anilistInfo;
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des informations Anilist:",
        error
      );
      return undefined;
    }
  };

  const handleAnalyze = async () => {
    try {
      setIsAnalyzing(true);
      setError(null);

      // Générer la clé de cache
      const cacheKey = await generateCacheKey(fileInfo.url);
      const resultsCache = useLocalCache<EnrichedAnimeResult[]>(
        cacheKey,
        CACHE_CONFIG
      );

      // Vérifier le cache
      const cachedResults = resultsCache.get();
      if (cachedResults) {
        setResults(cachedResults);
        return;
      }

      // Récupérer l'image
      const response = await fetch(fileInfo.url);
      const blob = await response.blob();

      // Vérifier la taille de l'image (limite de 25MB)
      if (blob.size > 25 * 1024 * 1024) {
        throw new Error(t("modules.anime_trace.errors.image_too_large"));
      }

      // Créer un FormData et ajouter l'image
      const formData = new FormData();
      formData.append("image", blob);

      // Appeler directement l'API trace.moe avec FormData
      const traceMoeResponse = await fetch("https://api.trace.moe/search", {
        method: "POST",
        body: formData,
      });

      if (!traceMoeResponse.ok) {
        if (traceMoeResponse.status === 413) {
          throw new Error(t("modules.anime_trace.errors.image_too_large"));
        }
        throw new Error(t("modules.anime_trace.errors.analysis_failed"));
      }

      const data: TraceMoeResponse = await traceMoeResponse.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Filtrer les résultats par similarité (seuil de 0.85 par défaut)
      const filteredResults = data.result.filter((r) => r.similarity >= 0.85);

      // Enrichir les résultats avec les informations Anilist
      const enrichedResults = await Promise.all(
        filteredResults.map(async (result) => {
          const anilistInfo = await fetchAnilistInfo(result.anilist);
          return {
            ...result,
            anilistInfo,
          };
        })
      );

      // Sauvegarder dans le cache
      resultsCache.set(enrichedResults);
      setResults(enrichedResults);
    } catch (error) {
      console.error("Erreur lors de l'analyse:", error);
      setError(
        error instanceof Error
          ? error.message
          : t("modules.anime_trace.errors.unknown")
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="w-full max-w-7xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {t("modules.anime_trace.title")}
        </CardTitle>
        <CardDescription className="text-lg">
          {t("modules.anime_trace.description")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-8">
          {/* Colonne de gauche : Image source */}
          <div className="space-y-6">
            <div className="sticky top-0">
              <div className="text-lg font-medium mb-4">
                {t("modules.anime_trace.source_image")}
              </div>
              <div className="flex flex-col space-y-4">
                <div className="border rounded-lg overflow-hidden bg-muted/10">
                  <img
                    src={fileInfo.url}
                    alt="Image à analyser"
                    className="w-full h-auto object-contain bg-black/10"
                  />
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  {fileInfo.name} ({(fileInfo.size / 1024 / 1024).toFixed(2)}{" "}
                  MB)
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  size="lg"
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("modules.anime_trace.analyzing_button")}
                    </>
                  ) : (
                    t("modules.anime_trace.analyze")
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Colonne de droite : Résultats */}
          <div className="space-y-6">
            {error && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-md">
                {error}
              </div>
            )}

            {!isAnalyzing && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 py-12">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="text-lg text-muted-foreground text-center">
                  {t("modules.anime_trace.start_message")}
                </p>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 py-12">
                <Loader2 className="h-12 w-12 animate-spin" />
                <p className="text-lg">{t("modules.anime_trace.analyzing")}</p>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="text-lg font-medium mb-4">
                  {t("modules.anime_trace.results_title")}
                </div>
                <Accordion type="single" collapsible className="w-full">
                  {results.map((result, index) => (
                    <AccordionItem key={index} value={`item-${index}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-lg">
                            {result.anilistInfo?.title.romaji ||
                              result.anilistInfo?.title.english ||
                              t("modules.anime_trace.unknown_title")}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {t("modules.anime_trace.similarity", {
                              value: Math.round(result.similarity * 100),
                            })}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-6 pt-4">
                          <div className="aspect-video relative rounded-lg overflow-hidden">
                            <img
                              src={result.image}
                              alt="Scene"
                              className="w-full h-full object-contain bg-black/10"
                            />
                          </div>

                          {result.anilistInfo && (
                            <div className="space-y-4">
                              <div className="flex items-start gap-6">
                                <img
                                  src={result.anilistInfo.coverImage.large}
                                  alt="Cover"
                                  className="w-32 h-48 object-cover rounded-lg"
                                />
                                <div className="space-y-2 flex-1">
                                  <p className="font-medium text-lg">
                                    {result.anilistInfo.title.native}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {result.anilistInfo.seasonYear}{" "}
                                    {result.anilistInfo.season}
                                  </p>
                                  <p>
                                    {t("modules.anime_trace.episode", {
                                      number: result.episode,
                                    })}
                                  </p>
                                  <p className="text-sm">
                                    {formatTime(result.from)} -{" "}
                                    {formatTime(result.to)}
                                  </p>

                                  <div className="mt-4">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-medium">
                                        {t("modules.anime_trace.score", {
                                          score:
                                            result.anilistInfo.averageScore,
                                        })}
                                      </span>
                                    </div>
                                    <Progress
                                      value={result.anilistInfo.averageScore}
                                      className="h-2"
                                    />
                                  </div>
                                </div>
                              </div>

                              <p className="text-sm leading-relaxed">
                                {result.anilistInfo.description}
                              </p>

                              <div className="flex flex-wrap gap-2">
                                {result.anilistInfo.genres.map((genre) => (
                                  <span
                                    key={genre}
                                    className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                                  >
                                    {genre}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                window.open(result.video, "_blank")
                              }
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              {t("modules.anime_trace.view_scene")}
                            </Button>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end pt-6">
        <Button variant="outline" onClick={() => onComplete(fileInfo)}>
          {t("modules.anime_trace.cancel")}
        </Button>
      </CardFooter>
    </Card>
  );
}
