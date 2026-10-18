"use client";

/**
 * Onglet Règles : le niveau des limites de débit (trois cartes à choisir,
 * chacune avec ses chiffres), la conservation des journaux et la part des
 * affichages d'images notée, et les alertes à lever. Chaque panneau
 * enregistre sa propre section.
 */

import { useId } from "react";
import { BellRing, Eye, Gauge, ImageUp, ScrollText, Upload, Webhook, type LucideIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Panel, PanelBody, PanelHeader, PanelRows } from "@/components/connections/panel";
import { ALERT_KINDS, RATE_LIMIT_LEVELS, type AlertKind, type ImageViewLogging, type RateLimitLevel, type RateLimitValues } from "@/lib/security/settings-schema";
import { cn } from "@/lib/utils";
import { useSettings } from "./data";
import { useSectionForm } from "./settings-form";
import { PanelError, SettingRow, SettingsFooter, SettingsSkeleton, StopsSlider, SwitchRow, daysLabel, shortDays } from "./shared";

export function RulesTab() {
  const settings = useSettings();
  if (settings.state.status === "error") {
    return (
      <Panel>
        <PanelHeader icon={Gauge} title="Règles" />
        <PanelError message={settings.state.error} onRetry={() => void settings.reload()} />
      </Panel>
    );
  }
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
      <RateLimitsPanel className="xl:col-span-2" />
      <LogsPanel />
      <AlertsSettingsPanel />
    </div>
  );
}

// ─── Limites de débit ─────────────────────────────────────────────

const LEVELS: Record<RateLimitLevel, { label: string; hint: string }> = {
  relaxed: { label: "Souple", hint: "Pour une instance à plusieurs, avec beaucoup d’envois automatiques." },
  normal: { label: "Normale", hint: "Le bon réglage pour la plupart des instances." },
  strict: { label: "Stricte", hint: "Pour une instance exposée qui reçoit peu de trafic légitime." },
};

const METRICS: { key: keyof RateLimitValues; icon: LucideIcon; unit: string; name: string; legend: string }[] = [
  { key: "uploadsPerKeyPerHour", icon: Upload, unit: "envois / h", name: "Envois", legend: "par clé API et par heure" },
  { key: "imageViewsPerIpPerMinute", icon: ImageUp, unit: "images / min", name: "Images", legend: "affichages par adresse IP et par minute" },
  { key: "publicApiPerIpPerMinute", icon: Webhook, unit: "appels / min", name: "Appels", legend: "API publique, par adresse IP et par minute" },
];

function RateLimitsPanel({ className }: { className?: string }) {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("rateLimits", settings);
  const payload = settings.state.status === "ready" ? settings.state.data : null;
  const value = form.value;
  const keyLimit = payload?.settings.apiKeys.uploadsPerHour ?? null;

  return (
    <Panel aria-labelledby={titleId} className={cn("@container", className)}>
      <PanelHeader icon={Gauge} title="Limites de débit" titleId={titleId} description="Ce qu’une clé ou une adresse peut demander avant d’être freinée. Une demande de trop reçoit « Trop de requêtes »." />
      {!value || !payload ? (
        <SettingsSkeleton rows={2} />
      ) : (
        <PanelBody className="grid gap-4">
          <div role="radiogroup" aria-label="Niveau des limites de débit" className="grid min-w-0 gap-3 @lg:grid-cols-3">
            {RATE_LIMIT_LEVELS.map((level) => {
              const selected = value.level === level;
              const values = payload.rateLimitPresets[level];
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={form.saving}
                  onClick={() => form.update({ level })}
                  className={cn(
                    "grid min-w-0 content-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/25 hover:bg-muted/40"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-muted-foreground/50")}>
                      {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="min-w-0 text-sm font-semibold">{LEVELS[level].label}</span>
                    {level === "normal" ? <span className="ml-auto shrink-0 text-[11px] text-foreground/65">Par défaut</span> : null}
                  </span>
                  <span className="text-xs text-pretty text-foreground/65">{LEVELS[level].hint}</span>
                  <span className="grid min-w-0 gap-1.5">
                    {METRICS.map((metric) => (
                      <span key={metric.key} className="flex min-w-0 items-center gap-2 text-xs">
                        <metric.icon aria-hidden className="size-3.5 shrink-0 text-foreground/65" />
                        <span className="font-semibold tabular-nums">{values[metric.key].toLocaleString("fr-FR")}</span>
                        <span className="min-w-0 truncate text-foreground/65" title={`${metric.name} ${metric.legend}`}>
                          {metric.unit}
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <ul className="grid gap-1 text-xs text-pretty text-muted-foreground">
            {METRICS.map((metric) => (
              <li key={metric.key} className="flex min-w-0 items-start gap-2">
                <metric.icon aria-hidden className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0">
                  <span className="font-medium text-foreground/80">{metric.name}</span> : {metric.legend}
                  {metric.key === "uploadsPerKeyPerHour" && keyLimit !== null && keyLimit < payload.rateLimitPresets[value.level].uploadsPerKeyPerHour
                    ? `, ramenés à ${keyLimit.toLocaleString("fr-FR")} par la règle des clés`
                    : ""}
                  .
                </span>
              </li>
            ))}
          </ul>
        </PanelBody>
      )}
      <SettingsFooter form={form} note="S’applique aussitôt, sans redémarrage." />
    </Panel>
  );
}

// ─── Journaux ─────────────────────────────────────────────────────

const RETENTION_STOPS = [30, 90, 180, 365] as const;

const IMAGE_VIEWS: Record<ImageViewLogging, { label: string; hint: string }> = {
  all: { label: "Toutes", hint: "Chaque affichage d’image est noté : statistiques complètes, journal plus lourd." },
  sampled: { label: "Une sur vingt", hint: "Un affichage sur vingt est noté : les tendances restent lisibles, le journal reste léger." },
  off: { label: "Aucune", hint: "Les affichages d’images ne sont pas notés : plus de statistiques de vues." },
};

function LogsPanel() {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("logs", settings);
  const value = form.value;
  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={ScrollText} title="Journaux" titleId={titleId} description="Ce qui est noté, et combien de temps c’est gardé." />
      {!value ? (
        <SettingsSkeleton rows={2} />
      ) : (
        <PanelRows>
          <SettingRow id="logs-retention" label="Conservation" value={daysLabel(value.retentionDays)} description="Au-delà, les entrées du journal et les alertes déjà vues sont effacées, une fois par jour.">
            <StopsSlider stops={RETENTION_STOPS} value={value.retentionDays} onChange={(retentionDays) => form.update({ retentionDays })} format={shortDays} label="Conservation des journaux" disabled={form.saving} />
          </SettingRow>
          <SettingRow id="logs-image-views" label="Vues d’images" description={IMAGE_VIEWS[value.imageViews].hint}>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={value.imageViews}
              onValueChange={(next) => next && form.update({ imageViews: next as ImageViewLogging })}
              aria-label="Vues d’images notées"
              className="w-full"
              disabled={form.saving}
            >
              {(Object.keys(IMAGE_VIEWS) as ImageViewLogging[]).map((key) => (
                <ToggleGroupItem key={key} value={key} className="min-w-0 flex-1 gap-1.5 px-2 text-xs">
                  {key === "all" ? <Eye aria-hidden className="size-3.5" /> : null}
                  {IMAGE_VIEWS[key].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </SettingRow>
        </PanelRows>
      )}
      <SettingsFooter form={form} />
    </Panel>
  );
}

// ─── Alertes ──────────────────────────────────────────────────────

const ALERT_LABELS: Record<AlertKind, { label: string; description: string }> = {
  failedSignIns: { label: "Échecs de connexion répétés", description: "Quand un compte ou une adresse est bloqué après trop d’échecs." },
  newApiKey: { label: "Nouvelle clé API", description: "À chaque clé créée, par n’importe quel compte." },
  adminNewIp: { label: "Administrateur depuis une nouvelle adresse", description: "Première connexion d’un administrateur depuis une adresse jamais vue pour lui." },
  fileMadePublic: { label: "Fichier rendu public", description: "Quand un fichier privé devient visible sans connexion." },
};

function AlertsSettingsPanel() {
  const titleId = useId();
  const settings = useSettings();
  const form = useSectionForm("alerts", settings);
  const value = form.value;
  return (
    <Panel aria-labelledby={titleId}>
      <PanelHeader icon={BellRing} title="Alertes" titleId={titleId} description="Ce qui s’affiche dans le panneau Alertes de l’onglet État." />
      {!value ? (
        <SettingsSkeleton rows={2} />
      ) : (
        <PanelRows>
          {ALERT_KINDS.map((kind) => (
            <SwitchRow
              key={kind}
              id={`alert-${kind}`}
              label={ALERT_LABELS[kind].label}
              description={ALERT_LABELS[kind].description}
              checked={value[kind]}
              disabled={form.saving}
              onChange={(checked) => form.update({ [kind]: checked })}
            />
          ))}
        </PanelRows>
      )}
      <SettingsFooter form={form} note="Une alerte coupée n’est plus enregistrée ; le journal note toujours l’événement." />
    </Panel>
  );
}
