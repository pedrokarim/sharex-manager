"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, BarChart3, Gamepad2, Database, Users } from "lucide-react";

interface CacheStats {
  playerCache: {
    size: number;
    max: number;
    calculatedSize: number;
  };
  usernameCache: {
    size: number;
    max: number;
    calculatedSize: number;
  };
}

interface AdminToolsPageClientProps {
  initialCacheStats: CacheStats;
}

export function AdminToolsPageClient({
  initialCacheStats,
}: AdminToolsPageClientProps) {
  const [cacheStats, setCacheStats] = useState<CacheStats>(initialCacheStats);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Gamepad2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Administration - Outils Minecraft
          </h1>
        </div>
        <p className="text-muted-foreground">
          Gestion du cache et des statistiques des outils Minecraft
        </p>
      </div>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Statistiques du cache */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Statistiques du cache
            </CardTitle>
            <CardDescription>
              État actuel du système de cache LRU
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cacheStats ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Cache des joueurs
                      </span>
                    </div>
                    <Badge variant="secondary">
                      {cacheStats.playerCache.size} /{" "}
                      {cacheStats.playerCache.max}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{
                        width: `${
                          (cacheStats.playerCache.size /
                            cacheStats.playerCache.max) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Cache des pseudos
                      </span>
                    </div>
                    <Badge variant="secondary">
                      {cacheStats.usernameCache.size} /{" "}
                      {cacheStats.usernameCache.max}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{
                        width: `${
                          (cacheStats.usernameCache.size /
                            cacheStats.usernameCache.max) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        Taille calculée (joueurs):
                      </span>
                      <p className="font-medium">
                        {cacheStats.playerCache.calculatedSize} bytes
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Taille calculée (pseudos):
                      </span>
                      <p className="font-medium">
                        {cacheStats.usernameCache.calculatedSize} bytes
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Aucune donnée disponible</p>
            )}

            <div className="text-sm text-muted-foreground">
              <p>
                Les statistiques sont mises à jour à chaque chargement de la
                page.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions d'administration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Actions d'administration
            </CardTitle>
            <CardDescription>Gestion du cache et maintenance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Vider le cache</h4>
              <p className="text-sm text-muted-foreground">
                Supprime toutes les données mises en cache. Cela forcera une
                nouvelle récupération des données depuis les APIs Mojang.
              </p>
              <Button variant="destructive" size="sm" disabled>
                <Trash2 className="h-4 w-4" />
                Vider le cache (désactivé)
              </Button>
              <p className="text-xs text-muted-foreground">
                Cette fonctionnalité nécessite un redémarrage du serveur pour
                des raisons de sécurité.
              </p>
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Informations</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Le cache des joueurs expire après 1 heure</p>
                <p>• Le cache des pseudos expire après 30 minutes</p>
                <p>• Capacité maximale : 1000 joueurs, 2000 pseudos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
