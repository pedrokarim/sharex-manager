"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, Download, FileText, Loader2, ScanSearch, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { callModule, downloadCleanImage, downloadImage, formatBytes, imageUrl } from "../lib/client";
import {
  describeSourceType,
  provenanceLabel,
  type CleanResult,
  type ManifestSignature,
  type ProvenanceReport,
  type ProvenanceSummary,
} from "../lib/provenance-types";

// ─── Indicateurs de la grille : un appel pour toute une page ─────

const summaries = new Map<string, ProvenanceSummary>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

function notify() {
  version++;
  for (const listener of listeners) listener();
}

/**
 * Chaque vignette demande son indicateur ; les demandes d'un même rendu
 * partent ensemble, en une seule requête.
 */
function request(file: string) {
  if (summaries.has(file) || waiting.has(file)) return;
  waiting.add(file);
  flushTimer ??= setTimeout(async () => {
    flushTimer = null;
    const files = Array.from(waiting);
    try {
      const result = await callModule<Record<string, ProvenanceSummary>>("inspectImages", files);
      for (const [name, summary] of Object.entries(result ?? {})) summaries.set(name, summary);
    } catch {
      // Pas d'indicateur plutôt qu'un indicateur faux.
    }
    for (const name of files) waiting.delete(name);
    notify();
  }, 40);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useProvenanceSummary(file: string): ProvenanceSummary | undefined {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => request(file), [file]);
  return summaries.get(file);
}

function StatusIcon({ status, className }: { status: ProvenanceSummary["status"]; className?: string }) {
  if (status === "signed") return <BadgeCheck className={className} />;
  if (status === "metadata") return <FileText className={className} />;
  return <ScanSearch className={className} />;
}

/**
 * Indicateur d'origine d'une vignette. Une image signée ou porteuse de
 * métadonnées l'affiche en clair ; une image où rien n'a été trouvé ne porte
 * qu'une icône discrète, dont le libellé dit bien « trouvée ».
 */
export function ProvenanceBadge({ file, className }: { file: string; className?: string }) {
  const summary = useProvenanceSummary(file);
  if (!summary) return null;
  const label = provenanceLabel(summary);
  const quiet = summary.status === "none" || summary.status === "unsupported";
  const title =
    summary.status === "signed"
      ? `Manifeste C2PA : ${label}`
      : summary.status === "none"
        ? "Aucune signature trouvée dans le fichier"
        : label;

  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "pointer-events-none absolute z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-medium leading-none text-white backdrop-blur-sm",
        quiet && "bg-black/35 text-white/80",
        className
      )}
    >
      <StatusIcon status={summary.status} className="h-3 w-3 shrink-0" />
      {!quiet && <span className="truncate">{label}</span>}
    </span>
  );
}

// ─── Panneau de détail ───────────────────────────────────────────

interface Detail {
  report: ProvenanceReport;
  clean: CleanResult | null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const formatDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
};

/** L'état de la signature, dit sans en promettre plus que ce qui a été contrôlé. */
function signatureLine(signature: ManifestSignature): { icon: ReactNode; text: string } {
  if (signature.validity === "invalid") {
    return {
      icon: <ShieldAlert className="h-3.5 w-3.5 text-destructive" />,
      text: "Invalide : la signature ne correspond pas à la déclaration.",
    };
  }
  if (signature.validity === "consistent") {
    return {
      icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
      text: "Cohérente avec le certificat embarqué. La chaîne de confiance de ce certificat n’est pas contrôlée.",
    };
  }
  return {
    icon: <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground" />,
    text: signature.detail ?? "Non vérifiée.",
  };
}

const HASH_LABELS = {
  match: "concorde",
  mismatch: "ne concorde pas",
  unchecked: "non contrôlée",
} as const;

/**
 * Origine d'une image dans la visionneuse : ce qui a été lu dans le fichier,
 * sans interprétation, et les deux téléchargements.
 */
export function ProvenancePanel({ file }: { file: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    callModule<Detail>("inspectImageDetail", file)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const report = detail?.report;
  const manifest = report?.manifest;
  const summary: ProvenanceSummary | null = report
    ? { status: report.status, generator: manifest?.generator?.name, digitalSourceType: manifest?.digitalSourceType }
    : null;

  const handleOriginal = async () => {
    try {
      await downloadImage(imageUrl(file), file);
    } catch {
      toast.error("Téléchargement impossible");
    }
  };

  const handleClean = async () => {
    setBusy(true);
    try {
      const clean = await downloadCleanImage(file);
      toast.success(
        clean.savedBytes > 0
          ? `Version propre : ${formatBytes(clean.savedBytes)} de métadonnées en moins, pixels identiques`
          : "Version propre : rien à retirer, fichier identique"
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Version propre indisponible");
    } finally {
      setBusy(false);
    }
  };

  const cleanDisabledReason = !report
    ? undefined
    : !report.removable
      ? report.removableReason
      : undefined;

  return (
    <section className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Origine</p>

      {!detail && !failed && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Lecture du fichier…
        </p>
      )}
      {failed && <p className="text-xs text-muted-foreground">Lecture des marques d’origine impossible.</p>}

      {report && summary && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
          >
            <StatusIcon status={report.status} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {report.status === "none" ? "Aucune signature trouvée dans le fichier" : provenanceLabel(summary)}
              </span>
              {manifest?.digitalSourceType && (
                <span className="block truncate text-xs text-muted-foreground">{manifest.digitalSourceType}</span>
              )}
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          </button>

          {expanded && (
            <div className="space-y-4 rounded-lg bg-muted/40 p-3">
              {manifest && (
                <dl className="space-y-1.5">
                  {manifest.generator && (
                    <Field label="Générateur">
                      {manifest.generator.name}
                      {manifest.generator.version ? ` ${manifest.generator.version}` : ""}
                    </Field>
                  )}
                  {manifest.digitalSourceType && (
                    <Field label="Nature">
                      <span className="font-mono">{manifest.digitalSourceType}</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {describeSourceType(manifest.digitalSourceType)}
                      </span>
                    </Field>
                  )}
                  {manifest.claimedAt && <Field label="Déclarée le">{formatDate(manifest.claimedAt)}</Field>}
                  {manifest.actions.length > 0 && (
                    <Field label="Actions">
                      <ul className="space-y-0.5">
                        {manifest.actions.map((action, index) => (
                          <li key={index}>
                            <span className="font-mono">{action.action}</span>
                            {action.agent ? ` – ${action.agent}` : ""}
                          </li>
                        ))}
                      </ul>
                    </Field>
                  )}
                  {manifest.signature && (
                    <>
                      <Field label="Signature">
                        <span className="flex items-start gap-1.5">
                          <span className="mt-0.5 shrink-0">{signatureLine(manifest.signature).icon}</span>
                          <span>{signatureLine(manifest.signature).text}</span>
                        </span>
                      </Field>
                      {manifest.signature.algorithm && <Field label="Algorithme">{manifest.signature.algorithm}</Field>}
                      {manifest.signature.signer && <Field label="Signataire">{manifest.signature.signer}</Field>}
                      {manifest.signature.issuer && <Field label="Émis par">{manifest.signature.issuer}</Field>}
                      {manifest.signature.validTo && (
                        <Field label="Certificat">
                          valable du {formatDate(manifest.signature.validFrom)} au {formatDate(manifest.signature.validTo)}
                        </Field>
                      )}
                      <Field label="Empreinte">
                        du fichier : {HASH_LABELS[manifest.signature.contentHash]} ; des assertions :{" "}
                        {HASH_LABELS[manifest.signature.assertionHashes]}
                      </Field>
                      <Field label="Horodatage">
                        {manifest.signature.timestamped ? "jeton d’un tiers présent" : "aucun jeton tiers"}
                      </Field>
                    </>
                  )}
                  {manifest.assertions.length > 0 && (
                    <Field label="Assertions">
                      <ul className="space-y-0.5 font-mono">
                        {manifest.assertions.map((assertion) => (
                          <li key={assertion.label}>
                            {assertion.label} <span className="text-muted-foreground">{formatBytes(assertion.bytes)}</span>
                          </li>
                        ))}
                      </ul>
                    </Field>
                  )}
                  {manifest.partial && <Field label="Lecture">Incomplète : {manifest.partial}</Field>}
                </dl>
              )}

              {manifest?.declaresWatermark && (
                <p className="text-xs leading-5 text-muted-foreground">
                  Le manifeste déclare un filigrane (<span className="font-mono">c2pa.watermarked</span>). Il est
                  inscrit dans les pixels : il n’est ni lisible ni retirable depuis le fichier.
                </p>
              )}

              {report.texts?.map((entry, index) => (
                <div key={index} className="space-y-1.5">
                  <p className="font-mono text-xs font-medium">{entry.keyword}</p>
                  {entry.parameters ? (
                    <dl className="space-y-1.5">
                      {entry.parameters.prompt && <Field label="Prompt">{entry.parameters.prompt}</Field>}
                      {entry.parameters.negativePrompt && (
                        <Field label="Négatif">{entry.parameters.negativePrompt}</Field>
                      )}
                      {Object.entries(entry.parameters.settings).map(([key, value]) => (
                        <Field key={key} label={key}>
                          {value}
                        </Field>
                      ))}
                    </dl>
                  ) : (
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {entry.text}
                      {entry.truncated ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}

              {(report.exif || report.xmp) && (
                <dl className="space-y-1.5">
                  {Object.entries({ ...report.exif, ...report.xmp }).map(([key, value]) => (
                    <Field key={key} label={key}>
                      {value}
                    </Field>
                  ))}
                </dl>
              )}

              {report.carriers.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Porteurs dans le fichier</p>
                  <ul className="space-y-0.5 font-mono text-xs">
                    {report.carriers.map((carrier, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span className="truncate">{carrier.label}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(carrier.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  Ni manifeste, ni EXIF, ni XMP, ni texte dans le conteneur.
                </p>
              )}

              {detail?.clean && (
                <p className="text-xs leading-5">
                  Version propre : {formatBytes(detail.clean.bytes)}, soit {formatBytes(detail.clean.savedBytes)} de
                  moins. Pixels identiques à l’original, vérifié par hachage.
                </p>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                Seul le fichier est lu. Un filigrane inscrit dans les pixels (SynthID et équivalents) n’est ni détecté
                ni retiré, et retirer un manifeste change ce que le fichier déclare, pas ce que l’image est.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <Button onClick={handleOriginal} className="w-full gap-2">
          <Download className="h-4 w-4" />
          Télécharger l’original
        </Button>
        <Button
          variant="outline"
          onClick={handleClean}
          disabled={busy || Boolean(cleanDisabledReason)}
          title={cleanDisabledReason}
          className="w-full gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Télécharger une version propre
        </Button>
        {cleanDisabledReason && <p className="text-xs text-muted-foreground">{cleanDisabledReason}</p>}
      </div>
    </section>
  );
}
