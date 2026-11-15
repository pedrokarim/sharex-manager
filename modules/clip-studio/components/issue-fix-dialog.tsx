"use client";

/**
 * « Régler ce blocage » (dossier 01 quater, § 6.2), depuis la ligne d'une
 * publication bloquée : ce qui est en cause, puis chaque solution avec son
 * coût. Contester (texte prêt, à déposer dans Studio), remplacer la musique
 * (copie du projet, puis écran Exporter), retirer le passage ou remplacer le
 * visuel (copie du projet ouverte dans l'éditeur), ou régler avec
 * l'assistant. L'original ne bouge jamais ; rien n'est rendu ni publié sans
 * clic. Les retours s'affichent à côté de l'action.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FileWarning, Music, Scissors, ShieldCheck, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { ActionStatus, errorMessage, useFeedback, type FeedbackState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { callModule } from "../lib/client";
import type { IssueBrief, IssueFixResult, IssueSolution } from "../lib/issue-fixes";
import type { IssueFixSolution } from "../lib/publication-issues";
import { formatClock, formatRelative } from "./library-ui";

const NBSP = " ";

/** « La musique « Epic Hip-Hop » est revendiquée de 0:01 à 1:04 par… », lu dans le dossier. */
function culpritSentence(brief: IssueBrief): string {
  const culprit = brief.culprit;
  const claim = brief.issue.claim;
  const what = culprit?.music ? `La musique «${NBSP}${culprit.music.title}${NBSP}» (${culprit.music.artist})` : culprit ? `«${NBSP}${culprit.name}${NBSP}»` : claim?.title ? `«${NBSP}${claim.title}${NBSP}»` : "Le contenu revendiqué";
  const range = brief.range ? ` de ${formatClock(brief.range.startMs / 1000)} à ${formatClock(brief.range.endMs / 1000)}` : "";
  const by = claim?.claimant ? `, par ${claim.claimant}${claim.onBehalfOf ? ` pour ${claim.onBehalfOf}` : ""}` : "";
  const covers = brief.range ? (brief.coverage.wholeVideo ? `${NBSP}: toute la vidéo` : `${NBSP}: ${formatClock(brief.coverage.claimedMs / 1000)} sur ${formatClock(brief.coverage.videoMs / 1000)}`) : "";
  return `${what}${range}${by}${covers}.`;
}

export function IssueFixDialog({ issueId, onClose, onChanged }: { issueId: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [brief, setBrief] = useState<IssueBrief | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const disputeFeedback = useFeedback();
  const fixFeedback = useFeedback();
  const [fixTarget, setFixTarget] = useState<string | null>(null);
  const copy = useCopyToClipboard();

  const load = useCallback(async (id: string) => {
    try {
      setBrief(await callModule<IssueBrief>("getIssueBrief", id));
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, "Le dossier du blocage n’a pas pu être lu."));
    }
  }, []);

  useEffect(() => {
    setBrief(null);
    setLoadError(null);
    disputeFeedback.clear();
    fixFeedback.clear();
    if (issueId) void load(issueId);
    // Une ouverture repart du dossier relu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId, load]);

  const solution = (id: IssueSolution["id"]) => brief?.solutions.find((entry) => entry.id === id);

  const markDisputed = async () => {
    if (!brief) return;
    setBusy("dispute");
    disputeFeedback.clear();
    try {
      await callModule("resolveExportIssue", brief.issue.id, { state: "disputed", note: `Contestation déposée dans ${brief.service.label} Studio, motif licence.` });
      disputeFeedback.success("Marquée comme contestée.");
      onChanged();
      void load(brief.issue.id);
    } catch (error) {
      disputeFeedback.error(errorMessage(error, "Le changement n’a pas été enregistré. Réessayez."));
    } finally {
      setBusy(null);
    }
  };

  /** Crée la copie qui porte la solution, puis ouvre l'écran qu'elle demande. */
  const startFix = async (kind: IssueFixSolution, target: string, trackId?: string) => {
    if (!brief) return;
    setBusy(target);
    setFixTarget(target);
    fixFeedback.clear();
    try {
      const result = await callModule<IssueFixResult>("createIssueFix", { issueId: brief.issue.id, solution: kind, ...(trackId ? { trackId } : {}) });
      onChanged();
      router.push(result.href);
    } catch (error) {
      fixFeedback.error(errorMessage(error, "La copie du projet n’a pas pu être créée. Réessayez."));
      setBusy(null);
    }
  };

  const dispute = solution("dispute");
  const replace = solution("replace-music");
  const trim = solution("trim");
  const visual = solution("replace-visual");
  const disputed = brief?.issue.resolution?.state === "disputed";

  return (
    <Dialog open={issueId !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <FileWarning className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">Régler ce blocage</span>
          </DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {brief ? `${brief.stateText} sur ${brief.service.label}. ${culpritSentence(brief)}` : "Lecture du dossier du blocage…"}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 w-full min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-1">
          {!brief ? (
            loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : (
              <div className="flex min-h-40 items-center justify-center" aria-busy>
                <Spinner className="size-5 text-muted-foreground" aria-label="Lecture du dossier" />
              </div>
            )
          ) : (
            <>
              <p className="text-xs text-pretty text-muted-foreground">
                Chaque solution travaille sur une copie du projet&nbsp;: l’original et la vidéo publiée ne bougent pas. Rien n’est rendu, publié, supprimé ni passé en privé sans votre clic.
              </p>

              {brief.history.length > 0 ? (
                <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">
                  Déjà relevé&nbsp;: {brief.history.map((entry) => `${entry.stateText}${entry.title ? ` («${NBSP}${entry.title}${NBSP}»)` : ""}, ${entry.link === "track" ? "même morceau" : entry.link === "artist" ? "même artiste" : "même demandeur"}`).join(" ; ")}.
                </p>
              ) : null}

              {/* Contester */}
              <section className="grid min-w-0 gap-2" aria-labelledby="fix-dispute">
                <h3 id="fix-dispute" className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4 shrink-0" aria-hidden />
                  Contester
                </h3>
                {dispute?.available && brief.dispute.text ? (
                  <>
                    <p className="text-xs text-pretty text-muted-foreground">
                      {dispute.cost} Le dépôt se fait dans {brief.service.label} Studio&nbsp;: page «&nbsp;Revendications&nbsp;», «&nbsp;Contester&nbsp;», motif «&nbsp;licence&nbsp;», puis ce texte.
                    </p>
                    {!brief.dispute.descriptionCredit ? (
                      <p className="text-xs text-pretty text-amber-700 dark:text-amber-400">La description publiée ne cite pas le morceau&nbsp;: la contestation repose sur la licence seule.</p>
                    ) : null}
                    <Textarea value={brief.dispute.text} readOnly rows={8} className="max-h-64 min-w-0 font-normal [overflow-wrap:anywhere]" aria-label="Texte de contestation" />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copy.copyToClipboard(brief.dispute.text!)}>
                        {copy.hasCopied ? <Check className="size-3.5" /> : copy.copyFailed ? <X className="size-3.5" /> : <Copy className="size-3.5" />}
                        Copier
                      </Button>
                      {!disputed ? (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={busy === "dispute"} disabled={busy !== null && busy !== "dispute"} onClick={() => void markDisputed()}>
                          <Undo2 className="size-3.5" />
                          Marquer comme contestée
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Contestée {formatRelative(Date.parse(brief.issue.resolution!.at))}.</span>
                      )}
                      <ActionStatus state={disputeFeedback.state} className="min-w-0 max-w-full" />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-pretty text-muted-foreground">{dispute?.unavailableReason ?? "Pas de contestation possible ici."}</p>
                )}
              </section>

              <Separator />

              {/* Remplacer la musique */}
              <section className="grid min-w-0 gap-2" aria-labelledby="fix-music">
                <h3 id="fix-music" className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Music className="size-4 shrink-0" aria-hidden />
                  Remplacer la musique
                </h3>
                {replace?.available ? (
                  <>
                    <p className="text-xs text-pretty text-muted-foreground">
                      {replace.detail} {replace.cost}
                    </p>
                    <ul className="grid min-w-0 gap-3">
                      {brief.replacements.map((track) => {
                        const target = `music:${track.trackId}`;
                        return (
                          <li key={track.trackId} className="grid min-w-0 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
                            <div className="grid min-w-0 gap-1">
                              <span className="min-w-0 truncate text-sm font-medium" title={`${track.title} – ${track.artist}`}>
                                {track.title}
                                <span className="font-normal text-muted-foreground"> · {track.artist}</span>
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {track.license} · {formatClock(track.durationMs / 1000)}
                                {track.sameMood ? " · même ambiance" : " · autre ambiance"}
                              </span>
                              <audio controls preload="none" src={track.url} className="h-8 w-full min-w-0 max-w-full" aria-label={`Écouter ${track.title}`} />
                              {fixTarget === target ? <ActionStatus state={fixFeedback.state} className="min-w-0 max-w-full" /> : null}
                            </div>
                            <Button type="button" size="sm" className="gap-1.5 justify-self-start" loading={busy === target} disabled={busy !== null && busy !== target} onClick={() => void startFix("replace-music", target, track.trackId)}>
                              <Wand2 className="size-3.5" />
                              Choisir ce morceau
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-pretty text-muted-foreground">{replace?.unavailableReason ?? "Pas de remplacement possible ici."}</p>
                )}
              </section>

              {trim?.available || visual?.available ? <Separator /> : null}

              {trim?.available ? (
                <FixAction
                  id="fix-trim"
                  icon={Scissors}
                  title={trim.title}
                  text={`${trim.detail} ${trim.cost}`}
                  label="Ouvrir la copie dans l’éditeur"
                  busy={busy === "trim"}
                  disabled={busy !== null && busy !== "trim"}
                  status={fixTarget === "trim" ? fixFeedback.state : null}
                  onClick={() => void startFix("trim", "trim")}
                />
              ) : null}
              {visual?.available ? (
                <FixAction
                  id="fix-visual"
                  icon={Wand2}
                  title={visual.title}
                  text={`${visual.detail} ${visual.cost}`}
                  label="Ouvrir la copie dans l’éditeur"
                  busy={busy === "visual"}
                  disabled={busy !== null && busy !== "visual"}
                  status={fixTarget === "visual" ? fixFeedback.state : null}
                  onClick={() => void startFix("replace-visual", "visual")}
                />
              ) : null}

              <Separator />

              <FixAction
                id="fix-assistant"
                icon={Sparkles}
                title="Régler avec l’assistant"
                text="L’éditeur s’ouvre sur une copie du projet, l’assistant ouvert sur ce blocage. Il dit ce qu’il a compris, numérote les solutions et applique celle que vous écrivez. Rien n’est rendu ni publié sans votre clic."
                label="Ouvrir l’assistant"
                busy={busy === "assistant"}
                disabled={busy !== null && busy !== "assistant"}
                status={fixTarget === "assistant" ? fixFeedback.state : null}
                onClick={() => void startFix("assistant", "assistant")}
              />

              {brief.fixes.length > 0 ? (
                <>
                  <Separator />
                  <section className="grid min-w-0 gap-2" aria-labelledby="fix-copies">
                    <h3 id="fix-copies" className="text-sm font-medium">
                      Copies déjà faites
                    </h3>
                    <ul className="grid min-w-0 gap-1.5">
                      {brief.fixes.map((fix) => (
                        <li key={`${fix.projectId}-${fix.createdAt}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="min-w-0 flex-1 truncate" title={fix.projectName}>
                            {fix.projectName}
                          </span>
                          <span className="shrink-0 text-muted-foreground">{fix.exportId ? "exportée" : `créée ${formatRelative(Date.parse(fix.createdAt))}`}</span>
                          <Link href={`/m/clip-studio/export?project=${encodeURIComponent(fix.projectId)}`} className="shrink-0 underline-offset-2 hover:underline">
                            Exporter
                          </Link>
                          <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(fix.projectId)}`} className="shrink-0 underline-offset-2 hover:underline">
                            Éditer
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="min-w-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy !== null}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FixAction({
  id,
  icon: Icon,
  title,
  text,
  label,
  busy,
  disabled,
  status,
  onClick,
}: {
  id: string;
  icon: typeof Sparkles;
  title: string;
  text: string;
  label: string;
  busy: boolean;
  disabled: boolean;
  status: FeedbackState | null;
  onClick: () => void;
}) {
  return (
    <section className="grid min-w-0 gap-2" aria-labelledby={id}>
      <h3 id={id} className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
      </h3>
      <p className="text-xs text-pretty text-muted-foreground">{text}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={busy} disabled={disabled} onClick={onClick}>
          {label}
        </Button>
        <ActionStatus state={status} className="min-w-0 max-w-full" />
      </div>
    </section>
  );
}
