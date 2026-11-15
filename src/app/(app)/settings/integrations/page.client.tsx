"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Check, CircleAlert, Copy, Download, ExternalLink, RotateCw, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { THEMED_ICONS } from "@/components/icon-theme";
import { PageTitleIcon } from "@/components/page-title-icon";
import { NEVER, defaultExpiry, durationLabel, expiryOptions } from "@/components/api-keys/create-api-key-dialog";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { SITE_LINKS } from "@/config/links";
import {
  buildMobileConfig,
  buildSxcu,
  canUpload,
  looksLikeApiKey,
  serializeSxcu,
  serverBaseUrl,
  sxcuFileName,
} from "@/lib/integrations/client-config";
import { readApiError } from "@/lib/utils/chunk";
import type { ApiKeyPermissions, ApiKeyPolicy, ApiKeyTool, ApiKeyView, CreatedApiKey } from "@/types/api-key";

type UploadPermissions = Pick<ApiKeyPermissions, "uploadImages" | "uploadText" | "uploadFiles">;

interface ToolSpec {
  id: ApiKeyTool;
  /** Nom de l'outil, en tête de son panneau. */
  title: string;
  platform: string;
  /** Nom proposé pour la clé, modifiable. */
  keyName: string;
  /** Ce que l'outil reçoit : un fichier `.sxcu` ou un QR code. */
  output: "sxcu" | "qr";
  permissions: UploadPermissions;
}

export const TOOLS: Record<ApiKeyTool, ToolSpec> = {
  sharex: {
    id: "sharex",
    title: "ShareX",
    platform: "Windows",
    keyName: "ShareX – Windows",
    output: "sxcu",
    // ShareX sait envoyer les trois : images, texte et fichiers.
    permissions: { uploadImages: true, uploadText: true, uploadFiles: true },
  },
  flameshot: {
    id: "flameshot",
    title: "Flameshot et fu",
    platform: "Linux",
    keyName: "Flameshot – Linux",
    output: "sxcu",
    // Flameshot ne produit que des captures.
    permissions: { uploadImages: true, uploadText: false, uploadFiles: false },
  },
  mobile: {
    id: "mobile",
    title: "ShareX Mobile",
    platform: "Android",
    keyName: "ShareX Mobile",
    output: "qr",
    // L'application envoie des photos et des fichiers partagés.
    permissions: { uploadImages: true, uploadText: false, uploadFiles: true },
  },
};

const PERMISSION_LABELS: Array<{ name: keyof UploadPermissions; label: string }> = [
  { name: "uploadImages", label: "Images" },
  { name: "uploadText", label: "Texte" },
  { name: "uploadFiles", label: "Fichiers" },
];

const DOCS = {
  windows: `${SITE_LINKS.repository}/blob/main/docs/integration-windows.md`,
  linux: `${SITE_LINKS.repository}/blob/main/docs/integration-linux.md`,
};

const relativeFormat = new Intl.RelativeTimeFormat("fr", { numeric: "always", style: "short" });

/** « il y a 3 h », « il y a 2 j », « à l’instant ». */
function relativeAgo(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "à l’instant";
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let chosen = units[0];
  for (const unit of units) if (abs >= unit[1]) chosen = unit;
  return relativeFormat.format(Math.round(seconds / chosen[1]), chosen[0]);
}

/**
 * État d'un outil, d'après les clés encore valides créées pour lui :
 * « Aucune clé pour cet outil », ou « 2 clés · dernier envoi il y a 3 h ».
 */
export function toolStatus(keys: ApiKeyView[], tool: ApiKeyTool, now = Date.now()): string {
  const mine = keys.filter((key) => key.tool === tool && !(key.expiresAt && new Date(key.expiresAt).getTime() < now));
  if (mine.length === 0) return "Aucune clé pour cet outil";
  const count = `${mine.length} clé${mine.length > 1 ? "s" : ""}`;
  const last = mine
    .map((key) => key.lastUsed)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return last ? `${count} · dernier envoi ${relativeAgo(last, now)}` : `${count} · aucun envoi pour l’instant`;
}

function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const noSubscribe = () => () => {};

/** Adresse que les outils appellent ; vide au rendu serveur, sans écart d'hydratation. */
function useServerBaseUrl(): string {
  return useSyncExternalStore(noSubscribe, serverBaseUrl, () => process.env.NEXT_PUBLIC_API_URL ?? "");
}

// ─── Page ─────────────────────────────────────────────────────────

export function IntegrationsPageClient({ viewerId }: { viewerId: string }) {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ApiKeyPolicy | null>(null);
  const baseUrl = useServerBaseUrl();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/api-keys");
      if (!response.ok) throw new Error(await readApiError(response, "Les clés API n’ont pas pu être chargées."));
      setKeys((await response.json()) as ApiKeyView[]);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, "Les clés API n’ont pas pu être chargées."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Les durées permises viennent de l'écran Sécurité ; le serveur les applique de toute façon.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/api-keys/policy")
      .then((response) => (response.ok ? (response.json() as Promise<ApiKeyPolicy>) : null))
      .then((value) => {
        if (!cancelled && value) setPolicy(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Un administrateur reçoit toutes les clés de l'instance : l'état ne compte que les siennes.
  const ownKeys = useMemo(() => keys.filter((key) => key.createdBy === viewerId), [keys, viewerId]);
  const onCreated = useCallback((view: ApiKeyView) => setKeys((current) => [...current, view]), []);

  const shared = { keys: ownKeys, loading, policy, baseUrl, onCreated };

  return (
    <main className="flex min-h-full w-full min-w-0 shrink-0 flex-col gap-6 pt-2 pb-2">
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <PageTitleIcon icon={THEMED_ICONS.integrations} />
          Intégrations
        </h1>
        <p className="max-w-3xl text-sm text-pretty text-muted-foreground sm:text-base">
          Chaque outil d’envoi reçoit sa propre clé API. Le serveur n’en garde qu’une empreinte : le fichier ou le QR
          code se récupère au moment de la création, pas après.
        </p>
        {baseUrl ? (
          <p className="min-w-0 text-sm text-muted-foreground">
            Les outils enverront vers <span className="break-all font-medium text-foreground">{baseUrl}</span>
          </p>
        ) : null}
      </header>

      {loadError ? (
        <div role="alert" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 break-words">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()} loading={loading} className="shrink-0">
            <RotateCw className="size-4" />
            Réessayer
          </Button>
        </div>
      ) : null}

      <ToolSection spec={TOOLS.sharex} {...shared} guide={(name) => <SharexGuide name={name} />} />
      <ToolSection spec={TOOLS.flameshot} {...shared} guide={(name) => <FlameshotGuide name={name} />} />
      <ToolSection spec={TOOLS.mobile} {...shared} guide={() => <MobileGuide />} />
    </main>
  );
}

// ─── Panneau d'un outil ───────────────────────────────────────────

interface ToolSectionProps {
  spec: ToolSpec;
  keys: ApiKeyView[];
  loading: boolean;
  policy: ApiKeyPolicy | null;
  baseUrl: string;
  onCreated: (view: ApiKeyView) => void;
  /** Étapes de l'outil ; reçoit le nom de la clé, qui nomme aussi l'uploader et le fichier. */
  guide: (name: string) => React.ReactNode;
}

function ToolSection({ spec, keys, loading, policy, baseUrl, onCreated, guide }: ToolSectionProps) {
  const titleId = useId();
  // Le nom de la clé nomme aussi l'uploader et le fichier : les étapes le reprennent.
  const [name, setName] = useState(spec.keyName);
  const configName = name.trim() || spec.keyName;

  return (
    <section aria-labelledby={titleId} data-tool={spec.id} className="min-w-0 rounded-xl border bg-card">
      <header className="flex min-w-0 flex-col gap-1.5 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
        <h2 id={titleId} className="min-w-0 text-lg font-semibold">
          {spec.title} <span className="font-normal text-muted-foreground">({spec.platform})</span>
        </h2>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {loading ? (
            <Skeleton className="h-4 w-44" aria-hidden />
          ) : (
            <span data-slot="tool-status" className="min-w-0 text-muted-foreground tabular-nums">
              {toolStatus(keys, spec.id)}
            </span>
          )}
          <Link href="/settings/api-keys" className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
            Gérer les clés
          </Link>
        </div>
      </header>

      <div className="grid min-w-0 gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">{guide(configName)}</div>
        <div className="min-w-0 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <KeyPanel
            spec={spec}
            name={name}
            onNameChange={setName}
            configName={configName}
            policy={policy}
            baseUrl={baseUrl}
            onCreated={onCreated}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Clé : créer ou coller ────────────────────────────────────────

interface KeyPanelProps {
  spec: ToolSpec;
  name: string;
  onNameChange: (name: string) => void;
  configName: string;
  policy: ApiKeyPolicy | null;
  baseUrl: string;
  onCreated: (view: ApiKeyView) => void;
}

function KeyPanel(props: KeyPanelProps) {
  return (
    <Tabs defaultValue="create" className="min-w-0 gap-4">
      <TabsList variant="line" className="h-auto w-full justify-start border-b pb-1">
        <TabsTrigger value="create" className="flex-none px-3">
          Créer une clé
        </TabsTrigger>
        <TabsTrigger value="paste" className="flex-none px-3">
          J’ai déjà une clé
        </TabsTrigger>
      </TabsList>
      <TabsContent value="create" className="min-w-0">
        <CreateKeyForm {...props} />
      </TabsContent>
      <TabsContent value="paste" className="min-w-0">
        <PasteKeyForm spec={props.spec} configName={props.configName} baseUrl={props.baseUrl} />
      </TabsContent>
    </Tabs>
  );
}

function PermissionChoices({
  idPrefix,
  legend,
  value,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  value: UploadPermissions;
  onChange: (value: UploadPermissions) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {PERMISSION_LABELS.map((permission) => {
          const id = `${idPrefix}-${permission.name}`;
          return (
            <div key={permission.name} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={value[permission.name]}
                onCheckedChange={(checked) => onChange({ ...value, [permission.name]: checked === true })}
              />
              <Label htmlFor={id} className="font-normal">
                {permission.label}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

interface CreatedSecret {
  key: string;
  name: string;
  permissions: ApiKeyPermissions;
}

function CreateKeyForm({ spec, name, onNameChange, policy, baseUrl, onCreated }: KeyPanelProps) {
  const idPrefix = useId();
  const [permissions, setPermissions] = useState<UploadPermissions>(spec.permissions);
  // `null` : la durée par défaut des réglages, connue une fois la politique lue.
  const [expiry, setExpiry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedSecret | null>(null);
  const feedback = useFeedback();

  const options = useMemo(() => expiryOptions(policy), [policy]);
  const selectedExpiry = expiry ?? defaultExpiry(policy);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    feedback.clear();
    const trimmed = name.trim();
    if (!trimmed) return feedback.error("Donnez un nom à la clé.");
    if (!canUpload(permissions)) return feedback.error("Cochez au moins un type d’envoi.");
    setBusy(true);
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          permissions: { ...permissions, extractColors: false },
          expiresInDays: selectedExpiry === NEVER ? null : Number(selectedExpiry),
          tool: spec.id,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "La clé n’a pas pu être créée. Réessayez."));
      const { key, ...view } = (await response.json()) as CreatedApiKey;
      onCreated(view);
      setCreated({ key, name: view.name, permissions: view.permissions });
    } catch (error) {
      feedback.error(errorMessage(error, "La clé n’a pas pu être créée. Réessayez."));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="min-w-0 space-y-4">
        <p role="status" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            Clé « {created.name} » créée. Elle ne sera plus affichée :{" "}
            {spec.output === "sxcu" ? "téléchargez le fichier maintenant." : "scannez le QR code maintenant."} Pour un
            autre appareil, créez une autre clé.
          </span>
        </p>
        <SecretLine secret={created.key} />
        <Deliverable spec={spec} baseUrl={baseUrl} apiKey={created.key} permissions={created.permissions} name={created.name} />
        <Button type="button" variant="outline" onClick={() => setCreated(null)}>
          J’ai terminé
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} onChange={feedback.state?.tone === "error" ? feedback.clear : undefined} className="min-w-0 space-y-4">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Nom de la clé</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={100}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>

      <PermissionChoices idPrefix={idPrefix} legend="Ce que la clé peut envoyer" value={permissions} onChange={setPermissions} />

      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-expiry`}>Durée de validité</Label>
        <Select value={selectedExpiry} onValueChange={setExpiry}>
          <SelectTrigger id={`${idPrefix}-expiry`} className="w-full min-w-0 sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {policy?.maxExpiryDays ? (
          <p className="text-xs text-muted-foreground">
            Les réglages de sécurité limitent la durée à {durationLabel(policy.maxExpiryDays)}.
          </p>
        ) : null}
      </div>

      <FormStatus state={feedback.state} />
      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        Créer une clé pour {spec.title}
      </Button>
    </form>
  );
}

function PasteKeyForm({ spec, configName, baseUrl }: { spec: ToolSpec; configName: string; baseUrl: string }) {
  const idPrefix = useId();
  const [value, setValue] = useState("");
  const [permissions, setPermissions] = useState<UploadPermissions>(spec.permissions);
  const key = value.trim();
  const valid = looksLikeApiKey(key);

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-key`}>Clé API</Label>
        <Input
          id={`${idPrefix}-key`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="sk_…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={key !== "" && !valid}
          aria-describedby={`${idPrefix}-key-help`}
          className="font-mono"
        />
        <p id={`${idPrefix}-key-help`} className="text-xs text-muted-foreground">
          La clé reste dans ce navigateur : {spec.output === "sxcu" ? "le fichier" : "le QR code"} est fabriqué ici, rien
          n’est envoyé au serveur.
        </p>
        {key !== "" && !valid ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            Une clé tient en un seul bloc, sans espace, et commence en général par sk_.
          </p>
        ) : null}
      </div>

      <PermissionChoices
        idPrefix={idPrefix}
        legend={spec.output === "sxcu" ? "Ce que la clé peut envoyer (elle doit le permettre)" : "Ce que la clé peut envoyer"}
        value={permissions}
        onChange={setPermissions}
      />

      {valid ? (
        <Deliverable
          spec={spec}
          baseUrl={baseUrl}
          apiKey={key}
          permissions={{ ...permissions, extractColors: false }}
          name={configName}
        />
      ) : null}
    </div>
  );
}

// ─── Ce que l'outil reçoit ────────────────────────────────────────

function Deliverable({
  spec,
  baseUrl,
  apiKey,
  permissions,
  name,
}: {
  spec: ToolSpec;
  baseUrl: string;
  apiKey: string;
  permissions: ApiKeyPermissions;
  name: string;
}) {
  if (spec.output === "qr") return <MobileQrCode baseUrl={baseUrl} apiKey={apiKey} permissions={permissions} />;
  return <SxcuDownload baseUrl={baseUrl} apiKey={apiKey} permissions={permissions} name={name} />;
}

function SxcuDownload({
  baseUrl,
  apiKey,
  permissions,
  name,
}: {
  baseUrl: string;
  apiKey: string;
  permissions: ApiKeyPermissions;
  name: string;
}) {
  const feedback = useFeedback();
  const fileName = sxcuFileName(name);

  if (!canUpload(permissions)) {
    return <p className="text-sm text-muted-foreground">Cochez au moins un type d’envoi pour fabriquer le fichier.</p>;
  }

  const download = () => {
    downloadText(fileName, serializeSxcu(buildSxcu({ baseUrl, key: apiKey, permissions, name })));
    feedback.success(`${fileName} téléchargé`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Button type="button" onClick={download} className="w-full sm:w-auto">
        <Download className="size-4" />
        Télécharger le fichier .sxcu
      </Button>
      <ActionStatus state={feedback.state} />
    </div>
  );
}

function MobileQrCode({ baseUrl, apiKey, permissions }: { baseUrl: string; apiKey: string; permissions: ApiKeyPermissions }) {
  const data = useMemo(() => JSON.stringify(buildMobileConfig({ baseUrl, key: apiKey, permissions })), [baseUrl, apiKey, permissions]);
  const [image, setImage] = useState<{ data: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(data, { width: 256, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then((url) => {
        if (!cancelled) {
          setImage({ data, url });
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Le QR code n’a pas pu être dessiné. Rechargez la page et réessayez.
      </p>
    );
  }

  const current = image?.data === data ? image.url : null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {/* Fond blanc fixe dans les deux thèmes : un lecteur de QR code a besoin de ce contraste. */}
      <div className="rounded-lg bg-white p-2">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- image locale en data URL
          <img src={current} alt="QR code de configuration pour ShareX Mobile" className="size-52 max-w-full" />
        ) : (
          <Skeleton className="size-52 bg-neutral-200" aria-label="QR code en préparation" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">Il contient la clé : ne le partagez pas en capture.</p>
    </div>
  );
}

// ─── Copie ────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const { hasCopied, copyFailed, copyToClipboard } = useCopyToClipboard();
  return (
    <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => void copyToClipboard(text)}>
      {hasCopied ? (
        <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
      ) : copyFailed ? (
        <X className="size-4 text-destructive" />
      ) : (
        <Copy className="size-4" />
      )}
      <span aria-live="polite">{hasCopied ? "Copié" : copyFailed ? "Copie impossible" : label}</span>
    </Button>
  );
}

function SecretLine({ secret }: { secret: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-muted px-3 py-2">
      <code className="min-w-0 flex-1 py-1 text-xs break-all">{secret}</code>
      <CopyButton text={secret} label="Copier la clé" />
    </div>
  );
}

/** Commandes à coller dans un terminal ; « Copier » prend toutes les lignes. */
function CommandBlock({ lines, label }: { lines: string[]; label?: string }) {
  return (
    <div className="min-w-0">
      {label ? <p className="mb-1 text-xs text-muted-foreground">{label}</p> : null}
      <div className="flex min-w-0 items-start gap-2 rounded-lg bg-muted px-3 py-2">
        <pre className="min-w-0 flex-1 py-1 text-[13px] leading-relaxed whitespace-pre-wrap break-all">
          <code>{lines.join("\n")}</code>
        </pre>
        <CopyButton text={lines.join("\n")} />
      </div>
    </div>
  );
}

// ─── Étapes de chaque outil ───────────────────────────────────────

const stepListClassName = "min-w-0 list-decimal space-y-3 pl-5 text-sm marker:text-muted-foreground";

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-medium">{children}</kbd>;
}

function SharexGuide({ name }: { name: string }) {
  return (
    <div className="min-w-0 space-y-4">
      <ol className={stepListClassName}>
        <li>
          Installez <DocLink href="https://getsharex.com">ShareX</DocLink>, gratuit et libre.
        </li>
        <li>Créez une clé dans ce panneau, puis téléchargez le fichier .sxcu.</li>
        <li>
          Double-cliquez sur le fichier : ShareX propose d’importer l’uploader, répondez Oui. À la main : Destinations,
          Custom uploader settings…, Import, From file.
        </li>
        <li>
          Dans Destinations, choisissez « {name} » comme Image uploader, et comme File uploader ou Text uploader si la
          clé les permet.
        </li>
        <li>
          Capturez avec <Kbd>Impr. écran</Kbd> : ShareX envoie l’image ici et copie son adresse.
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">
        Erreur 401 ou 403 : la clé est expirée, supprimée, ou ne permet pas ce type de fichier.{" "}
        <DocLink href={DOCS.windows}>Guide complet</DocLink>
      </p>
    </div>
  );
}

function FlameshotGuide({ name }: { name: string }) {
  const fileName = sxcuFileName(name);
  const uploader = fileName.replace(/\.sxcu$/, "");
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        <DocLink href="https://github.com/pedrokarim/flameshot-uploader">fu</DocLink> lit le même fichier .sxcu que ShareX,
        sans modification, et envoie les captures de Flameshot.
      </p>
      <ol className={stepListClassName}>
        <li className="space-y-2">
          <p>Installez Flameshot, xclip et jq. Sans jq, la capture part mais aucune adresse n’est copiée.</p>
          <CommandBlock label="Debian, Ubuntu" lines={["sudo apt install flameshot xclip jq"]} />
          <CommandBlock label="Arch" lines={["sudo pacman -S flameshot xclip jq"]} />
          <CommandBlock label="Fedora" lines={["sudo dnf install flameshot xclip jq"]} />
        </li>
        <li className="space-y-2">
          <p>Installez fu, qui se place dans ~/.local/bin.</p>
          <CommandBlock lines={["curl -fsSL https://pedrokarim.github.io/flameshot-uploader/install.sh | sh"]} />
        </li>
        <li className="space-y-2">
          <p>
            Créez une clé, téléchargez {fileName}, puis enregistrez-le dans fu (adaptez le dossier s’il a été enregistré
            ailleurs).
          </p>
          <CommandBlock lines={[`fu add ~/Téléchargements/${fileName}`, `fu default ${uploader}`]} />
          <p className="text-muted-foreground">
            Pour essayer : <code className="rounded bg-muted px-1 py-0.5 text-[13px]">fu gui</code>, sélectionnez une zone,
            l’adresse est copiée.
          </p>
        </li>
        <li className="space-y-2">
          <p>
            Sous GNOME, associez <Kbd>Impr. écran</Kbd> à fu : Paramètres, Clavier, « Voir et personnaliser les
            raccourcis ». Dans Captures d’écran, passez « Effectuer une capture d’écran interactivement » sur Désactivé,
            puis ajoutez un raccourci personnalisé :
          </p>
          <CommandBlock label="Nom" lines={["Trigger flameshot uploader"]} />
          <CommandBlock label="Commande" lines={["fu gui"]} />
          <p className="text-muted-foreground">Raccourci : la touche Impr. écran.</p>
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">
        <DocLink href={DOCS.linux}>Guide complet, avec captures</DocLink>
      </p>
    </div>
  );
}

function MobileGuide() {
  return (
    <ol className={stepListClassName}>
      <li>Ouvrez l’application ShareX Mobile, onglet Paramètres.</li>
      <li>Sur la carte « Serveur ShareX », touchez l’icône de QR code.</li>
      <li>
        Créez une clé dans ce panneau, puis visez le QR code : l’adresse du serveur et la clé s’enregistrent dans
        l’application.
      </li>
    </ol>
  );
}
