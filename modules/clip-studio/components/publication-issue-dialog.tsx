"use client";

/**
 * Blocage d'une publication (dossier 01 quater, § 5.3 et § 5.4) : la ligne
 * d'une publication bloquée et la fenêtre qui en montre le détail, ou qui
 * sert à le signaler à la main en collant le texte de YouTube Studio.
 *
 * « Analyser » remplit les champs (règles d'abord, Codex en repli côté
 * serveur) ; on relit, on corrige, on enregistre. Un blocage existant se
 * marque contesté ou levé depuis la même fenêtre. Les retours s'affichent à
 * côté du bouton ou au-dessus de l'envoi, jamais en toast.
 */

import { useEffect, useState } from "react";
import { CircleAlert, FileWarning, ScanText, ShieldCheck, Undo2 } from "lucide-react";
import { ActionStatus, FormStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { callModule } from "../lib/client";
import type { ParsedStudioClaim } from "../lib/publication-issues";
import { issueStateText, type PublicationIssue, type PublicationIssueClaim, type PublicationIssueKind } from "../lib/rights-types";
import { formatClock, formatRelative } from "./library-ui";

const NBSP = " ";

/** « 0:01 à 1:04 », depuis des millisecondes. */
export function formatIssueRange(claim?: Pick<PublicationIssueClaim, "startMs" | "endMs">): string | null {
  if (claim?.startMs === undefined || claim?.endMs === undefined) return null;
  return `${formatClock(claim.startMs / 1000)} à ${formatClock(claim.endMs / 1000)}`;
}

/** Demandeur et ayant droit : « HAAWK for a 3rd Party au nom de Soundrider ». */
export function formatClaimant(claim?: Pick<PublicationIssueClaim, "claimant" | "onBehalfOf">): string | null {
  if (!claim?.claimant && !claim?.onBehalfOf) return null;
  if (claim.claimant && claim.onBehalfOf) return `${claim.claimant} au nom de ${claim.onBehalfOf}`;
  return claim.claimant ?? `Au nom de ${claim.onBehalfOf}`;
}

/** Ligne de détail d'un blocage : titre revendiqué, plage, demandeur. */
export function issueSummary(issue: PublicationIssue): string {
  const parts = [
    issue.claim?.title ? `«${NBSP}${issue.claim.title}${NBSP}»` : null,
    formatIssueRange(issue.claim),
    formatClaimant(issue.claim),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return issue.source === "api" ? "Relevé par l’API du service, sans le détail de la revendication" : "Saisi à la main";
}

// ─── Effet sur la vidéo ──────────────────────────────────────────

type Effect = "worldwide" | "countries" | "claimed" | "muted" | "removed" | "rejected";

const EFFECTS: { value: Effect; label: string }[] = [
  { value: "worldwide", label: "Bloquée dans le monde entier" },
  { value: "countries", label: "Bloquée dans certains pays" },
  { value: "claimed", label: "Revendiquée, toujours visible" },
  { value: "muted", label: "Son coupé" },
  { value: "removed", label: "Retirée" },
  { value: "rejected", label: "Refusée" },
];

const MEDIA_LABELS: Record<PublicationIssueClaim["media"], string> = { audio: "Audio (musique, son)", video: "Vidéo", image: "Image" };

function effectOf(kind: PublicationIssueKind, scope?: PublicationIssue["scope"]): Effect {
  if (kind === "muted" || kind === "removed" || kind === "rejected") return kind;
  if (scope?.worldwide) return "worldwide";
  if (scope) return "countries";
  return "claimed";
}

function kindAndScope(effect: Effect, countries: string[]): { kind: PublicationIssueKind; scope?: PublicationIssue["scope"] } {
  if (effect === "worldwide") return { kind: "copyright-claim", scope: { worldwide: true } };
  if (effect === "countries") return { kind: "copyright-claim", scope: { worldwide: false, ...(countries.length > 0 ? { countries } : {}) } };
  if (effect === "claimed") return { kind: "copyright-claim" };
  return { kind: effect };
}

/** « 1:04 » ou « 0:01:04 » en millisecondes ; `undefined` si vide, `null` si illisible. */
function readClock(value: string): number | undefined | null {
  const text = value.trim();
  if (!text) return undefined;
  if (!/^\d{1,2}(?::\d{1,2}){0,2}$/.test(text)) return null;
  return text.split(":").reduce((total, part) => total * 60 + Number(part), 0) * 1000;
}

const clockOf = (ms?: number) => (ms === undefined ? "" : formatClock(ms / 1000));

interface FormState {
  text: string;
  title: string;
  claimant: string;
  onBehalfOf: string;
  start: string;
  end: string;
  media: PublicationIssueClaim["media"];
  effect: Effect;
  countries: string;
}

const EMPTY_FORM: FormState = { text: "", title: "", claimant: "", onBehalfOf: "", start: "", end: "", media: "audio", effect: "worldwide", countries: "" };

const FIELD_LABELS: Record<ParsedStudioClaim["missing"][number], string> = {
  title: "le titre",
  claimant: "le demandeur",
  range: "la plage",
  effect: "l’effet",
  media: "le type de média",
};

// ─── Fenêtre ─────────────────────────────────────────────────────

export interface IssueTarget {
  exportId: string;
  jobId: string;
  accountName: string;
  serviceLabel: string;
}

/**
 * Détail des blocages d'une publication (`mode: "view"`) ou saisie d'un
 * nouveau blocage (`mode: "report"`). `issues` : ceux de cette publication,
 * du plus récent au plus ancien.
 */
export function PublicationIssueDialog({
  target,
  issues,
  initialMode,
  onClose,
  onChanged,
}: {
  target: IssueTarget | null;
  issues: PublicationIssue[];
  initialMode: "view" | "report";
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const analyzeFeedback = useFeedback({ successDuration: 6000 });
  const formFeedback = useFeedback();
  const resolveFeedback = useFeedback();
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setMode(initialMode);
    setForm(EMPTY_FORM);
    analyzeFeedback.clear();
    formFeedback.clear();
    resolveFeedback.clear();
    // Une ouverture repart d'un formulaire vide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, initialMode]);

  const patch = (change: Partial<FormState>) => setForm((current) => ({ ...current, ...change }));
  const busy = analyzing || saving;

  const analyze = async () => {
    if (!form.text.trim()) {
      analyzeFeedback.error("Collez d’abord le texte de la revendication.");
      return;
    }
    setAnalyzing(true);
    analyzeFeedback.clear();
    try {
      const parsed = await callModule<ParsedStudioClaim>("parsePublicationClaim", form.text);
      patch({
        title: parsed.claim.title ?? "",
        claimant: parsed.claim.claimant ?? "",
        onBehalfOf: parsed.claim.onBehalfOf ?? "",
        start: clockOf(parsed.claim.startMs),
        end: clockOf(parsed.claim.endMs),
        media: parsed.claim.media,
        effect: effectOf(parsed.kind, parsed.scope),
        countries: parsed.scope?.countries?.join(", ") ?? "",
      });
      const missing = parsed.missing.map((field) => FIELD_LABELS[field]);
      const by = parsed.via === "codex" ? " (complété par Codex)" : "";
      if (missing.length === 0) analyzeFeedback.success(`Champs remplis${by}, à relire.`);
      else analyzeFeedback.error(`Champs remplis${by}, sauf ${missing.join(", ")}${NBSP}: à compléter.`);
    } catch (error) {
      analyzeFeedback.error(errorMessage(error, "Le texte n’a pas pu être analysé. Remplissez les champs à la main."));
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!target) return;
    formFeedback.clear();
    const startMs = readClock(form.start);
    const endMs = readClock(form.end);
    if (startMs === null || endMs === null) return formFeedback.error(`Plage illisible${NBSP}: écrivez par exemple 0:01 et 1:04.`);
    if ((startMs === undefined) !== (endMs === undefined)) return formFeedback.error("Donnez le début et la fin de la plage, ou aucun des deux.");
    if (startMs !== undefined && endMs !== undefined && endMs <= startMs) return formFeedback.error("La fin de la plage doit venir après son début.");
    const countries = form.countries
      .split(/[\s,;]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    if (form.effect === "countries" && countries.some((code) => !/^[A-Z]{2}$/.test(code))) {
      return formFeedback.error(`Pays${NBSP}: des codes à deux lettres, séparés par des virgules (FR, BE, CA).`);
    }
    const { kind, scope } = kindAndScope(form.effect, countries);
    setSaving(true);
    try {
      await callModule<PublicationIssue>("reportPublicationIssue", {
        exportId: target.exportId,
        jobId: target.jobId,
        kind,
        ...(scope ? { scope } : {}),
        claim: {
          ...(form.title.trim() ? { title: form.title.trim() } : {}),
          ...(form.claimant.trim() ? { claimant: form.claimant.trim() } : {}),
          ...(form.onBehalfOf.trim() ? { onBehalfOf: form.onBehalfOf.trim() } : {}),
          ...(startMs !== undefined ? { startMs } : {}),
          ...(endMs !== undefined ? { endMs } : {}),
          media: form.media,
        },
        ...(form.text.trim() ? { text: form.text } : {}),
      });
      onChanged();
      onClose();
    } catch (error) {
      formFeedback.error(errorMessage(error, "Le blocage n’a pas pu être enregistré. Réessayez."));
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (issue: PublicationIssue, state: "disputed" | "released") => {
    setResolving(`${issue.id}:${state}`);
    setResolveTarget(issue.id);
    resolveFeedback.clear();
    try {
      await callModule<PublicationIssue>("resolveExportIssue", issue.id, { state });
      resolveFeedback.success(state === "disputed" ? "Marquée comme contestée." : "Revendication levée.");
      onChanged();
    } catch (error) {
      resolveFeedback.error(errorMessage(error, "Le changement n’a pas été enregistré. Réessayez."));
    } finally {
      setResolving(null);
    }
  };

  const title = mode === "report" ? "Signaler un blocage" : "Blocage de la publication";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <FileWarning className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
          </DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {target ? `${target.accountName} · ${target.serviceLabel}` : null}
            {mode === "report"
              ? ". Collez le détail de la revendication copié dans YouTube Studio (page « Revendications », puis « Afficher les détails »), ou remplissez les champs."
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-1">
          {mode === "view" ? (
            <IssueHistory issues={issues} resolving={resolving} feedback={resolveFeedback.state} feedbackTarget={resolveTarget} onResolve={resolve} />
          ) : (
            <div className="grid w-full min-w-0 gap-4">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="issue-text">Texte de YouTube Studio</Label>
                <Textarea
                  id="issue-text"
                  value={form.text}
                  onChange={(event) => patch({ text: event.target.value })}
                  rows={6}
                  maxLength={20000}
                  placeholder={"Revendication : Memories\nPartie concernée\n0:01 - 1:04\nDemandeurs\n…"}
                  className="max-h-60 min-w-0 [overflow-wrap:anywhere]"
                  disabled={busy}
                />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={analyzing} disabled={saving} onClick={() => void analyze()}>
                    <ScanText className="size-3.5" />
                    Analyser
                  </Button>
                  <ActionStatus state={analyzeFeedback.state} className="min-w-0 max-w-full" />
                </div>
              </div>

              <Separator />

              <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Field id="issue-title" label="Titre revendiqué" value={form.title} onChange={(title) => patch({ title })} placeholder="Memories" disabled={busy} />
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="issue-media">Type de média</Label>
                  <Select value={form.media} onValueChange={(media) => patch({ media: media as FormState["media"] })} disabled={busy}>
                    <SelectTrigger id="issue-media" className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MEDIA_LABELS) as FormState["media"][]).map((media) => (
                        <SelectItem key={media} value={media}>
                          {MEDIA_LABELS[media]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field id="issue-claimant" label="Demandeur" value={form.claimant} onChange={(claimant) => patch({ claimant })} placeholder="HAAWK for a 3rd Party" disabled={busy} />
                <Field id="issue-behalf" label="Au nom de" value={form.onBehalfOf} onChange={(onBehalfOf) => patch({ onBehalfOf })} placeholder="Soundrider" disabled={busy} />
                <Field id="issue-start" label="Début de la plage" value={form.start} onChange={(start) => patch({ start })} placeholder="0:01" disabled={busy} inputMode="numeric" />
                <Field id="issue-end" label="Fin de la plage" value={form.end} onChange={(end) => patch({ end })} placeholder="1:04" disabled={busy} inputMode="numeric" />
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="issue-effect">Effet sur la vidéo</Label>
                  <Select value={form.effect} onValueChange={(effect) => patch({ effect: effect as Effect })} disabled={busy}>
                    <SelectTrigger id="issue-effect" className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EFFECTS.map((effect) => (
                        <SelectItem key={effect.value} value={effect.value}>
                          {effect.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.effect === "countries" ? (
                  <Field id="issue-countries" label="Pays (codes à deux lettres)" value={form.countries} onChange={(countries) => patch({ countries })} placeholder="FR, BE, CA" disabled={busy} />
                ) : null}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="min-w-0 flex-col gap-2 sm:flex-col">
          {mode === "report" ? <FormStatus state={formFeedback.state} /> : null}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {mode === "report" ? (
              <>
                <Button type="button" variant="ghost" onClick={() => (issues.length > 0 ? setMode("view") : onClose())} disabled={busy}>
                  {issues.length > 0 ? "Retour au détail" : "Annuler"}
                </Button>
                <Button type="button" loading={saving} disabled={analyzing} onClick={() => void save()}>
                  Enregistrer le blocage
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setMode("report")}>
                  Signaler un autre blocage
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Fermer
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} inputMode={inputMode} maxLength={200} className="w-full min-w-0" />
    </div>
  );
}

/** Pays où une vidéo bloquée par l'API se lit encore (`regionRestriction.allowed`). */
function allowedCountries(issue: PublicationIssue): string[] | null {
  const raw = issue.raw as { regionRestriction?: { allowed?: unknown } } | undefined;
  const allowed = raw?.regionRestriction?.allowed;
  return Array.isArray(allowed) && allowed.length > 0 ? allowed.filter((code): code is string => typeof code === "string") : null;
}

const RESOLUTION_LABELS: Record<NonNullable<PublicationIssue["resolution"]>["state"], string> = {
  disputed: "Contestée",
  replaced: "Musique remplacée",
  trimmed: "Passage coupé",
  released: "Revendication levée",
  accepted: "Acceptée",
};

/** Blocages de la publication, le plus récent d'abord, avec leurs règlements. */
function IssueHistory({
  issues,
  resolving,
  feedback,
  feedbackTarget,
  onResolve,
}: {
  issues: PublicationIssue[];
  resolving: string | null;
  feedback: FeedbackState | null;
  feedbackTarget: string | null;
  onResolve: (issue: PublicationIssue, state: "disputed" | "released") => void;
}) {
  if (issues.length === 0) return <p className="text-sm text-muted-foreground">Aucun blocage relevé pour cette publication.</p>;
  return (
    <ol className="grid min-w-0 gap-4">
      {issues.map((issue, index) => {
        const lifted = issue.resolution?.state === "released";
        const allowed = allowedCountries(issue);
        return (
          <li key={issue.id} className="grid min-w-0 gap-2">
            {index > 0 ? <Separator className="mb-2" /> : null}
            <span className={lifted ? "flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground" : "flex min-w-0 items-center gap-1.5 text-sm font-medium text-destructive"}>
              {lifted ? <ShieldCheck className="size-4 shrink-0" aria-hidden /> : <CircleAlert className="size-4 shrink-0" aria-hidden />}
              <span className="min-w-0 [overflow-wrap:anywhere]">{issueStateText(issue)}</span>
            </span>
            <dl className="grid min-w-0 grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <Row term="Titre revendiqué" value={issue.claim?.title ? `«${NBSP}${issue.claim.title}${NBSP}»` : null} />
              <Row term="Demandeur" value={formatClaimant(issue.claim)} />
              <Row term="Plage" value={formatIssueRange(issue.claim)} />
              <Row term="Média" value={issue.claim ? MEDIA_LABELS[issue.claim.media] : null} />
              <Row term="Effet" value={issue.kind === "copyright-claim" || issue.kind === "blocked" ? issueStateText({ kind: issue.kind, scope: issue.scope }) : null} />
              <Row term="Pays" value={allowed ? `Lue seulement dans ${allowed.join(", ")}` : issue.scope?.countries?.length ? issue.scope.countries.join(", ") : null} />
              <Row term="Morceau" value={issue.trackId ? "Retrouvé dans le projet, marqué revendiqué dans la banque" : null} />
              <Row term="Relevé" value={`${formatRelative(Date.parse(issue.detectedAt))}, ${issue.source === "api" ? "par l’API du service" : "à la main"}`} />
              <Row term="Règlement" value={issue.resolution ? `${RESOLUTION_LABELS[issue.resolution.state]} ${formatRelative(Date.parse(issue.resolution.at))}${issue.resolution.note ? ` · ${issue.resolution.note}` : ""}` : null} />
            </dl>
            {!lifted ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {issue.resolution?.state !== "disputed" ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={resolving === `${issue.id}:disputed`} disabled={resolving !== null} onClick={() => onResolve(issue, "disputed")}>
                    <Undo2 className="size-3.5" />
                    Marquer comme contestée
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={resolving === `${issue.id}:released`} disabled={resolving !== null} onClick={() => onResolve(issue, "released")}>
                  <ShieldCheck className="size-3.5" />
                  Revendication levée
                </Button>
                <ActionStatus state={feedbackTarget === issue.id ? feedback : null} className="min-w-0 max-w-full" />
              </div>
            ) : feedbackTarget === issue.id ? (
              <ActionStatus state={feedback} className="min-w-0 max-w-full" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ term, value }: { term: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="min-w-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
    </>
  );
}
