"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../lib/client";
import { acceptAiReading, acceptAiTranslation, addAiTrace } from "../../lib/region-edit";
import type { AiReadingProposal, AiTrace, ScanRegion } from "../../lib/types";
import { ModelPicker, SendButton, TraceList, UsageNote } from "./ai-controls";
import { findModel, initialModel, runAiCall, useAiCatalogue } from "./ai-store";

interface RegionAiProps {
  pageId: string;
  chapterId: string;
  region: ScanRegion;
  /** Enregistre la page avant l'appel : le serveur lit la zone telle qu'elle est enregistrée. */
  flush: () => Promise<void>;
  onPatch: (update: (region: ScanRegion) => ScanRegion, key: string) => void;
}

/**
 * IA en dernier recours, pour la zone sélectionnée : la relire, ou la traduire
 * avec le contexte. Rien ne part sans un clic sur cette zone, et ce qui revient
 * est une proposition : elle ne remplace rien tant qu'elle n'est pas acceptée.
 */
export function RegionAi({ pageId, chapterId, region, flush, onPatch }: RegionAiProps) {
  const [open, setOpen] = useState(false);
  const { catalogue, failed, refresh } = useAiCatalogue(chapterId, open);
  const [readingModel, setReadingModel] = useState("");
  const [translationModel, setTranslationModel] = useState("");
  const [reading, setReading] = useState<AiReadingProposal | null>(null);
  const [translation, setTranslation] = useState<{ text: string; trace: AiTrace } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le modèle retenu par le chapitre est proposé ; aucun n'est choisi d'office.
  useEffect(() => {
    if (!catalogue) return;
    setReadingModel((current) => current || initialModel(catalogue, "reading"));
    setTranslationModel((current) => current || initialModel(catalogue, "translation"));
  }, [catalogue]);

  // Une proposition vaut pour la zone qui l'a demandée : changer de zone l'écarte.
  useEffect(() => {
    setReading(null);
    setTranslation(null);
    setError(null);
  }, [region.id]);

  const traces = region.ai ?? [];
  const providerLabel = (provider: string) =>
    [...(catalogue?.models.reading ?? []), ...(catalogue?.models.translation ?? []), ...(catalogue?.models.page ?? [])].find((model) => model.provider === provider)
      ?.providerLabel ?? provider;

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Quand la lecture locale ou la traduction automatique ne suffisent pas. Chaque appel part d’un clic sur cette zone, jamais de lui-même.
        </p>
        <Button variant="outline" size="sm" className="h-7 w-full text-[11px]" onClick={() => setOpen(true)}>
          Voir les modèles disponibles
        </Button>
        <TraceList traces={traces} labels={providerLabel} />
      </div>
    );
  }
  if (!catalogue) {
    return failed ? (
      <div className="space-y-2">
        <p className="text-xs text-destructive">{failed}</p>
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => void refresh()}>
          Réessayer
        </Button>
      </div>
    ) : (
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }
  if (!catalogue.allowed || catalogue.reason) {
    return <p className="text-xs text-muted-foreground">{catalogue.reason ?? "L’IA n’est pas ouverte pour ce chapitre."}</p>;
  }

  const askReading = async () => {
    setError(null);
    const outcome = await runAiCall("reading", async () => {
      await flush();
      return api.askAiReading(pageId, region.id, { model: readingModel });
    });
    if (!outcome) return;
    void refresh();
    if ("error" in outcome) return setError(outcome.error);
    // L'appel a eu lieu : sa trace reste sur la zone, que la lecture soit acceptée ou non.
    onPatch((current) => addAiTrace(current, outcome.value.trace), `${region.id}:ai-trace:${outcome.value.trace.at}`);
    setReading(outcome.value);
  };

  const askTranslation = async () => {
    setError(null);
    const outcome = await runAiCall("translation", async () => {
      await flush();
      return api.askAiTranslation(pageId, [region.id], { model: translationModel });
    });
    if (!outcome) return;
    void refresh();
    if ("error" in outcome) return setError(outcome.error);
    const { results, failed: missing, trace } = outcome.value;
    onPatch((current) => addAiTrace(current, trace), `${region.id}:ai-trace:${trace.at}`);
    const proposed = results.find((entry) => entry.regionId === region.id);
    if (proposed) setTranslation({ text: proposed.text, trace });
    else setError(missing.find((entry) => entry.regionId === region.id)?.error ?? "Le modèle n’a rien rendu pour cette zone.");
  };

  const hasSource = region.reading.clean.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-xs font-medium">Relire cette zone</h4>
        <ModelPicker action="reading" catalogue={catalogue} chapterId={chapterId} value={readingModel} onChange={setReadingModel} />
        <SendButton action="reading" scope="zone" model={findModel(catalogue, "reading", readingModel)} label="Relire la zone" onSend={() => void askReading()} />
        {reading && (
          <Proposal
            title="Lecture proposée"
            text={reading.text}
            empty="Le modèle n’a lu aucun texte dans cette zone."
            onAccept={() => {
              onPatch((current) => acceptAiReading(current, reading.text, reading.trace), `${region.id}:ai-reading:${reading.trace.at}`);
              setReading(null);
            }}
            onDiscard={() => setReading(null)}
          />
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium">Traduire avec le contexte</h4>
        <ModelPicker action="translation" catalogue={catalogue} chapterId={chapterId} value={translationModel} onChange={setTranslationModel} />
        <SendButton
          action="translation"
          scope="zone"
          model={findModel(catalogue, "translation", translationModel)}
          label="Traduire la zone"
          disabled={!hasSource}
          onSend={() => void askTranslation()}
        />
        {!hasSource && <p className="text-xs text-muted-foreground">Cette zone n’a pas encore de texte d’origine à traduire.</p>}
        {translation && (
          <Proposal
            title="Traduction proposée"
            text={translation.text}
            empty="Le modèle n’a rien proposé."
            onAccept={() => {
              onPatch((current) => acceptAiTranslation(current, translation.text, translation.trace, Date.now()), `${region.id}:ai-translation:${translation.trace.at}`);
              setTranslation(null);
            }}
            onDiscard={() => setTranslation(null)}
          />
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <UsageNote catalogue={catalogue} onSaved={() => void refresh()} />
      <TraceList traces={traces} labels={providerLabel} />
    </div>
  );
}

/** Ce qu'un modèle propose : on l'accepte ou on l'écarte, rien ne s'écrit avant. */
export function Proposal({
  title,
  text,
  empty,
  onAccept,
  onDiscard,
}: {
  title: string;
  text: string;
  empty: string;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      {text ? <p className="text-sm break-words whitespace-pre-wrap">{text}</p> : <p className="text-xs text-muted-foreground">{empty}</p>}
      <div className="flex gap-1.5">
        {text && (
          <Button size="sm" className="h-7 flex-1 text-[11px]" onClick={onAccept}>
            Accepter
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 flex-1 text-[11px]" onClick={onDiscard}>
          Écarter
        </Button>
      </div>
    </div>
  );
}
