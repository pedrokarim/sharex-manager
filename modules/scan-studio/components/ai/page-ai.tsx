"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Columns2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatDate } from "../../lib/client";
import { errorMessage } from "../../lib/library-helpers";
import { acceptAiTranslation, addAiTrace } from "../../lib/region-edit";
import type { AiPageVersion, AiTrace, ScanRegion } from "../../lib/types";
import { ModelPicker, ProviderName, SendButton, UsageNote } from "./ai-controls";
import { findModel, initialModel, runAiCall, useAiCatalogue } from "./ai-store";
import { Proposal } from "./region-ai";
import { VersionCompare, type ManualRenderer } from "./version-compare";

interface PageAiProps {
  pageId: string;
  chapterId: string;
  regions: ScanRegion[];
  page: { width: number; height: number };
  /** Image d'origine de la page, pour la vue des écarts. */
  image: HTMLImageElement | null;
  /** Dessine la page composée par l'atelier, pour la comparer à une version rendue par IA. */
  renderManual: ManualRenderer;
  flush: () => Promise<void>;
  onPatchRegion: (regionId: string, update: (region: ScanRegion) => ScanRegion, key: string) => void;
  onSelectRegion: (regionId: string) => void;
}

/**
 * IA en dernier recours, pour la page : traduire ses zones avec le contexte,
 * ou la faire traduire d'un bloc par un moteur d'image. Les traductions
 * reviennent comme des propositions, zone par zone ; la page traduite d'un bloc
 * est gardée à part, comparable au travail de l'atelier, jamais à sa place.
 */
export function PageAi({ pageId, chapterId, regions, page, image, renderManual, flush, onPatchRegion, onSelectRegion }: PageAiProps) {
  const [open, setOpen] = useState(false);
  const { catalogue, failed, refresh } = useAiCatalogue(chapterId, open);
  const [translationModel, setTranslationModel] = useState("");
  const [pageModel, setPageModel] = useState("");
  const [proposals, setProposals] = useState<{ regionId: string; text: string; trace: AiTrace }[]>([]);
  const [missing, setMissing] = useState<{ regionId: string; error: string }[]>([]);
  const [versions, setVersions] = useState<AiPageVersion[] | null>(null);
  const [compared, setCompared] = useState<AiPageVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogue) return;
    setTranslationModel((current) => current || initialModel(catalogue, "translation"));
    setPageModel((current) => current || initialModel(catalogue, "page"));
  }, [catalogue]);

  // Les versions déjà gardées : lues à l'ouverture de la section, sans appeler aucun fournisseur.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .listAiPageVersions(pageId)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pageId]);

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Traduire les zones de la page avec le contexte, ou la page entière en une version à part. Chaque appel part d’un clic, jamais de lui-même.
        </p>
        <Button variant="outline" size="sm" className="h-7 w-full text-[11px]" onClick={() => setOpen(true)}>
          Voir les modèles disponibles
        </Button>
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

  const withSource = regions.filter((region) => region.reading.clean.trim().length > 0);
  const indexOf = (regionId: string) => regions.findIndex((region) => region.id === regionId);

  const askTranslation = async () => {
    setError(null);
    const outcome = await runAiCall("translation", async () => {
      await flush();
      return api.askAiTranslation(pageId, withSource.map((region) => region.id), { model: translationModel });
    });
    if (!outcome) return;
    void refresh();
    if ("error" in outcome) return setError(outcome.error);
    const { results, failed: unanswered, trace } = outcome.value;
    // L'appel a eu lieu pour toutes ces zones : chacune en garde la trace, acceptée ou non.
    for (const region of withSource) onPatchRegion(region.id, (current) => addAiTrace(current, trace), `${region.id}:ai-trace:${trace.at}`);
    setProposals(results.map((entry) => ({ ...entry, trace })));
    setMissing(unanswered);
  };

  const askPage = async () => {
    setError(null);
    const outcome = await runAiCall("page", async () => {
      await flush();
      return api.askAiPage(pageId, { model: pageModel });
    });
    if (!outcome) return;
    void refresh();
    if ("error" in outcome) return setError(outcome.error);
    const version = outcome.value;
    setVersions((current) => [...(current ?? []).filter((entry) => entry.id !== version.id), version]);
    setCompared(version);
  };

  const accept = (proposal: { regionId: string; text: string; trace: AiTrace }) => {
    onPatchRegion(proposal.regionId, (current) => acceptAiTranslation(current, proposal.text, proposal.trace, Date.now()), `${proposal.regionId}:ai-translation:${proposal.trace.at}`);
    setProposals((current) => current.filter((entry) => entry.regionId !== proposal.regionId));
  };

  const removeVersion = async (version: AiPageVersion) => {
    try {
      await api.deleteAiPageVersion(pageId, version.id);
      setVersions((current) => (current ?? []).filter((entry) => entry.id !== version.id));
      if (compared?.id === version.id) setCompared(null);
    } catch (failure) {
      toast.error(errorMessage(failure, "La version n’a pas pu être supprimée."));
    }
  };

  const labelOf = (provider: string) => catalogue.models.page.find((model) => model.provider === provider)?.providerLabel ?? provider;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-xs font-medium">Traduire les zones avec le contexte</h4>
        <ModelPicker action="translation" catalogue={catalogue} chapterId={chapterId} value={translationModel} onChange={setTranslationModel} />
        <SendButton
          action="translation"
          scope="page"
          model={findModel(catalogue, "translation", translationModel)}
          label={`Traduire les ${withSource.length} zones lues`}
          disabled={withSource.length === 0}
          onSend={() => void askTranslation()}
        />
        {withSource.length === 0 && <p className="text-xs text-muted-foreground">Aucune zone de cette page n’a de texte d’origine.</p>}
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {proposals.map((proposal) => (
              <motion.li
                key={proposal.regionId}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="list-none overflow-hidden"
              >
                <button type="button" className="mb-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => onSelectRegion(proposal.regionId)}>
                  Zone {indexOf(proposal.regionId) + 1}
                </button>
                <Proposal
                  title="Traduction proposée"
                  text={proposal.text}
                  empty="Le modèle n’a rien proposé."
                  onAccept={() => accept(proposal)}
                  onDiscard={() => setProposals((current) => current.filter((entry) => entry.regionId !== proposal.regionId))}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {proposals.length > 1 && (
          <Button variant="outline" size="sm" className="h-7 w-full text-[11px]" onClick={() => proposals.forEach(accept)}>
            Accepter les {proposals.length} propositions
          </Button>
        )}
        {missing.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Sans proposition : {missing.map((entry) => `zone ${indexOf(entry.regionId) + 1}`).join(", ")}.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium">Traduire la page entière</h4>
        <ModelPicker action="page" catalogue={catalogue} chapterId={chapterId} value={pageModel} onChange={setPageModel} />
        <SendButton action="page" scope="page" model={findModel(catalogue, "page", pageModel)} label="Traduire la page par IA" onSend={() => void askPage()} />
        <p className="text-xs leading-snug text-muted-foreground">
          Le résultat est une version à part : le texte n’y est plus modifiable, les visages et les trames peuvent bouger, et sa définition peut être
          inférieure à celle de la page. Vos zones et votre export ne sont pas touchés.
        </p>
        {versions === null ? (
          <Skeleton className="h-10 w-full" aria-hidden />
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {versions.map((version) => (
                <motion.li
                  key={version.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex list-none items-center gap-2 rounded-md bg-muted/50 p-1.5"
                >
                  {/* Servie avec la session par la route des données du module. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={version.url} alt="" className="h-12 w-9 shrink-0 rounded-sm object-cover" />
                  <div className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
                    <ProviderName provider={version.trace.provider} label={labelOf(version.trace.provider)} />
                    <br />
                    {formatDate(version.trace.at)} · {version.width} × {version.height} px
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Comparer avec la page de l’atelier" title="Comparer" onClick={() => setCompared(version)}>
                    <Columns2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Supprimer cette version" title="Supprimer" onClick={() => void removeVersion(version)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <UsageNote catalogue={catalogue} onSaved={() => void refresh()} />
      {compared && (
        <VersionCompare
          version={compared}
          providerLabel={labelOf(compared.trace.provider)}
          page={page}
          image={image}
          regions={regions}
          renderManual={renderManual}
          onClose={() => setCompared(null)}
        />
      )}
    </div>
  );
}
