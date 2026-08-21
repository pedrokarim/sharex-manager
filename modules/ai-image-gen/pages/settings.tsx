"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
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
import {
  callModule,
  type ApiEngineStatus,
  type Catalogue,
  type CliEngineStatus,
} from "../lib/client";

interface SettingsPageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

export default function SettingsPage({
  moduleName,
  settings: initialSettings,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<Record<string, any>>(initialSettings);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    const next = await callModule<Catalogue>("getCatalogue");
    setCatalogue(next);
    return next;
  }, []);

  useEffect(() => {
    load().catch(() => setCatalogue({ models: [], cli: [], apiEngines: [] }));
    fetch(`/api/modules/${moduleName}/settings`)
      .then((response) => response.json())
      .then((data) => data?.settings && setSettings(data.settings))
      .catch(() => {});
  }, [moduleName, load]);

  const redetect = async () => {
    setDetecting(true);
    try {
      await load();
      toast.success("Détection terminée");
    } catch (error: any) {
      toast.error(error?.message ?? "Détection impossible");
    } finally {
      setDetecting(false);
    }
  };

  const updateSetting = (key: string, value: unknown) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      const response = await fetch(`/api/modules/${moduleName}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success("Préférences enregistrées");
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setSavingPrefs(false);
    }
  };

  const availableModels = (catalogue?.models ?? []).filter(
    (model) => model.available
  );
  const defaultModel = (catalogue?.models ?? []).find(
    (model) => model.id === settings.default_model
  );

  return (
    <ModuleShell
      current="settings"
      title="Moteurs"
      description="Agents installés sur le serveur, clés API et valeurs par défaut du studio."
      actions={
        <Button variant="outline" size="sm" onClick={redetect} disabled={detecting}>
          {detecting ? (
            <Spinner className="mr-2 h-4 w-4" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Relancer la détection
        </Button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-2">
        {/* ─── Comptes connectés ────────────────────────── */}
        <section className="rounded-xl border bg-card p-5 xl:col-span-2">
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Comptes connectés
            </FieldLegend>

            <Alert className="mb-4">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Ces outils sont déjà authentifiés sur la machine qui héberge
                l&apos;application. Générer par leur intermédiaire consomme leur
                abonnement, pas une clé facturée à l&apos;image. Le CLI
                s&apos;exécute avec les droits du compte système qui fait tourner
                le serveur.
              </AlertDescription>
            </Alert>

            {!catalogue && <Spinner className="h-4 w-4" />}

            <div className="grid gap-3 lg:grid-cols-2">
              {(catalogue?.cli ?? []).map((engine) => (
                <CliEngineCard key={engine.id} engine={engine} onRefresh={load} />
              ))}
            </div>

            <div className="mt-4">
              <CustomEngineDialog onSaved={load} />
            </div>
          </FieldSet>
        </section>

        {/* ─── Clés API ─────────────────────────────────── */}
        <section className="rounded-xl border bg-card p-5">
          <FieldSet>
            <FieldLegend className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Clés API
            </FieldLegend>

            <FieldDescription className="mb-4">
              Les clés sont écrites dans{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                modules/ai-image-gen/data/secrets.json
              </code>
              , en dehors du dépôt git. Une variable d&apos;environnement du même
              nom prime toujours sur la valeur enregistrée ici.
            </FieldDescription>

            <FieldGroup className="gap-6">
              {(catalogue?.apiEngines ?? []).map((engine) => (
                <ApiKeyField key={engine.id} engine={engine} onSaved={load} />
              ))}
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
                <FieldLabel htmlFor="default-model">Moteur</FieldLabel>
                <Select
                  value={settings.default_model || ""}
                  onValueChange={(value) => {
                    updateSetting("default_model", value);
                    // Les formats diffèrent d'un modèle à l'autre : conserver
                    // l'ancien enregistrerait un défaut invalide.
                    const model = catalogue?.models.find(
                      (entry) => entry.id === value
                    );
                    if (model && !model.sizes.includes(settings.default_size)) {
                      updateSetting("default_size", model.sizes[0]);
                    }
                    if (
                      model?.qualities?.length &&
                      !model.qualities.some(
                        (quality) => quality.value === settings.default_quality
                      )
                    ) {
                      updateSetting("default_quality", model.qualities[0].value);
                    }
                  }}
                >
                  <SelectTrigger id="default-model" className="w-full">
                    <SelectValue placeholder="Choisir un moteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
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
                  onValueChange={(value) => updateSetting("default_size", value)}
                >
                  <SelectTrigger id="default-size" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(defaultModel?.sizes ?? ["1024x1024"]).map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {defaultModel?.qualities?.length ? (
                <Field>
                  <FieldLabel htmlFor="default-quality">Qualité</FieldLabel>
                  <Select
                    value={
                      settings.default_quality ||
                      defaultModel.qualities[0].value
                    }
                    onValueChange={(value) =>
                      updateSetting("default_quality", value)
                    }
                  >
                    <SelectTrigger id="default-quality" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultModel.qualities.map((quality) => (
                        <SelectItem key={quality.value} value={quality.value}>
                          {quality.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}

              <Field>
                <FieldLabel htmlFor="default-notes">Notes de style</FieldLabel>
                <Textarea
                  id="default-notes"
                  rows={3}
                  placeholder="masterpiece, best quality, highly detailed…"
                  value={settings.notes_preprompt || ""}
                  onChange={(event) =>
                    updateSetting("notes_preprompt", event.target.value)
                  }
                  className="resize-none text-xs"
                />
                <FieldDescription>
                  Placées devant chaque prompt. Le studio les pré-remplit et
                  permet de les ajuster au coup par coup.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="default-negative">
                  Consignes négatives
                </FieldLabel>
                <Textarea
                  id="default-negative"
                  rows={2}
                  placeholder="texte, filigrane, mains déformées…"
                  value={settings.default_negative_prompt || ""}
                  onChange={(event) =>
                    updateSetting("default_negative_prompt", event.target.value)
                  }
                  className="resize-none text-xs"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="max-parallel">
                  Générations simultanées
                </FieldLabel>
                <Input
                  id="max-parallel"
                  type="number"
                  min={1}
                  max={4}
                  value={settings.max_parallel_jobs ?? 2}
                  onChange={(event) =>
                    updateSetting(
                      "max_parallel_jobs",
                      Math.max(1, Math.min(4, Number(event.target.value) || 1))
                    )
                  }
                  className="w-24"
                />
                <FieldDescription>
                  Deux agents en ligne de commande ne tournent jamais en même
                  temps, quelle que soit cette valeur : ils se disputeraient le
                  processeur et le quota du compte.
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
                  onCheckedChange={(value) =>
                    updateSetting("save_to_gallery", value)
                  }
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <div className="mt-6 flex justify-end">
            <Button onClick={savePrefs} disabled={savingPrefs}>
              {savingPrefs && <Spinner className="mr-2 h-4 w-4" />}
              Enregistrer les préférences
            </Button>
          </div>
        </section>
      </div>
    </ModuleShell>
  );
}

// ─── Carte d'un agent CLI ────────────────────────────────────────

function CliEngineCard({
  engine,
  onRefresh,
}: {
  engine: CliEngineStatus;
  onRefresh: () => Promise<unknown>;
}) {
  const [pathDraft, setPathDraft] = useState(engine.configuredPath ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPathDraft(engine.configuredPath ?? "");
  }, [engine.configuredPath]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await callModule("saveCliSettings", engine.id, patch);
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const installed = Boolean(engine.binaryPath);
  const usable = installed && engine.imageCapable && engine.authenticated !== false;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {engine.label}
            {engine.custom && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                personnalisé
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {installed ? (
              <>
                {engine.version ?? "version inconnue"}
                {engine.account ? ` · ${engine.account}` : ""}
              </>
            ) : (
              engine.installHint
            )}
          </p>
        </div>

        <Badge
          variant={usable ? "secondary" : "outline"}
          className="h-5 shrink-0 gap-1 px-1.5 text-[10px] font-normal"
        >
          {usable ? (
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="h-2.5 w-2.5 text-muted-foreground" />
          )}
          {!installed
            ? "non installé"
            : !engine.imageCapable
              ? "pas de génération d'image"
              : engine.authenticated === false
                ? "non connecté"
                : "prêt"}
        </Badge>
      </div>

      {installed && (
        <p className="truncate rounded bg-muted/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {engine.binaryPath}
        </p>
      )}

      {engine.error && (
        <p className="text-xs text-destructive">{engine.error}</p>
      )}

      <Field>
        <FieldLabel htmlFor={`path-${engine.id}`} className="text-xs">
          Chemin de l&apos;exécutable
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`path-${engine.id}`}
            placeholder="détection automatique"
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            className="h-8 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            disabled={busy || pathDraft === (engine.configuredPath ?? "")}
            onClick={() => save({ binaryPath: pathDraft.trim() })}
          >
            Appliquer
          </Button>
        </div>
        <FieldDescription className="text-[11px]">
          À renseigner quand le serveur ne voit pas le même PATH que votre
          terminal.
        </FieldDescription>
      </Field>

      <div className="flex flex-col gap-2 border-t pt-3">
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Proposer dans le studio</span>
          <Switch
            checked={engine.enabled}
            disabled={busy}
            onCheckedChange={(checked) => save({ enabled: checked })}
          />
        </label>

        {/* La ligne reste visible une fois activée : elle se règle sur le choix
            de l'utilisateur, pas sur la capacité effective, sinon l'activer la
            ferait disparaître et il n'y aurait plus moyen de revenir dessus. */}
        {!engine.nativeImageCapable && installed && (
          <label className="flex items-start justify-between gap-3 text-xs">
            <span>
              Cet outil sait générer des images
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                À activer si vous lui avez branché un MCP ou un script de
                génération.
              </span>
            </span>
            <Switch
              checked={engine.assumeImageCapable}
              disabled={busy}
              onCheckedChange={(checked) =>
                save({ assumeImageCapable: checked })
              }
            />
          </label>
        )}

        {engine.custom && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 justify-start px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={async () => {
              await callModule("deleteCustomEngine", engine.id);
              await onRefresh();
              toast.success("Moteur supprimé");
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Supprimer ce moteur
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Moteur personnalisé ─────────────────────────────────────────

const TEMPLATE_HELP = [
  "{prompt}",
  "{negative}",
  "{outdir}",
  "{n}",
  "{size}",
  "{width}",
  "{height}",
  "{quality}",
  "{seed}",
  "{ref}",
  "{refs}",
];

function CustomEngineDialog({ onSaved }: { onSaved: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [binary, setBinary] = useState("");
  const [template, setTemplate] = useState("generate\n--prompt\n{prompt}\n--out-dir\n{outdir}\n--count\n{n}");
  const [sizes, setSizes] = useState("1024x1024, 1536x1024, 1024x1536");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await callModule("saveCustomEngine", {
        label: label.trim(),
        binary: binary.trim(),
        argsTemplate: template
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        sizes: sizes
          .split(",")
          .map((size) => size.trim())
          .filter(Boolean),
        supportsReference: template.includes("{ref"),
      });
      await onSaved();
      setOpen(false);
      setLabel("");
      setBinary("");
      toast.success("Moteur enregistré");
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter une commande locale
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Commande locale</DialogTitle>
          <DialogDescription>
            N&apos;importe quel programme du serveur capable d&apos;écrire des
            images dans un dossier peut devenir un moteur.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="custom-label">Nom</FieldLabel>
            <Input
              id="custom-label"
              placeholder="ComfyUI, script maison…"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="custom-binary">Exécutable</FieldLabel>
            <Input
              id="custom-binary"
              placeholder="/usr/local/bin/mon-outil"
              value={binary}
              onChange={(event) => setBinary(event.target.value)}
              className="font-mono text-xs"
            />
            <FieldDescription>
              Nom dans le PATH ou chemin absolu.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="custom-template">
              Arguments, un par ligne
            </FieldLabel>
            <Textarea
              id="custom-template"
              rows={7}
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              className="font-mono text-xs"
            />
            <FieldDescription>
              Jetons remplacés à l&apos;exécution :{" "}
              <span className="font-mono">{TEMPLATE_HELP.join(" ")}</span>. Le
              module récupère toutes les images apparues dans{" "}
              <span className="font-mono">{"{outdir}"}</span>.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="custom-sizes">Formats proposés</FieldLabel>
            <Input
              id="custom-sizes"
              value={sizes}
              onChange={(event) => setSizes(event.target.value)}
              className="font-mono text-xs"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            onClick={save}
            disabled={busy || !label.trim() || !binary.trim()}
          >
            {busy && <Spinner className="mr-2 h-4 w-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Champ de clé API ────────────────────────────────────────────

function ApiKeyField({
  engine,
  onSaved,
}: {
  engine: ApiEngineStatus;
  onSaved: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ success: boolean; message: string } | null>(
    null
  );

  const save = async () => {
    setBusy(true);
    try {
      await callModule("saveApiKey", engine.id, draft);
      setDraft("");
      setTest(null);
      await onSaved();
      toast.success(draft ? "Clé enregistrée" : "Clé supprimée");
    } catch (error: any) {
      toast.error(error?.message ?? "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setBusy(true);
    try {
      setTest(
        await callModule<{ success: boolean; message: string }>(
          "testConnection",
          engine.id
        )
      );
    } catch (error: any) {
      setTest({ success: false, message: error?.message ?? "Erreur" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor={`key-${engine.id}`} className="flex items-center gap-2">
        {engine.label}
        {engine.configured && (
          <Badge
            variant="secondary"
            className="h-5 gap-1 px-1.5 text-[10px] font-normal"
          >
            {engine.fromEnv ? (
              <>
                <Lock className="h-2.5 w-2.5" />
                {engine.envVariable}
              </>
            ) : (
              engine.hint
            )}
          </Badge>
        )}
      </FieldLabel>

      {engine.fromEnv ? (
        // Saisir une clé ici serait sans effet : l'environnement l'emporte à la
        // lecture. Mieux vaut le dire.
        <FieldDescription>
          Définie par l&apos;environnement du serveur. Retirez la variable pour
          pouvoir la gérer depuis cette page.
        </FieldDescription>
      ) : (
        <InputGroup>
          <InputGroupInput
            id={`key-${engine.id}`}
            type={revealed ? "text" : "password"}
            placeholder={
              engine.configured
                ? "Laisser vide pour conserver la clé actuelle"
                : "Coller la clé…"
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={revealed ? "Masquer la clé" : "Afficher la clé"}
              onClick={() => setRevealed((previous) => !previous)}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!engine.fromEnv && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || (!draft && !engine.configured)}
            onClick={save}
          >
            {busy && <Spinner className="mr-1.5 h-3 w-3" />}
            {draft
              ? "Enregistrer"
              : engine.configured
                ? "Supprimer la clé"
                : "Enregistrer"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !engine.configured}
          onClick={runTest}
        >
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
}

