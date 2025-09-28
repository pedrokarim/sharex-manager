"use client";

import { useState, useCallback, useEffect } from "react";
import { useMinecraftSkinParams } from "@/lib/minecraft/url-params.client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Download,
  RefreshCw,
  Gamepad2,
  User,
  Image as ImageIcon,
  Box,
  Search,
  Eye,
  Monitor,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { MinecraftSkin3DVanilla } from "@/components/minecraft/minecraft-skin-3d";

interface PlayerData {
  uuid: string;
  username: string;
  skinUrl?: string;
  capeUrl?: string;
  isSlim?: boolean;
}

interface SkinRenderOptions {
  uuid: string;
  model: "classic" | "slim";
  width: number;
  height: number;
  theta: number;
  phi: number;
  time: number;
  flip: boolean;
}

const defaultOptions: SkinRenderOptions = {
  uuid: "",
  model: "slim",
  width: 600,
  height: 800,
  theta: -30,
  phi: 20,
  time: 90,
  flip: false,
};

interface MinecraftSkinPageClientProps {
  initialUsername?: string;
}

export function MinecraftSkinPageClient({
  initialUsername,
}: MinecraftSkinPageClientProps = {}) {
  const { t } = useTranslation();
  const {
    username,
    setUsername,
    uuid,
    setUuid,
    isSlim,
    setIsSlim,
    isAnimating,
    setIsAnimating,
    theta,
    setTheta,
    phi,
    setPhi,
    time,
    setTime,
  } = useMinecraftSkinParams();

  const [searchUsername, setSearchUsername] = useState("");
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [options, setOptions] = useState<SkinRenderOptions>(defaultOptions);
  const [generatedImages, setGeneratedImages] = useState<{
    head?: string;
    body?: string;
    skin?: string;
    cape?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gestion des search params et username initial pour accès direct
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get("username") || initialUsername;
    const uuid = urlParams.get("uuid");

    if (username) {
      setSearchUsername(username);
      // Appel direct de la recherche sans dépendance circulaire
      const searchPlayer = async () => {
        if (!username.trim()) return;

        setIsSearching(true);
        setSearchError(null);
        setPlayerData(null);

        try {
          const response = await fetch(
            `/api/tools/minecraft-skin/player?username=${encodeURIComponent(
              username
            )}`
          );
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Erreur lors de la recherche");
          }

          if (data.success && data.data) {
            const player = data.data;
            setPlayerData(player);
            setOptions((prev) => ({
              ...prev,
              uuid: player.uuid,
              model: player.isSlim ? "slim" : "classic",
            }));
            setSearchUsername(player.username);
          } else {
            throw new Error("Joueur non trouvé");
          }
        } catch (err) {
          setSearchError(
            err instanceof Error ? err.message : "Une erreur est survenue"
          );
        } finally {
          setIsSearching(false);
        }
      };

      searchPlayer();
    } else if (uuid) {
      setOptions((prev) => ({ ...prev, uuid }));
    }
  }, [initialUsername]);

  const updateOption = useCallback(
    (key: keyof SkinRenderOptions, value: any) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSearch = useCallback(async () => {
    if (!searchUsername.trim()) {
      setSearchError("Veuillez entrer un pseudo Minecraft");
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setPlayerData(null);

    try {
      const response = await fetch(
        `/api/tools/minecraft-skin/player?username=${encodeURIComponent(
          searchUsername
        )}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erreur lors de la recherche");
      }

      if (data.success && data.data) {
        const player = data.data;
        setPlayerData(player);
        setOptions((prev) => ({
          ...prev,
          uuid: player.uuid,
          model: player.isSlim ? "slim" : "classic",
        }));
        setSearchUsername(player.username);
      } else {
        throw new Error("Joueur non trouvé");
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Une erreur est survenue"
      );
    } finally {
      setIsSearching(false);
    }
  }, [searchUsername]);

  const generateImage = useCallback(
    async (type: "head" | "body" | "skin" | "cape") => {
      if (!options.uuid.trim()) {
        setError(
          "Veuillez rechercher un joueur ou entrer un UUID Minecraft valide"
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("skin", options.uuid);

        if (type === "body") {
          params.set("model", options.model);
          params.set("theta", options.theta.toString());
          params.set("phi", options.phi.toString());
          params.set("time", options.time.toString());
          params.set("width", options.width.toString());
          params.set("height", options.height.toString());
        } else {
          params.set("width", options.width.toString());
          params.set("height", options.height.toString());
          if (options.flip) params.set("flip", "1");
        }

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

        if (!response.ok) {
          throw new Error(
            `Erreur lors de la génération: ${response.statusText}`
          );
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        setGeneratedImages((prev) => ({ ...prev, [type]: imageUrl }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Une erreur est survenue"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const downloadImage = useCallback(
    (type: string, imageUrl: string) => {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `minecraft-${type}-${
        playerData?.username || options.uuid
      }.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [playerData?.username, options.uuid]
  );

  const generateAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await Promise.all([
        generateImage("head"),
        generateImage("body"),
        generateImage("skin"),
        generateImage("cape"),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }, [generateImage]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Gamepad2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            {t("tools.minecraft_skin.title")}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {t("tools.minecraft_skin.description")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recherche de joueur */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Recherche de joueur
            </CardTitle>
            <CardDescription>
              Recherchez un joueur par son pseudo Minecraft
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Entrez le pseudo du joueur"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                disabled={isSearching}
              />
              <Button
                onClick={() => handleSearch()}
                disabled={isSearching || !searchUsername.trim()}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {searchError && (
              <Alert variant="destructive">
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
            )}

            {playerData && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    {playerData.username}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {playerData.isSlim ? "Slim" : "Classic"}
                  </Badge>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  UUID: {playerData.uuid}
                </p>
                {playerData.skinUrl && (
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Skin: Disponible
                  </p>
                )}
                {playerData.capeUrl && (
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Cape: Disponible
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>{t("tools.minecraft_skin.configuration")}</CardTitle>
            <CardDescription>
              {t("tools.minecraft_skin.configuration_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uuid">UUID Minecraft</Label>
              <Input
                id="uuid"
                placeholder={t("tools.minecraft_skin.uuid_placeholder")}
                value={options.uuid}
                onChange={(e) => updateOption("uuid", e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                {t("tools.minecraft_skin.uuid_help")}{" "}
                <a
                  href="https://mcuuid.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  mcuuid.net
                </a>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model">{t("tools.minecraft_skin.model")}</Label>
                <Select
                  value={options.model}
                  onValueChange={(value: "classic" | "slim") =>
                    updateOption("model", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slim">
                      {t("tools.minecraft_skin.model_slim")}
                    </SelectItem>
                    <SelectItem value="classic">
                      {t("tools.minecraft_skin.model_classic")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="flip">{t("tools.minecraft_skin.flip")}</Label>
                <Select
                  value={options.flip.toString()}
                  onValueChange={(value) =>
                    updateOption("flip", value === "true")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">
                      {t("tools.minecraft_skin.flip_no")}
                    </SelectItem>
                    <SelectItem value="true">
                      {t("tools.minecraft_skin.flip_yes")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="width">{t("tools.minecraft_skin.width")}</Label>
                <Input
                  id="width"
                  type="number"
                  min="32"
                  max="2000"
                  value={options.width}
                  onChange={(e) =>
                    updateOption("width", parseInt(e.target.value) || 600)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="height">
                  {t("tools.minecraft_skin.height")}
                </Label>
                <Input
                  id="height"
                  type="number"
                  min="32"
                  max="2000"
                  value={options.height}
                  onChange={(e) =>
                    updateOption("height", parseInt(e.target.value) || 800)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="theta">{t("tools.minecraft_skin.theta")}</Label>
                <Input
                  id="theta"
                  type="number"
                  min="-180"
                  max="180"
                  value={options.theta}
                  onChange={(e) =>
                    updateOption("theta", parseInt(e.target.value) || -30)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phi">{t("tools.minecraft_skin.phi")}</Label>
                <Input
                  id="phi"
                  type="number"
                  min="-90"
                  max="90"
                  value={options.phi}
                  onChange={(e) =>
                    updateOption("phi", parseInt(e.target.value) || 20)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">{t("tools.minecraft_skin.time")}</Label>
                <Input
                  id="time"
                  type="number"
                  min="0"
                  max="360"
                  value={options.time}
                  onChange={(e) =>
                    updateOption("time", parseInt(e.target.value) || 90)
                  }
                />
              </div>
            </div>

            <div className="flex flex-col space-y-2">
              <Button
                onClick={generateAll}
                disabled={isLoading || !options.uuid.trim()}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("tools.minecraft_skin.generating")}
                  </>
                ) : (
                  t("tools.minecraft_skin.generate_all")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rendu 3D et résultats */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rendu 3D côté client */}
        {playerData?.skinUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Rendu 3D en temps réel
              </CardTitle>
              <CardDescription>
                Visualisation interactive du skin avec Three.js
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MinecraftSkin3DVanilla
                skinUrl={playerData.skinUrl}
                capeUrl={playerData.capeUrl}
                isSlim={playerData.isSlim}
                width={400}
                height={400}
                className="mx-auto"
              />
            </CardContent>
          </Card>
        )}

        {/* Résultats des images générées */}
        <Card>
          <CardHeader>
            <CardTitle>{t("tools.minecraft_skin.results")}</CardTitle>
            <CardDescription>
              {t("tools.minecraft_skin.results_description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="head" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger
                  value="head"
                  className="flex items-center space-x-1"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("tools.minecraft_skin.head")}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="body"
                  className="flex items-center space-x-1"
                >
                  <Box className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("tools.minecraft_skin.body")}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="skin"
                  className="flex items-center space-x-1"
                >
                  <ImageIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("tools.minecraft_skin.skin")}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="cape"
                  className="flex items-center space-x-1"
                >
                  <Gamepad2 className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("tools.minecraft_skin.cape")}
                  </span>
                </TabsTrigger>
              </TabsList>

              {(["head", "body", "skin", "cape"] as const).map((type) => (
                <TabsContent key={type} value={type} className="mt-4">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold capitalize">
                        {type === "head"
                          ? t("tools.minecraft_skin.head")
                          : type === "body"
                          ? t("tools.minecraft_skin.body")
                          : type === "skin"
                          ? t("tools.minecraft_skin.skin")
                          : t("tools.minecraft_skin.cape")}
                      </h3>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => generateImage(type)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        {generatedImages[
                          type as keyof typeof generatedImages
                        ] && (
                          <Button
                            size="sm"
                            onClick={() =>
                              downloadImage(
                                type,
                                generatedImages[
                                  type as keyof typeof generatedImages
                                ]!
                              )
                            }
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {generatedImages[type as keyof typeof generatedImages] ? (
                      <div className="space-y-4">
                        <img
                          src={
                            generatedImages[
                              type as keyof typeof generatedImages
                            ]
                          }
                          alt={`Minecraft ${type}`}
                          className="max-w-full h-auto mx-auto rounded-lg shadow-lg"
                        />
                        <Badge variant="secondary">
                          {t("tools.minecraft_skin.generated_successfully")}
                        </Badge>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-muted-foreground">
                          {type === "head"
                            ? "👤"
                            : type === "body"
                            ? "📦"
                            : type === "skin"
                            ? "🖼️"
                            : "🧥"}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t("tools.minecraft_skin.no_image")}{" "}
                          {type === "head"
                            ? t("tools.minecraft_skin.head").toLowerCase()
                            : type === "body"
                            ? t("tools.minecraft_skin.body").toLowerCase()
                            : type === "skin"
                            ? t("tools.minecraft_skin.skin").toLowerCase()
                            : t("tools.minecraft_skin.cape").toLowerCase()}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => generateImage(type)}
                          disabled={isLoading || !options.uuid.trim()}
                        >
                          {t("tools.minecraft_skin.generate")}
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
