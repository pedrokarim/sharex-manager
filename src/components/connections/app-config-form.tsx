"use client";

/**
 * Configuration de l'application d'un service, sans sortir du parcours : la
 * marche à suivre en étapes cochables, la console ouverte dans un nouvel
 * onglet, l'adresse de retour à copier, puis l'identifiant, le secret et les
 * réglages propres au service (`app.settings`) collés ici. Ce qui vient de
 * l'environnement du serveur est affiché comme tel et ne se saisit pas ; la
 * forme de chaque valeur est vérifiée pendant la frappe.
 */

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleX, ExternalLink, Server } from "lucide-react";
import { ActionStatus, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { clearAppAction, saveAppAction } from "@/app/(app)/admin/connections/actions";
import type { AppSettingStatus, ConnectionsOverview, ConnectorView } from "./types";
import { CopyField, LinkifiedText } from "./shared";

type Shape = { ok: true } | { ok: false; message: string } | null;

/** Forme d'un identifiant ou d'un secret : pas d'espace, pas trop long. */
function credentialShape(value: string, label: string): Shape {
  if (!value) return null;
  if (/\s/.test(value)) return { ok: false, message: `${label} ne contient pas d’espace : vérifiez le copier-coller.` };
  if (value.length > 300) return { ok: false, message: `${label} trop long (300 caractères au plus).` };
  return { ok: true };
}

function settingShape(setting: AppSettingStatus, value: string): Shape {
  if (!value) return null;
  if (value.length > 500) return { ok: false, message: "500 caractères au plus." };
  if (setting.pattern) {
    try {
      if (!new RegExp(`^(?:${setting.pattern})$`).test(value.trim())) return { ok: false, message: setting.help ? `Cette valeur n’a pas la forme attendue. ${setting.help}` : "Cette valeur n’a pas la forme attendue." };
    } catch {
      return null;
    }
  }
  return { ok: true };
}

function ShapeHint({ shape, okText = "Bonne forme" }: { shape: Shape; okText?: string }) {
  if (!shape) return null;
  return shape.ok ? (
    <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-3.5 shrink-0" />
      {okText}
    </p>
  ) : (
    <p className="flex items-start gap-1.5 text-xs text-destructive">
      <CircleX className="mt-px size-3.5 shrink-0" />
      {shape.message}
    </p>
  );
}

/** Valeur fournie par l'environnement : montrée, pas modifiable ici. */
function FromEnvironment({ label, envName, value }: { label: string; envName: string; value?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-md border border-dashed px-3 py-2.5">
      <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Fourni par l’environnement du serveur (<code className="font-mono break-all">{envName}</code>)
          {value ? (
            <>
              {" "}: <span className="font-mono break-all text-foreground">{value}</span>
            </>
          ) : null}
          . Se modifie là, pas ici.
        </p>
      </div>
    </div>
  );
}

export function AppConfigForm({
  connector,
  submitLabel,
  onSaved,
  allowClear = false,
}: {
  connector: ConnectorView;
  submitLabel: string;
  onSaved: (overview: ConnectionsOverview) => void;
  /** Bouton « Effacer la configuration » (réglages du service, pas le parcours). */
  allowClear?: boolean;
}) {
  const app = connector.app;
  const fromEnv = app?.source === "env";
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // « Enregistrée » ou « effacée », à côté des boutons, quand le formulaire
  // reste affiché (tiroir des réglages) ; dans l'assistant, l'étape suivante
  // s'ouvre et suffit.
  const saved = useFeedback();

  useEffect(() => {
    setClientId(app?.source === "file" ? (app.clientId ?? "") : "");
    setClientSecret("");
    setSettings(Object.fromEntries((app?.settings ?? []).filter((setting) => setting.source !== "env" && !setting.secret).map((setting) => [setting.key, setting.value ?? ""])));
    setError(null);
  }, [connector.id, app]);

  const editableSettings = (app?.settings ?? []).filter((setting) => setting.source !== "env");
  // Noms de l'identifiant et du secret tels que la console du service les affiche (« Client key » chez TikTok).
  const idLabel = app?.credentialLabels?.clientId ?? "Identifiant du client";
  const secretLabel = app?.credentialLabels?.clientSecret ?? "Secret du client";
  const secretKept = app?.source === "file" && !app.secretUnreadable;

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!fromEnv) {
      if (!clientId.trim()) list.push("L’identifiant du client est obligatoire.");
      const idShape = credentialShape(clientId.trim(), "L’identifiant");
      if (idShape && !idShape.ok) list.push(idShape.message);
      if (!clientSecret.trim() && !secretKept) list.push("Le secret du client est obligatoire.");
      const secretShape = credentialShape(clientSecret.trim(), "Le secret");
      if (secretShape && !secretShape.ok) list.push(secretShape.message);
    }
    for (const setting of editableSettings) {
      const value = (settings[setting.key] ?? "").trim();
      const kept = setting.secret && setting.source === "file";
      if (setting.required && !value && !kept) list.push(`${setting.label} : obligatoire.`);
      const shape = settingShape(setting, value);
      if (shape && !shape.ok) list.push(`${setting.label} : ${shape.message}`);
    }
    return list;
  }, [fromEnv, clientId, clientSecret, secretKept, editableSettings, settings]);

  const nothingToEnter = fromEnv && editableSettings.length === 0;

  const submit = async () => {
    if (problems.length > 0 || nothingToEnter) return;
    setBusy("save");
    setError(null);
    saved.clear();
    const input: { clientId?: string; clientSecret?: string; settings?: Record<string, string> } = {};
    if (!fromEnv) {
      input.clientId = clientId.trim();
      input.clientSecret = clientSecret.trim();
    }
    if (editableSettings.length > 0) input.settings = Object.fromEntries(editableSettings.map((setting) => [setting.key, (settings[setting.key] ?? "").trim()]));
    const result = await saveAppAction(connector.id, input);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    saved.success("Enregistrée");
    onSaved(result.data);
  };

  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Chez {connector.label}</h3>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={connector.consoleUrl} target="_blank" rel="noreferrer noopener">
              Ouvrir la console
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
        {connector.setupSteps.length > 0 ? (
          <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
            {connector.setupSteps.map((step, index) => {
              const checked = done.has(index);
              return (
                <li key={step}>
                  <label className={cn("flex min-w-0 cursor-pointer items-start gap-3 rounded-md px-1 py-1 text-sm hover:bg-muted/50", checked && "text-muted-foreground")}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        setDone((current) => {
                          const next = new Set(current);
                          if (value === true) next.add(index);
                          else next.delete(index);
                          return next;
                        })
                      }
                      className="mt-0.5"
                      aria-label={`Étape ${index + 1} faite`}
                    />
                    <span className="w-5 shrink-0 text-right font-medium tabular-nums text-muted-foreground">{index + 1}.</span>
                    <span className={cn("min-w-0 text-pretty [overflow-wrap:anywhere]", checked && "line-through decoration-muted-foreground/50")}>
                      <LinkifiedText text={step} />
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Créez une application dans la console du service, puis recopiez ici ses identifiants.</p>
        )}
      </section>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <Label>Adresse de retour à déclarer chez {connector.label}</Label>
        {app?.redirectUri ? (
          <CopyField value={app.redirectUri} label="Copier l’adresse de retour" />
        ) : (
          <p className="text-sm text-destructive">AUTH_URL n’est pas défini sur le serveur : l’adresse de retour ne peut pas être construite.</p>
        )}
      </section>

      {app?.signedCallbacks ? (
        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Adresses de rappel à déclarer chez {connector.label}</Label>
          <p className="text-xs text-pretty text-muted-foreground">
            Dans les paramètres de l’application, champs de désinstallation (retrait de l’autorisation) et de suppression des données. Chaque
            appel est vérifié par la signature de l’application.
          </p>
          <span className="text-xs font-medium">Désinstallation</span>
          <CopyField value={app.signedCallbacks.deauthorize} label="Copier l’adresse de désinstallation" />
          <span className="text-xs font-medium">Suppression des données</span>
          <CopyField value={app.signedCallbacks.dataDeletion} label="Copier l’adresse de suppression des données" />
        </section>
      ) : null}

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <h3 className="text-sm font-semibold">Identifiants de l’application</h3>
        {fromEnv ? (
          <FromEnvironment label={app?.credentialLabels ? `${app.credentialLabels.clientId} et ${app.credentialLabels.clientSecret}` : "Identifiant et secret du client"} envName={`${app?.envNames.clientId} et ${app?.envNames.clientSecret}`} value={app?.clientId} />
        ) : (
          <>
            {app?.secretUnreadable ? (
              <p className="text-sm text-destructive">Le secret enregistré ne se déchiffre plus (clé de chiffrement changée) : collez-le de nouveau.</p>
            ) : null}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor={`${connector.id}-client-id`}>{idLabel}</Label>
              <Input
                id={`${connector.id}-client-id`}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
                aria-invalid={credentialShape(clientId.trim(), "")?.ok === false || undefined}
              />
              <ShapeHint shape={credentialShape(clientId.trim(), "L’identifiant")} />
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor={`${connector.id}-client-secret`}>{secretLabel}</Label>
              <Input
                id={`${connector.id}-client-secret`}
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
                placeholder={secretKept ? "Laisser vide pour garder le secret enregistré" : ""}
                aria-invalid={credentialShape(clientSecret.trim(), "")?.ok === false || undefined}
              />
              {clientSecret ? (
                <ShapeHint shape={credentialShape(clientSecret.trim(), "Le secret")} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Chiffré sur le serveur, jamais réaffiché. Possible aussi par l’environnement : {app?.envNames.clientId} et {app?.envNames.clientSecret}.
                </p>
              )}
            </div>
          </>
        )}

        {(app?.settings ?? []).map((setting) =>
          setting.source === "env" ? (
            <FromEnvironment key={setting.key} label={setting.label} envName={setting.envName ?? setting.key} value={setting.secret ? undefined : setting.value} />
          ) : setting.kind === "toggle" ? (
            <label key={setting.key} className="flex min-w-0 cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                id={`${connector.id}-setting-${setting.key}`}
                checked={settings[setting.key] === "true"}
                onCheckedChange={(value) => setSettings((current) => ({ ...current, [setting.key]: value === true ? "true" : "" }))}
                className="mt-0.5"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{setting.label}</span>
                {setting.help ? (
                  <span className="text-xs text-pretty text-muted-foreground">
                    <LinkifiedText text={setting.help} />
                  </span>
                ) : null}
              </span>
            </label>
          ) : (
            <div key={setting.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor={`${connector.id}-setting-${setting.key}`}>
                {setting.label}
                {setting.required ? null : <span className="font-normal text-muted-foreground"> (facultatif)</span>}
              </Label>
              <Input
                id={`${connector.id}-setting-${setting.key}`}
                type={setting.secret ? "password" : "text"}
                value={settings[setting.key] ?? ""}
                onChange={(event) => setSettings((current) => ({ ...current, [setting.key]: event.target.value }))}
                autoComplete={setting.secret ? "new-password" : "off"}
                spellCheck={false}
                placeholder={setting.secret && setting.source === "file" ? "Laisser vide pour garder la valeur enregistrée" : ""}
                className="font-mono text-xs"
                aria-invalid={settingShape(setting, (settings[setting.key] ?? "").trim())?.ok === false || undefined}
              />
              {settingShape(setting, (settings[setting.key] ?? "").trim()) ? (
                <ShapeHint shape={settingShape(setting, (settings[setting.key] ?? "").trim())} />
              ) : setting.help || setting.envName ? (
                <p className="text-xs text-pretty text-muted-foreground">
                  {setting.help ? <LinkifiedText text={setting.help} /> : null}
                  {setting.envName ? `${setting.help ? " " : ""}Possible aussi par ${setting.envName}.` : ""}
                </p>
              ) : null}
            </div>
          )
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!nothingToEnter || (allowClear && app?.source === "file") ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {allowClear && app?.source === "file" ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              loading={busy === "clear"}
              disabled={busy !== null}
              onClick={async () => {
                setBusy("clear");
                setError(null);
                saved.clear();
                const result = await clearAppAction(connector.id);
                setBusy(null);
                if (!result.ok) return setError(result.error);
                saved.success("Configuration effacée");
                onSaved(result.data);
              }}
            >
              Effacer la configuration
            </Button>
          ) : (
            <span />
          )}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <ActionStatus state={saved.state} />
            {nothingToEnter ? null : (
              <Button type="submit" loading={busy === "save"} disabled={busy !== null || problems.length > 0} className="gap-2">
                {submitLabel}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </form>
  );
}
