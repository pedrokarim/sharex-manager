"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useQueryState } from "nuqs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Download,
  Search,
  User,
  Copy,
  Check,
  History,
  Flame,
  Clock,
  BookOpen,
} from "lucide-react";
import { MinecraftSkin3DVanilla } from "@/components/minecraft/minecraft-skin-3d";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

interface PlayerData {
  uuid: string;
  username: string;
  skinUrl?: string;
  capeUrl?: string;
  isSlim?: boolean;
}

interface NameHistoryEntry {
  name: string;
  changedToAt?: number;
}

interface NameHistoryData {
  uuid: string;
  source: string;
  note?: string;
  names: NameHistoryEntry[];
}

interface RecentSkin {
  uuid: string;
  username: string;
  searchedAt: string;
  isSlim: boolean;
}

interface FeaturedSkin {
  uuid: string;
  username: string;
}

interface MinecraftSkinPageClientProps {
  initialUsername?: string;
}

function SkinThumbnailGrid({
  skins,
  onSelect,
  loading,
  emptyMessage,
}: {
  skins: { uuid: string; username: string }[];
  onSelect: (username: string) => void;
  loading: boolean;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (skins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
      {skins.map((skin) => (
        <button
          key={skin.uuid}
          onClick={() => onSelect(skin.username)}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-full aspect-[1/2] bg-muted rounded-lg flex items-center justify-center overflow-hidden group-hover:ring-2 group-hover:ring-primary transition-all">
            <img
              src={`/api/tools/minecraft-skin/mcbody.png?skin=${skin.uuid}`}
              alt={skin.username}
              className="max-w-full max-h-full object-contain"
              loading="lazy"
            />
          </div>
          <span className="text-xs font-medium truncate w-full text-center group-hover:text-primary transition-colors">
            {skin.username}
          </span>
        </button>
      ))}
    </div>
  );
}

function MinecraftSkinPageContent({
  initialUsername,
}: MinecraftSkinPageClientProps) {
  const [username, setUsername] = useQueryState("username", {
    defaultValue: "",
  });

  const [searchInput, setSearchInput] = useState(initialUsername || "");
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Server-rendered images
  const [generatedImages, setGeneratedImages] = useState<{
    head?: string;
    body?: string;
    skin?: string;
    cape?: string;
  }>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>(
    {}
  );

  // Name history
  const [nameHistory, setNameHistory] = useState<NameHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Recent skins
  const [recentSkins, setRecentSkins] = useState<RecentSkin[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Featured skins
  const [featuredSkins, setFeaturedSkins] = useState<FeaturedSkin[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  // API health status: null = checking, true = up, false = down
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  // Fetch recent & featured on mount
  useEffect(() => {
    fetchRecentSkins();
    fetchFeaturedSkins();
  }, []);

  // Health check on mount + poll every 30s
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/tools/minecraft-skin/health");
        setApiHealthy(res.ok);
      } catch {
        setApiHealthy(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecentSkins = async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/tools/minecraft-skin/recent");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setRecentSkins(data.skins);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingRecent(false);
    }
  };

  const fetchFeaturedSkins = async () => {
    setLoadingFeatured(true);
    try {
      const res = await fetch("/api/tools/minecraft-skin/featured");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setFeaturedSkins(data.skins);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingFeatured(false);
    }
  };

  const saveRecentSkin = useCallback(async (player: PlayerData) => {
    try {
      await fetch("/api/tools/minecraft-skin/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: player.uuid,
          username: player.username,
          isSlim: player.isSlim,
        }),
      });
      // Refresh recent list
      fetchRecentSkins();
    } catch {
      // Silent fail
    }
  }, []);

  const searchPlayer = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        setSearchError("Veuillez entrer un pseudo Minecraft");
        return;
      }

      setIsSearching(true);
      setSearchError(null);
      setPlayerData(null);
      setGeneratedImages({});
      setNameHistory(null);

      try {
        const response = await fetch(
          `/api/tools/minecraft-skin/player?username=${encodeURIComponent(
            name.trim()
          )}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erreur lors de la recherche");
        }

        if (data.success && data.data) {
          const player = data.data;
          setPlayerData(player);
          setSearchInput(player.username);
          setUsername(player.username);

          // Auto-generate server images
          generateAllImages(player.uuid);

          // Fetch name history
          fetchNameHistory(player.uuid);

          // Save to recent skins
          saveRecentSkin(player);
        } else {
          throw new Error("Joueur non trouve");
        }
      } catch (err) {
        setSearchError(
          err instanceof Error ? err.message : "Une erreur est survenue"
        );
      } finally {
        setIsSearching(false);
      }
    },
    [setUsername, saveRecentSkin]
  );

  // Auto-search on load if username provided
  useEffect(() => {
    const name = initialUsername || username;
    if (name) {
      setSearchInput(name);
      searchPlayer(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateImage = useCallback(
    async (type: "head" | "body" | "skin" | "cape", uuid: string) => {
      setLoadingImages((prev) => ({ ...prev, [type]: true }));

      try {
        const params = new URLSearchParams();
        params.set("skin", uuid);

        const endpoint =
          type === "cape"
            ? "mccape"
            : type === "head"
            ? "mchead"
            : type === "skin"
            ? "mcskin"
            : "mcbody";

        const response = await fetch(
          `/api/tools/minecraft-skin/${endpoint}.png?${params}`
        );

        if (!response.ok) return;

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        setGeneratedImages((prev) => ({ ...prev, [type]: imageUrl }));
      } catch {
        // Silent fail for individual images
      } finally {
        setLoadingImages((prev) => ({ ...prev, [type]: false }));
      }
    },
    []
  );

  const generateAllImages = useCallback(
    (uuid: string) => {
      generateImage("head", uuid);
      generateImage("body", uuid);
      generateImage("skin", uuid);
      generateImage("cape", uuid);
    },
    [generateImage]
  );

  const fetchNameHistory = useCallback(async (uuid: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(
        `/api/tools/minecraft-skin/namehistory?uuid=${encodeURIComponent(uuid)}`
      );
      if (response.ok) {
        const data = await response.json();
        setNameHistory(data);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const downloadImage = useCallback(
    (type: string, imageUrl: string) => {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `minecraft-${type}-${
        playerData?.username || "skin"
      }.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [playerData?.username]
  );

  const downloadTexture = useCallback(
    (type: "skin" | "cape") => {
      if (!playerData?.uuid) return;
      const url = `/api/tools/minecraft-skin/texture/${type}?skin=${encodeURIComponent(
        playerData.uuid
      )}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = `minecraft-${type}-texture-${playerData.username}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [playerData]
  );

  const copyUuid = useCallback(() => {
    if (!playerData?.uuid) return;
    navigator.clipboard.writeText(playerData.uuid);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  }, [playerData?.uuid]);

  const handleSelectSkin = useCallback(
    (name: string) => {
      setSearchInput(name);
      searchPlayer(name);
    },
    [searchPlayer]
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      {/* Search bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Entrez un pseudo Minecraft (ex: Notch)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchPlayer(searchInput)}
                disabled={isSearching}
                className="pl-10 h-12 text-lg"
              />
            </div>
            <Button
              onClick={() => searchPlayer(searchInput)}
              disabled={isSearching || !searchInput.trim()}
              size="lg"
              className="h-12 px-8"
            >
              {isSearching ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Rechercher
                </>
              )}
            </Button>
          </div>

          {/* API status + Doc link */}
          <div className="flex items-center justify-between mt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        apiHealthy === null
                          ? "bg-yellow-500 animate-pulse"
                          : apiHealthy
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />
                    Render API
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {apiHealthy === null
                    ? "Verification du statut de l'API..."
                    : apiHealthy
                    ? "L'API de rendu est operationnelle"
                    : "L'API de rendu est injoignable"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Link
              href="/tools/minecraft-skin/api"
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <BookOpen className="h-3 w-3" />
              Documentation API
            </Link>
          </div>

          {searchError && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{searchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Featured skins */}
      {!playerData && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                Skins en vedette
                <Badge variant="secondary" className="text-xs">
                  Trending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SkinThumbnailGrid
                skins={featuredSkins}
                onSelect={handleSelectSkin}
                loading={loadingFeatured}
                emptyMessage="Aucun skin en vedette disponible"
              />
            </CardContent>
          </Card>

          {/* Recent skins */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Skins recemment recherches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SkinThumbnailGrid
                skins={recentSkins}
                onSelect={handleSelectSkin}
                loading={loadingRecent}
                emptyMessage="Aucune recherche recente. Recherchez un joueur pour commencer !"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Main content: 3D viewer + player info */}
      {playerData && (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            {/* 3D Viewer - takes 3 cols */}
            <Card className="lg:col-span-3">
              <CardContent className="p-0 overflow-hidden rounded-lg">
                {playerData.skinUrl && (
                  <MinecraftSkin3DVanilla
                    skinUrl={playerData.skinUrl}
                    capeUrl={playerData.capeUrl}
                    isSlim={playerData.isSlim}
                    width={500}
                    height={500}
                    className="mx-auto"
                  />
                )}
              </CardContent>
            </Card>

            {/* Player info - takes 2 cols */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Informations du joueur
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Pseudo
                    </span>
                    <p className="text-xl font-bold">{playerData.username}</p>
                  </div>

                  <div>
                    <span className="text-sm text-muted-foreground">UUID</span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 break-all">
                        {playerData.uuid}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={copyUuid}
                      >
                        {copiedUuid ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-sm text-muted-foreground">
                        Type
                      </span>
                      <div className="mt-1">
                        <Badge variant={playerData.isSlim ? "secondary" : "default"}>
                          {playerData.isSlim ? "Slim (Alex)" : "Classic (Steve)"}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">
                        Skin
                      </span>
                      <div className="mt-1">
                        <Badge
                          variant={playerData.skinUrl ? "default" : "outline"}
                          className={
                            playerData.skinUrl
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          {playerData.skinUrl ? "Disponible" : "Non disponible"}
                        </Badge>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm text-muted-foreground">
                        Cape
                      </span>
                      <div className="mt-1">
                        <Badge
                          variant={playerData.capeUrl ? "default" : "outline"}
                          className={
                            playerData.capeUrl
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }
                        >
                          {playerData.capeUrl ? "Disponible" : "Non disponible"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Server-rendered images + Name history */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Server-rendered images - takes 3 cols */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle>Rendus serveur</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(
                    [
                      { key: "head", label: "Tete" },
                      { key: "body", label: "Corps" },
                      { key: "skin", label: "Skin" },
                      { key: "cape", label: "Cape" },
                    ] as const
                  ).map(({ key, label }) => (
                    <div
                      key={key}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                        {loadingImages[key] ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : generatedImages[key] ? (
                          <img
                            src={generatedImages[key]}
                            alt={`Minecraft ${label}`}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {label}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium">{label}</span>
                      {generatedImages[key] && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() =>
                            downloadImage(key, generatedImages[key]!)
                          }
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Telecharger
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Name history - takes 2 cols */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Historique des noms
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : nameHistory ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 font-medium">Nom</th>
                            <th className="text-left p-2 font-medium">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nameHistory.names.map(
                            (entry: NameHistoryEntry, i: number) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="p-2 font-mono">
                                  {entry.name}
                                </td>
                                <td className="p-2 text-muted-foreground">
                                  {entry.changedToAt
                                    ? new Date(
                                        entry.changedToAt
                                      ).toLocaleDateString("fr-FR")
                                    : "Nom original"}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Source: {nameHistory.source}
                      {nameHistory.note && ` - ${nameHistory.note}`}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Aucun historique disponible
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Download section */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => downloadTexture("skin")}
                  disabled={!playerData.skinUrl}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Telecharger texture skin
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadTexture("cape")}
                  disabled={!playerData.capeUrl}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Telecharger texture cape
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent skins (shown below results too) */}
          {recentSkins.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Skins recemment recherches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SkinThumbnailGrid
                  skins={recentSkins}
                  onSelect={handleSelectSkin}
                  loading={false}
                  emptyMessage=""
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function MinecraftSkinPageClient(
  props: MinecraftSkinPageClientProps = {}
) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MinecraftSkinPageContent {...props} />
    </Suspense>
  );
}
