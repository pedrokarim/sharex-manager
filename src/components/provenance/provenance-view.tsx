"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, FileText, ScanSearch, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeSourceType,
  provenanceLabel,
  type CleanResult,
  type ManifestSignature,
  type ProvenanceReport,
  type ProvenanceSummary,
} from "@/lib/provenance/types";

// ─── Indicateurs d'une grille : un appel pour toute une page ─────

/**
 * Magasin d'indicateurs d'origine. Chaque vignette demande le sien ; les
 * demandes d'un même rendu partent ensemble, en une seule requête à `fetchBatch`.
 */
export function createSummaryStore(fetchBatch: (files: string[]) => Promise<Record<string, ProvenanceSummary>>) {
  const summaries = new Map<string, ProvenanceSummary>();
  const waiting = new Set<string>();
  const listeners = new Set<() => void>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let version = 0;

  const request = (file: string) => {
    if (summaries.has(file) || waiting.has(file)) return;
    waiting.add(file);
    flushTimer ??= setTimeout(async () => {
      flushTimer = null;
      const files = Array.from(waiting);
      try {
        const result = await fetchBatch(files);
        for (const [name, summary] of Object.entries(result ?? {})) summaries.set(name, summary);
      } catch {
        // Pas d'indicateur plutôt qu'un indicateur faux.
      }
      for (const name of files) waiting.delete(name);
      version++;
      for (const listener of listeners) listener();
    }, 40);
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return function useSummary(file: string): ProvenanceSummary | undefined {
    useSyncExternalStore(subscribe, () => version, () => 0);
    useEffect(() => request(file), [file]);
    return summaries.get(file);
  };
}

export function ProvenanceStatusIcon({ status, className }: { status: ProvenanceSummary["status"]; className?: string }) {
  if (status === "signed") return <BadgeCheck className={className} />;
  if (status === "metadata") return <FileText className={className} />;
  return <ScanSearch className={className} />;
}

/**
 * Indicateur d'origine d'une vignette. Une image signée ou porteuse de
 * métadonnées l'affiche en clair ; une image où rien n'a été trouvé ne porte
 * qu'une icône discrète, dont le libellé dit bien « trouvée ».
 */
export function ProvenanceBadgeView({
  summary,
  className,
  signedOnly,
}: {
  summary: ProvenanceSummary | undefined;
  className?: string;
  /** N'afficher que les images signées : pour une galerie où presque rien ne l'est. */
  signedOnly?: boolean;
}) {
  if (!summary || (signedOnly && summary.status !== "signed")) return null;
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
      <ProvenanceStatusIcon status={summary.status} className="h-3 w-3 shrink-0" />
      {!quiet && <span className="truncate">{label}</span>}
    </span>
  );
}

// ─── Détail d'un rapport ─────────────────────────────────────────

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

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

/** Titre d'un rapport : ce que le fichier déclare, en une ligne. */
export function provenanceHeadline(report: ProvenanceReport): string {
  if (report.status === "none") return "Aucune signature trouvée dans le fichier";
  return provenanceLabel({ status: report.status, generator: report.manifest?.generator?.name });
}

/** Tout ce qui a été lu dans le fichier, sans interprétation. */
export function ProvenanceDetails({ report, clean }: { report: ProvenanceReport; clean?: CleanResult | null }) {
  const manifest = report.manifest;
  return (
    <div className="space-y-4">
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
              <span className="mt-0.5 block text-muted-foreground">{describeSourceType(manifest.digitalSourceType)}</span>
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
                {manifest.assertions.map((assertion, index) => (
                  <li key={`${assertion.label}-${index}`}>
                    {assertion.label} <span className="text-muted-foreground">{formatSize(assertion.bytes)}</span>
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
          Le manifeste déclare un filigrane (<span className="font-mono">c2pa.watermarked</span>). Il est inscrit dans
          les pixels : il n’est ni lisible ni retirable depuis le fichier.
        </p>
      )}

      {report.texts?.map((entry, index) => (
        <div key={index} className="space-y-1.5">
          <p className="font-mono text-xs font-medium">{entry.keyword}</p>
          {entry.parameters ? (
            <dl className="space-y-1.5">
              {entry.parameters.prompt && <Field label="Prompt">{entry.parameters.prompt}</Field>}
              {entry.parameters.negativePrompt && <Field label="Négatif">{entry.parameters.negativePrompt}</Field>}
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
                <span className="shrink-0 text-muted-foreground">{formatSize(carrier.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : report.status === "unsupported" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Ce format n’est pas analysé : seuls les PNG, JPEG et WebP le sont.
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          Ni manifeste, ni EXIF, ni XMP, ni texte dans le conteneur.
        </p>
      )}

      {clean && (
        <p className="text-xs leading-5">
          Version propre : {formatSize(clean.bytes)}, soit {formatSize(clean.savedBytes)} de moins. Pixels identiques à
          l’original, vérifié par hachage.
        </p>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        Seul le fichier est lu. Un filigrane inscrit dans les pixels (SynthID et équivalents) n’est pas détecté, et une
        image sans signature n’est pas pour autant une vraie photo.
      </p>
    </div>
  );
}

/** Rapport repliable : l'essentiel en une ligne, le détail au clic. */
export function ProvenanceDisclosure({
  report,
  clean,
  defaultExpanded = false,
}: {
  report: ProvenanceReport;
  clean?: CleanResult | null;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
      >
        <ProvenanceStatusIcon status={report.status} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{provenanceHeadline(report)}</span>
          {report.manifest?.digitalSourceType && (
            <span className="block truncate text-xs text-muted-foreground">{report.manifest.digitalSourceType}</span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="rounded-lg bg-muted/40 p-3">
          <ProvenanceDetails report={report} clean={clean} />
        </div>
      )}
    </>
  );
}
