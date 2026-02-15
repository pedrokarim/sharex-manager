"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Download,
  Loader2,
  ImageIcon,
  Settings,
  RotateCcw,
  Upload,
  X,
  Trash2,
  Clock,
  Wand2,
  Palette,
  Mountain,
  User,
  Zap,
  Camera,
} from "lucide-react";
import type { ModuleConfig } from "@/types/modules";

// ─── Types ──────────────────────────────────────────────────

interface GeneratePageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

interface HistoryItem {
  id: string;
  prompt: string;
  notes: string;
  provider: string;
  model: string;
  size: string;
  count: number;
  imageFiles: string[];
  createdAt: number;
}

interface SessionImage {
  b64?: string;
  url?: string;
  file?: string;
}

// ─── Constants ──────────────────────────────────────────────

const PRESETS = [
  { label: "Anime", icon: Sparkles, prompt: "anime style, detailed illustration, vibrant colors, high quality" },
  { label: "Paysage", icon: Mountain, prompt: "landscape, scenic view, atmospheric lighting, detailed environment, 8k" },
  { label: "Portrait", icon: User, prompt: "portrait, detailed face, studio lighting, professional photography" },
  { label: "Cyberpunk", icon: Zap, prompt: "cyberpunk, neon lights, futuristic city, rain, dark atmosphere, cinematic" },
  { label: "Fantasy", icon: Wand2, prompt: "fantasy art, magical, ethereal, detailed illustration, dramatic lighting" },
  { label: "Réaliste", icon: Camera, prompt: "photorealistic, 8k, ultra high detail, natural lighting, sharp focus" },
];

const MODELS: Record<string, { label: string; provider: string; sizes: string[]; color: string; tags: string[] }> = {
  "dall-e-3": {
    label: "DALL-E 3",
    provider: "openai",
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    color: "from-emerald-500 to-teal-600",
    tags: ["Haute Qualité", "Créatif"],
  },
  "dall-e-2": {
    label: "DALL-E 2",
    provider: "openai",
    sizes: ["256x256", "512x512", "1024x1024"],
    color: "from-blue-500 to-cyan-600",
    tags: ["Rapide", "Variations"],
  },
  "stable-diffusion-xl": {
    label: "SDXL",
    provider: "stability",
    sizes: ["1024x1024", "768x1024", "1024x768"],
    color: "from-violet-500 to-purple-600",
    tags: ["Open Source", "Personnalisable"],
  },
};

const SHOWCASE = [
  { title: "Anime Portrait", gradient: "from-pink-500/20 to-purple-600/20", border: "border-pink-500/30" },
  { title: "Paysage Fantasy", gradient: "from-emerald-500/20 to-cyan-600/20", border: "border-emerald-500/30" },
  { title: "Cyberpunk City", gradient: "from-violet-500/20 to-fuchsia-600/20", border: "border-violet-500/30" },
  { title: "Nature Réaliste", gradient: "from-amber-500/20 to-orange-600/20", border: "border-amber-500/30" },
];

// ─── Helper ──────────────────────────────────────────────────

async function callModule(fn: string, ...args: any[]) {
  const res = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleName: "ai-image-gen",
      functionName: fn,
      args,
    }),
  });
  return res.json();
}

function imageUrl(file: string) {
  return `/api/modules/ai-image-gen/data/images/${file}`;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

// ─── Component ──────────────────────────────────────────────

export default function GeneratePage({ settings }: GeneratePageProps) {
  // Form state
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(settings.default_model || "dall-e-3");
  const [size, setSize] = useState(settings.default_size || "1024x1024");
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState(settings.notes_preprompt || "");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([]);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  // Derived
  const modelInfo = MODELS[model];
  const provider = modelInfo?.provider || "openai";
  const availableSizes = modelInfo?.sizes || ["1024x1024"];

  // Load history on mount
  useEffect(() => {
    setHistoryLoading(true);
    callModule("getHistory", 50)
      .then((res) => {
        if (res.success && res.data) setHistory(res.data);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // Reset size when model changes
  useEffect(() => {
    const sizes = MODELS[model]?.sizes || [];
    if (!sizes.includes(size)) {
      setSize(sizes[0] || "1024x1024");
    }
  }, [model, size]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedHistory(null);

    try {
      const result = await callModule("generateImage", prompt, {
        provider,
        model,
        size,
        n: count,
        notes: notes || undefined,
        referenceImageB64: referenceImage || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || "Erreur lors de la génération");
      }

      const images: SessionImage[] = (result.data?.images || []).map(
        (img: any, i: number) => ({
          b64: img.b64,
          url: img.url,
          file: result.data?.historyId
            ? `${result.data.historyId}-${i}.png`
            : undefined,
        })
      );
      setSessionImages(images);

      // Refresh history
      const histRes = await callModule("getHistory", 50);
      if (histRes.success && histRes.data) setHistory(histRes.data);
    } catch (err: any) {
      setError(err.message || "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [prompt, provider, model, size, count, notes, referenceImage]);

  const handleReset = useCallback(() => {
    setPrompt("");
    setError(null);
    setSessionImages([]);
    setSelectedHistory(null);
    setReferenceImage(null);
    setModel(settings.default_model || "dall-e-3");
    setSize(settings.default_size || "1024x1024");
    setCount(1);
    setNotes(settings.notes_preprompt || "");
  }, [settings]);

  const handlePreset = useCallback((presetPrompt: string) => {
    setPrompt((prev) =>
      prev ? `${prev}, ${presetPrompt}` : presetPrompt
    );
  }, []);

  const handleDownload = useCallback((src: string, index: number) => {
    const link = document.createElement("a");
    link.href = src;
    link.download = `ai-gen-${Date.now()}-${index}.png`;
    link.click();
  }, []);

  const handleRefUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1];
        setReferenceImage(b64);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleHistoryClick = useCallback((item: HistoryItem) => {
    setSelectedHistory(item);
    setSessionImages(
      item.imageFiles.map((f) => ({ file: f }))
    );
    setPrompt(item.prompt);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await callModule("clearHistory");
    setHistory([]);
    setSelectedHistory(null);
  }, []);

  // ─── Render helpers ───────────────────────────────────────

  const displayImages =
    sessionImages.length > 0
      ? sessionImages
      : selectedHistory
        ? selectedHistory.imageFiles.map((f) => ({ file: f }))
        : [];

  function getImageSrc(img: SessionImage) {
    if (img.b64) return `data:image/png;base64,${img.b64}`;
    if (img.file) return imageUrl(img.file);
    return img.url || "";
  }

  // ─── JSX ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            AI Image Generation
          </h1>
          <p className="text-muted-foreground text-sm">
            Générez des images à partir de descriptions textuelles
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/m/ai-image-gen/settings">
            <Settings className="mr-2 h-4 w-4" />
            Paramètres
          </a>
        </Button>
      </div>

      {/* Main 3-column layout */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_280px]">
        {/* ─── LEFT: History ─────────────────────── */}
        <Card className="hidden lg:flex flex-col max-h-[calc(100vh-180px)]">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Historique
            </CardTitle>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleClearHistory}
                title="Effacer l'historique"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-2">
            <ScrollArea className="h-full">
              {historyLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Pas encore de génération
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className={`w-full text-left rounded-lg border p-2 transition-colors hover:bg-accent ${
                        selectedHistory?.id === item.id
                          ? "border-primary bg-accent"
                          : "border-transparent"
                      }`}
                    >
                      {item.imageFiles[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={imageUrl(item.imageFiles[0])}
                          alt=""
                          className="w-full aspect-square rounded-md object-cover mb-1.5"
                        />
                      )}
                      <p className="text-xs line-clamp-2">{item.prompt}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {timeAgo(item.createdAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ─── CENTER: Prompt + Results ──────────── */}
        <div className="space-y-4">
          {/* Prompt */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Textarea
                placeholder="Décrivez l'image que vous souhaitez générer..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="resize-none text-sm border-muted-foreground/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.prompt)}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent hover:border-primary/50"
                  >
                    <p.icon className="h-3 w-3" />
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Générer{count > 1 ? ` (${count})` : ""}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Réinitialiser
                </Button>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results or Showcase */}
          {displayImages.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Résultats
                  {selectedHistory && (
                    <span className="font-normal text-muted-foreground ml-2">
                      — {timeAgo(selectedHistory.createdAt)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-3 ${displayImages.length === 1 ? "grid-cols-1 max-w-lg mx-auto" : "grid-cols-2"}`}>
                  {displayImages.map((img, i) => (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-lg border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getImageSrc(img)}
                        alt={prompt}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex w-full items-center justify-end p-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                            onClick={() =>
                              handleDownload(getImageSrc(img), i)
                            }
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            !loading && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Exemples de styles</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {SHOWCASE.map((item) => (
                      <div
                        key={item.title}
                        className={`relative aspect-square rounded-lg border ${item.border} bg-gradient-to-br ${item.gradient} flex flex-col items-center justify-center p-4 text-center`}
                      >
                        <ImageIcon className="h-8 w-8 mb-2 text-muted-foreground/60" />
                        <p className="text-xs font-medium">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Tapez un prompt pour commencer
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          )}

          {loading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-sm text-muted-foreground">
                  Génération en cours... Cela peut prendre quelques secondes.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ─── RIGHT: Options Panel ──────────────── */}
        <div className="space-y-3">
          {/* Reference Image */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Image de référence</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={refInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleRefUpload}
              />
              {referenceImage ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${referenceImage}`}
                    alt="Référence"
                    className="w-full aspect-square rounded-md object-cover"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => setReferenceImage(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => refInputRef.current?.click()}
                  className="w-full aspect-video rounded-md border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-1.5 transition-colors hover:border-primary/50 hover:bg-accent/50"
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Télécharger une image
                  </span>
                </button>
              )}
            </CardContent>
          </Card>

          {/* Model Selection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Modèle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(MODELS).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setModel(key)}
                  className={`w-full flex items-center gap-2.5 rounded-lg border p-2 transition-all ${
                    model === key
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 hover:bg-accent/50"
                  }`}
                >
                  <div
                    className={`h-9 w-9 rounded-md bg-gradient-to-br ${m.color} flex items-center justify-center shrink-0`}
                  >
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-xs font-medium leading-none">
                      {m.label}
                    </p>
                    <div className="flex gap-1 mt-1">
                      {m.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[9px] px-1 py-0 h-3.5"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Size */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Taille</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSizes.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Count */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nombre d&apos;images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant={count === 1 ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setCount(1)}
                >
                  x1
                </Button>
                <Button
                  variant={count === 4 ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setCount(4)}
                >
                  x4
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="masterpiece, best quality, highly detailed..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none text-xs border-muted-foreground/20"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Ajoutées en pré-prompt à chaque génération
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
