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
import { Loader2, ExternalLink } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";

interface AnimeTraceUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

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

  const fetchAnilistInfo = async (
    anilistId: number
  ): Promise<AnilistMedia | undefined> => {
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
      return data.data.Media;
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

      // Récupérer l'image
      const response = await fetch(fileInfo.url);
      const buffer = await response.arrayBuffer();
      const base64Image = Buffer.from(buffer).toString("base64");

      // Appeler directement l'API trace.moe
      const traceMoeResponse = await fetch("https://api.trace.moe/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64Image }),
      });

      if (!traceMoeResponse.ok) {
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
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>{t("modules.anime_trace.title")}</CardTitle>
        <CardDescription>
          {t("modules.anime_trace.description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md">
            {error}
          </div>
        )}

        {!isAnalyzing && results.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {t("modules.anime_trace.start_message")}
            </p>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>{t("modules.anime_trace.analyzing")}</p>
          </div>
        )}

        {results.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            {results.map((result, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger>
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium">
                      {result.anilistInfo?.title.romaji ||
                        result.anilistInfo?.title.english ||
                        t("modules.anime_trace.unknown_title")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t("modules.anime_trace.similarity", {
                        value: (result.similarity * 100).toFixed(2),
                      })}
                      %
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-4">
                    <div className="aspect-video relative rounded-lg overflow-hidden">
                      <img
                        src={result.image}
                        alt="Scene"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {result.anilistInfo && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-4">
                          <img
                            src={result.anilistInfo.coverImage.large}
                            alt="Cover"
                            className="w-24 h-36 object-cover rounded"
                          />
                          <div>
                            <p className="font-medium">
                              {result.anilistInfo.title.native}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {result.anilistInfo.seasonYear}{" "}
                              {result.anilistInfo.season}
                            </p>
                            <p className="text-sm">
                              {t("modules.anime_trace.episode", {
                                number: result.episode,
                              })}
                            </p>
                            <p className="text-sm">
                              {formatTime(result.from)} -{" "}
                              {formatTime(result.to)}
                            </p>
                          </div>
                        </div>

                        <Progress
                          value={result.anilistInfo.averageScore}
                          className="h-2"
                        />
                        <p className="text-sm text-muted-foreground">
                          {t("modules.anime_trace.score", {
                            score: result.anilistInfo.averageScore,
                          })}
                        </p>

                        <p className="text-sm">
                          {result.anilistInfo.description}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {result.anilistInfo.genres.map((genre) => (
                            <span
                              key={genre}
                              className="px-2 py-1 bg-primary/10 text-primary rounded text-xs"
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
                        onClick={() => window.open(result.video, "_blank")}
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
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => onComplete(fileInfo)}>
          {t("modules.anime_trace.cancel")}
        </Button>
        <Button onClick={handleAnalyze} disabled={isAnalyzing}>
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("modules.anime_trace.analyzing_button")}
            </>
          ) : (
            t("modules.anime_trace.analyze")
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
