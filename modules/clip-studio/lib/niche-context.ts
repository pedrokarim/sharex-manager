/**
 * Ce que le script apprend de la niche et de l'historique (dossier 01
 * illustrations, étape S3), mis en forme pour sa consigne : les concepts
 * qui marchent (banque de la marque, mesurée à l'étude) et les scripts des
 * quatre dernières semaines. Pur : la lecture des fichiers est faite par
 * l'appelant.
 */

import { conceptStatus } from "./idea-scoring";
import type { ConceptBank } from "./idea-types";
import type { RecentScripts } from "./script-history";
import type { NicheConceptBrief, ScriptNiche } from "./script-rules";

/** Concepts passés au script : assez pour choisir, assez peu pour rester lisible. */
export const SCRIPT_CONCEPTS = 8;
/** Exemples par concept. */
export const CONCEPT_EXAMPLES = 3;

/**
 * Concepts de la banque, les recettes d'abord puis les plus forts, chacun
 * avec ses meilleurs exemples mesurés et leurs premières paroles quand
 * l'étude les a lues. Les multiples viennent de la mesure.
 */
export function provenConcepts(bank: Pick<ConceptBank, "concepts" | "study">, max = SCRIPT_CONCEPTS): NicheConceptBrief[] {
  const spoken = new Map((bank.study?.outliers ?? []).filter((outlier) => outlier.spoken).map((outlier) => [outlier.videoId, outlier.spoken as string]));
  const best = (concept: ConceptBank["concepts"][number]) => Math.max(0, ...concept.proofs.map((proof) => proof.score));
  return bank.concepts
    .filter((concept) => concept.proofs.length > 0)
    .map((concept) => ({ concept, status: conceptStatus(concept) }))
    .sort((a, b) => Number(b.status === "recipe") - Number(a.status === "recipe") || best(b.concept) - best(a.concept))
    .slice(0, max)
    .map(({ concept, status }) => ({
      name: concept.name,
      status,
      rhythm: concept.rhythm,
      ...(concept.mold.hook ? { form: concept.mold.hook } : {}),
      examples: [...concept.proofs]
        .sort((a, b) => b.score - a.score)
        .slice(0, CONCEPT_EXAMPLES)
        .map((proof) => ({
          account: proof.channel,
          title: proof.title,
          ...(spoken.get(proof.videoId) ? { spoken: spoken.get(proof.videoId) } : {}),
          multiple: proof.score,
        })),
    }));
}

/** Contexte du script ; `null` sans concept ni historique (la consigne reste alors celle d'avant). */
export function scriptNiche(bank: Pick<ConceptBank, "concepts" | "study"> | null, recent: RecentScripts | null): ScriptNiche | null {
  const concepts = bank ? provenConcepts(bank) : [];
  const scripts = recent?.scripts ?? [];
  if (concepts.length === 0 && scripts.length === 0) return null;
  return { concepts, recent: scripts, ...(recent?.lastFamily ? { lastFamily: recent.lastFamily } : {}) };
}
