/**
 * « Créer cette vidéo » : l'écran Idées ouvre la page des projets avec des
 * paramètres d'adresse, qu'elle lit pour ouvrir la fenêtre « Créer » en mode
 * Assistant, préremplie. Les valeurs reçues sont relues et bornées : une
 * adresse se modifie à la main.
 *
 * Pur : aucun disque, aucun réseau.
 */

import type { AspectPreset } from "../engine/types";
import { cleanTargetSeconds } from "./voice-settings";
import { IDEA_ASPECTS, IDEA_LIMITS, IDEA_TEMPLATES, NO_KIT, type Idea, type IdeaTemplate } from "./idea-types";

export interface CreatePrefill {
  brief: string;
  template: IdeaTemplate;
  count: number;
  targetSeconds: number;
  aspect: AspectPreset;
  /** Marque ; `null` : aucune ; absente : la marque par défaut. */
  brandKitId?: string | null;
  ideaId?: string;
}

const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
const IDEA_ID = /^idea-[a-z0-9]{6,40}$/;

/** Début de la demande : l'accroche à dire en premier. */
export function hookLead(hook: string): string {
  const text = hook.trim();
  return text ? `Accroche\u00a0: «\u00a0${text}\u00a0». ` : "";
}

/**
 * Demande donnée à l'assistant : l'accroche choisie, puis le prompt initial,
 * le tout dans la limite de 600 caractères de l'assistant.
 */
export function ideaBrief(idea: Pick<Idea, "hook" | "prompt">): string {
  const lead = hookLead(idea.hook);
  const room = IDEA_LIMITS.brief - lead.length;
  let prompt = idea.prompt.trim();
  if (prompt.length > room) {
    // Coupé à la dernière phrase entière qui tient, sinon au dernier mot.
    const cut = prompt.slice(0, room);
    const sentence = cut.lastIndexOf(". ");
    prompt = sentence > room * 0.5 ? cut.slice(0, sentence + 1) : cut.replace(/ \S*$/, "").trim();
  }
  return `${lead}${prompt}`.slice(0, IDEA_LIMITS.brief);
}

export function prefillFromIdea(idea: Idea): CreatePrefill {
  return {
    brief: ideaBrief(idea),
    template: idea.template,
    count: idea.count,
    targetSeconds: idea.targetSeconds,
    aspect: idea.aspect,
    brandKitId: idea.kitId ?? null,
    ideaId: idea.id,
  };
}

/** Adresse de la page des projets qui ouvre « Créer » préremplie. */
export function createHref(prefill: CreatePrefill): string {
  const params = new URLSearchParams({
    action: "create",
    mode: "assistant",
    brief: prefill.brief.slice(0, IDEA_LIMITS.brief),
    template: prefill.template,
    count: String(prefill.count),
    seconds: String(prefill.targetSeconds),
    aspect: prefill.aspect,
  });
  if (prefill.brandKitId !== undefined) params.set("kit", prefill.brandKitId ?? NO_KIT);
  if (prefill.ideaId) params.set("idea", prefill.ideaId);
  return `/m/clip-studio?${params.toString()}`;
}

/** Préremplissage lu dans l'adresse ; `null` si elle ne demande pas l'assistant. */
export function readCreatePrefill(params: Pick<URLSearchParams, "get">): CreatePrefill | null {
  if (params.get("action") !== "create" || params.get("mode") !== "assistant") return null;
  // Blancs ordinaires seulement : les espaces insécables de la typographie restent.
  const brief = String(params.get("brief") ?? "").replace(/[^\S\u00a0\u202f]+/g, " ").trim().slice(0, IDEA_LIMITS.brief);
  const template = IDEA_TEMPLATES.includes(params.get("template") as IdeaTemplate) ? (params.get("template") as IdeaTemplate) : "free";
  const count = Math.min(10, Math.max(2, Math.round(Number(params.get("count")) || 5)));
  const aspect = IDEA_ASPECTS.includes(params.get("aspect") as AspectPreset) ? (params.get("aspect") as AspectPreset) : "9:16";
  // Bornée au format, comme le fait l'assistant (60 s au plus pour un short 9:16).
  const seconds = cleanTargetSeconds(params.get("seconds") ?? undefined, template, aspect);
  const kit = params.get("kit");
  const idea = params.get("idea");
  return {
    brief,
    template,
    count,
    targetSeconds: seconds,
    aspect,
    ...(kit === NO_KIT ? { brandKitId: null } : kit && KIT_ID.test(kit) ? { brandKitId: kit } : {}),
    ...(idea && IDEA_ID.test(idea) ? { ideaId: idea } : {}),
  };
}
