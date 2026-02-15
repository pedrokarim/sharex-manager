"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
  Key,
  Sliders,
} from "lucide-react";
import type { ModuleConfig } from "@/types/modules";

interface SettingsPageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

export default function SettingsPage({
  moduleName,
  settings: initialSettings,
}: SettingsPageProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{
    provider: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [showStability, setShowStability] = useState(false);

  // Refetch settings on mount
  useEffect(() => {
    fetch(`/api/modules/${moduleName}/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .catch(() => {});
  }, [moduleName]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/modules/${moduleName}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (provider: "openai" | "stability") => {
    // Save settings first so the server reads the latest key
    await fetch(`/api/modules/${moduleName}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });

    setTesting(provider);
    setTestResult(null);
    try {
      const res = await fetch("/api/modules/call-function", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleName: "ai-image-gen",
          functionName: "testConnection",
          args: [provider],
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        setTestResult({ provider, ...result.data });
      } else {
        setTestResult({
          provider,
          success: false,
          message: result.error || "Erreur",
        });
      }
    } catch {
      setTestResult({
        provider,
        success: false,
        message: "Erreur réseau",
      });
    } finally {
      setTesting(null);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <a href="/m/ai-image-gen">
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Configuration
          </h1>
          <p className="text-muted-foreground">
            Paramètres du module AI Image Generation
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Clés API
            </CardTitle>
            <CardDescription>
              Configurez vos clés API pour chaque provider
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* OpenAI */}
            <div className="space-y-2.5">
              <Label className="text-sm font-medium">Clé API OpenAI</Label>
              <div className="relative">
                <Input
                  type={showOpenAI ? "text" : "password"}
                  placeholder="sk-proj-..."
                  value={settings.openai_api_key || ""}
                  onChange={(e) =>
                    updateSetting("openai_api_key", e.target.value)
                  }
                  className="pr-10 bg-muted/50 border-muted-foreground/20 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowOpenAI(!showOpenAI)}
                >
                  {showOpenAI ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection("openai")}
                  disabled={testing !== null || !settings.openai_api_key}
                >
                  {testing === "openai" && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Tester la connexion
                </Button>
                {testResult?.provider === "openai" && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      testResult.success
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>

            {/* Stability */}
            <div className="space-y-2.5">
              <Label className="text-sm font-medium">
                Clé API Stability AI
              </Label>
              <div className="relative">
                <Input
                  type={showStability ? "text" : "password"}
                  placeholder="sk-..."
                  value={settings.stability_api_key || ""}
                  onChange={(e) =>
                    updateSetting("stability_api_key", e.target.value)
                  }
                  className="pr-10 bg-muted/50 border-muted-foreground/20 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowStability(!showStability)}
                >
                  {showStability ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection("stability")}
                  disabled={testing !== null || !settings.stability_api_key}
                >
                  {testing === "stability" && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Tester la connexion
                </Button>
                {testResult?.provider === "stability" && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      testResult.success
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive"
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Paramètres par défaut
            </CardTitle>
            <CardDescription>
              Valeurs par défaut pour la génération
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Provider par défaut
              </Label>
              <Select
                value={settings.provider || "openai"}
                onValueChange={(val) => updateSetting("provider", val)}
              >
                <SelectTrigger className="bg-muted/50 border-muted-foreground/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="stability">Stability AI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Modèle par défaut
              </Label>
              <Select
                value={settings.default_model || "dall-e-3"}
                onValueChange={(val) => updateSetting("default_model", val)}
              >
                <SelectTrigger className="bg-muted/50 border-muted-foreground/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dall-e-3">DALL-E 3</SelectItem>
                  <SelectItem value="dall-e-2">DALL-E 2</SelectItem>
                  <SelectItem value="stable-diffusion-xl">
                    Stable Diffusion XL
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Taille par défaut
              </Label>
              <Select
                value={settings.default_size || "1024x1024"}
                onValueChange={(val) => updateSetting("default_size", val)}
              >
                <SelectTrigger className="bg-muted/50 border-muted-foreground/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024x1024">1024 x 1024</SelectItem>
                  <SelectItem value="1024x1792">1024 x 1792</SelectItem>
                  <SelectItem value="1792x1024">1792 x 1024</SelectItem>
                  <SelectItem value="512x512">512 x 512</SelectItem>
                  <SelectItem value="256x256">256 x 256</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Notes pré-prompt</Label>
              <Textarea
                placeholder="masterpiece, best quality, highly detailed..."
                value={settings.notes_preprompt || ""}
                onChange={(e) =>
                  updateSetting("notes_preprompt", e.target.value)
                }
                rows={2}
                className="resize-none text-xs bg-muted/50 border-muted-foreground/20"
              />
              <p className="text-[11px] text-muted-foreground">
                Ces notes sont ajoutées automatiquement avant chaque prompt
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-muted-foreground/20 p-3">
              <Label
                htmlFor="save-gallery"
                className="text-sm font-medium cursor-pointer"
              >
                Sauvegarder dans la galerie
              </Label>
              <Switch
                id="save-gallery"
                checked={settings.save_to_gallery ?? true}
                onCheckedChange={(val) =>
                  updateSetting("save_to_gallery", val)
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sauvegarder les paramètres
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            Paramètres sauvegardés
          </span>
        )}
      </div>
    </div>
  );
}
