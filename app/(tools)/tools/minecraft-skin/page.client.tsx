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
} from "lucide-react";
import { MinecraftSkin3DVanilla } from "@/components/minecraft/minecraft-skin-3d";

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

interface MinecraftSkinPageClientProps {
  initialUsername?: string;
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
    [setUsername]
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

          {searchError && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{searchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

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
