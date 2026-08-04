"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sliders,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModuleConfig } from "@/types/modules";
import { ModuleShell } from "../components/module-shell";
import { MODELS, getModelSpec } from "../lib/models";
import { callModule, type SecretStatus } from "../lib/client";

interface SettingsPageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

type ProviderKey = "openai" | "stability";

const PROVIDERS: {
  id: ProviderKey;
  label: string;
  field: "openai_api_key" | "stability_api_key";
  placeholder: string;
  help: string;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    field: "openai_api_key",
    placeholder: "sk-proj-…",
    help: "Requise pour GPT Image 1 et DALL-E 3.",
  },
  {
    id: "stability",
    label: "Stability AI",
    field: "stability_api_key",
    placeholder: "sk-…",
    help: "Requise pour Stable Diffusion XL.",
  },
];

export default function SettingsPage({
  moduleName,
  settings: initialSettings,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<Record<string, any>>(initialSettings);
  const [keys, setKeys] = useState<Record<string, SecretStatus> | null>(null);

  /** Saisie en cours, non encore enregistrée. Vide = la clé stockée est conservée. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [tests, setTests] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadKeys = useCallback(() => {
    callModule<Record<string, SecretStatus>>("getSecretsStatus")
      .then(setKeys)
      .catch(() => setKeys(null));
  }, []);

  useEffect(() => {
    loadKeys();
    fetch(`/api/modules/${moduleName}/settings`)
      .then((r) => r.json())
      .then((data) => data?.settings && setSettings(data.settings))
      .catch(() => {});
  }, [moduleName, loadKeys]);

  const defaultModel = getModelSpec(settings.default_model || "gpt-image-1");

  // ─── Clés API ───────────────────────────────────────────────

  const handleSaveKey = async (field: string, id: ProviderKey) => {
    setSavingKey(id);
    try {
      await callModule("saveSecrets", { [field]: drafts[field] ?? "" });
      setDrafts((prev) => ({ ...prev, [field]: "" }));
      setTests((prev) => ({ ...prev, [id]: undefined as any }));
      loadKeys();
      toast.success(
        drafts[field] ? "Clé enregistrée" : "Clé supprimée"
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setSavingKey(null);
    }
  };

  const handleTest = async (id: ProviderKey) => {
    setTesting(id);
    try {
      const result = await callModule<{ success: boolean; message: string }>(
        "testConnection",
        id
      );
      setTests((prev) => ({ ...prev, [id]: result }));
    } catch (error: any) {
      setTests((prev) => ({
        ...prev,
        [id]: { success: false, message: error?.message ?? "Erreur" },
      }));
    } finally {
      setTesting(null);
    }
  };

  // ─── Préférences ────────────────────────────────────────────

  const updateSetting = (key: string, value: unknown) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await fetch(`/api/modules/${moduleName}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Préférences enregistrées");
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <ModuleShell
      current="settings"
      title="Configuration"
      description="Clés d'accès aux API et valeurs par défaut du Studio."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ─── Clés API ─────────────────────────────────── */}
        <section className="rounded-xl border bg-card p-5">
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Clés API
            </FieldLegend>

            <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-5 text-muted-foreground">
                Les clés sont écrites dans{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">
                  modules/ai-image-gen/data/secrets.json
                </code>
                , en dehors du dépôt git. Les variables{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">
                  OPENAI_API_KEY
                </code>{" "}
                et{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">
                  STABILITY_API_KEY
                </code>{" "}
                priment si elles existent.
              </p>
            </div>

            <FieldGroup className="gap-6">
              {PROVIDERS.map((provider) => {
                const status = keys?.[provider.id];
                const fromEnv = status?.fromEnv;
                const draft = drafts[provider.field] ?? "";
                const test = tests[provider.id];

                return (
                  <Field key={provider.id}>
                    <FieldLabel
                      htmlFor={`key-${provider.id}`}
                      className="flex items-center gap-2"
                    >
                      {provider.label}
                      {status?.configured && (
                        <Badge
                          variant="secondary"
                          className="h-5 gap-1 px-1.5 text-[10px] font-normal"
                        >
                          {fromEnv ? (
                            <>
                              <Lock className="h-2.5 w-2.5" />
                              variable d&apos;environnement
                            </>
                          ) : (
                            status.hint
                          )}
                        </Badge>
                      )}
                    </FieldLabel>

                    {fromEnv ? (
                      // Saisir une clé ici serait sans effet : l'environnement
                      // l'emporte à la lecture. Mieux vaut le dire.
                      <FieldDescription>
                        Définie par l&apos;environnement du serveur. Retirez la
                        variable pour pouvoir la gérer depuis cette page.
                      </FieldDescription>
                    ) : (
                      <>
                        <InputGroup>
                          <InputGroupInput
                            id={`key-${provider.id}`}
                            type={revealed[provider.field] ? "text" : "password"}
                            placeholder={
                              status?.configured
                                ? "Laisser vide pour conserver la clé actuelle"
                                : provider.placeholder
                            }
                            value={draft}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [provider.field]: e.target.value,
                              }))
                            }
                            className="font-mono text-xs"
                          />
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              aria-label={
                                revealed[provider.field]
                                  ? "Masquer la clé"
                                  : "Afficher la clé"
                              }
                              onClick={() =>
                                setRevealed((prev) => ({
                                  ...prev,
                                  [provider.field]: !prev[provider.field],
                                }))
                              }
                            >
                              {revealed[provider.field] ? <EyeOff /> : <Eye />}
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                        <FieldDescription>{provider.help}</FieldDescription>
                      </>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {!fromEnv && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            savingKey === provider.id ||
                            (!draft && !status?.configured)
                          }
                          onClick={() =>
                            handleSaveKey(provider.field, provider.id)
                          }
                        >
                          {savingKey === provider.id && (
                            <Spinner className="mr-1.5 h-3 w-3" />
                          )}
                          {draft
                            ? "Enregistrer"
                            : status?.configured
                              ? "Supprimer la clé"
                              : "Enregistrer"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={testing !== null || !status?.configured}
                        onClick={() => handleTest(provider.id)}
                      >
                        {testing === provider.id && (
                          <Spinner className="mr-1.5 h-3 w-3" />
                        )}
                        Tester
                      </Button>
                      {test && (
                        <span
                          className={
                            test.success
                              ? "inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                              : "inline-flex items-center gap-1 text-xs text-destructive"
                          }
                        >
                          {test.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          {test.message}
                        </span>
                      )}
                    </div>
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
        </section>

        {/* ─── Valeurs par défaut ───────────────────────── */}
        <section className="rounded-xl border bg-card p-5">
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              <Sliders className="h-4 w-4" />
              Valeurs par défaut
            </FieldLegend>

            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="default-model">Modèle</FieldLabel>
                <Select
                  value={settings.default_model || "gpt-image-1"}
                  onValueChange={(v) => {
                    updateSetting("default_model", v);
                    // Les tailles diffèrent d'un modèle à l'autre : conserver
                    // l'ancienne enregistrerait un défaut invalide.
                    const spec = getModelSpec(v);
                    if (spec && !spec.sizes.includes(settings.default_size)) {
                      updateSetting("default_size", spec.sizes[0]);
                    }
                    if (
                      spec?.qualities &&
                      !spec.qualities.some(
                        (q) => q.value === settings.default_quality
                      )
                    ) {
                      updateSetting("default_quality", spec.qualities[0].value);
                    }
                  }}
                >
                  <SelectTrigger id="default-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {defaultModel && (
                  <FieldDescription>{defaultModel.description}</FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="default-size">Format</FieldLabel>
                <Select
                  value={settings.default_size || "1024x1024"}
                  onValueChange={(v) => updateSetting("default_size", v)}
                >
                  <SelectTrigger id="default-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(defaultModel?.sizes ?? ["1024x1024"]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {defaultModel?.qualities && (
                <Field>
                  <FieldLabel htmlFor="default-quality">Qualité</FieldLabel>
                  <Select
                    value={
                      settings.default_quality || defaultModel.qualities[0].value
                    }
                    onValueChange={(v) => updateSetting("default_quality", v)}
                  >
                    <SelectTrigger id="default-quality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultModel.qualities.map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="default-notes">Notes de style</FieldLabel>
                <Textarea
                  id="default-notes"
                  rows={3}
                  placeholder="masterpiece, best quality, highly detailed…"
                  value={settings.notes_preprompt || ""}
                  onChange={(e) =>
                    updateSetting("notes_preprompt", e.target.value)
                  }
                  className="resize-none text-xs"
                />
                <FieldDescription>
                  Placées devant chaque prompt. Le Studio les pré-remplit et
                  permet de les ajuster au coup par coup.
                </FieldDescription>
              </Field>

              <Separator />

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="save-gallery">
                    Envoyer dans la galerie
                  </FieldLabel>
                  <FieldDescription>
                    Chaque image générée est copiée dans les uploads de
                    l&apos;application et devient visible dans la galerie.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="save-gallery"
                  checked={Boolean(settings.save_to_gallery)}
                  onCheckedChange={(v) => updateSetting("save_to_gallery", v)}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <div className="mt-6 flex justify-end">
            <Button onClick={handleSavePrefs} disabled={savingPrefs}>
              {savingPrefs && <Spinner className="mr-2 h-4 w-4" />}
              Enregistrer les préférences
            </Button>
          </div>
        </section>
      </div>
    </ModuleShell>
  );
}
