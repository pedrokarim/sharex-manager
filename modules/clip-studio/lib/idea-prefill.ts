/**
 * « Créer depuis cette idée » : l'écran Idées (et le mode « Depuis une idée »
 * de la page de création) ouvre la page « Nouveau clip » avec des paramètres
 * d'adresse, qu'elle lit pour se préremplir en mode Assistant (avec une
 * suggestion de vidéo à fournir quand l'idée en demande une, jamais
 * bloquante). Les valeurs reçues sont
 * relues et bornées : une adresse se modifie à la main.
 *
 * Pur : aucun disque, aucun réseau.
 */

import type { AspectPreset } from "../engine/types";
import { cleanTargetSeconds } from "./voice-settings";
import { IDEA_ASPECTS, IDEA_LIMITS, IDEA_TEMPLATES, NO_KIT, type Idea, type IdeaTemplate } from "./idea-types";

/** Adresse de la page de création. */
export const CREATE_PATH = "/m/clip-studio/new";

export interface CreatePrefill {
  brief: string;
  template: IdeaTemplate;
  /** Nombre de segments ; absent : « Auto », le script découpe lui-même. */
  count?: number;
  targetSeconds: number;
  aspect: AspectPreset;
  /** Marque ; `null` : aucune ; absente : la marque par défaut. */
  brandKitId?: string | null;
  ideaId?: string;
  /** L'idée gagnerait une vidéo de l'utilisateur : laquelle (suggestion du champ « Vidéos à utiliser », jamais exigée). */
  sourceVideoHint?: string;
}

const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
const IDEA_ID = /^idea-[a-z0-9]{6,40}$/;

/** Début de la demande : l'accroche à dire en premier. */
export function hookLead(hook: string): string {
  const text = hook.trim();
  return text ? `Accroche : « ${text} ». ` : "";
}

/**
 * Demande donnée à l'assistant : l'accroche choisie, puis le prompt initial,
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

/** Les options de l'idée, telles que la page de création les attend. */
export function prefillFromIdea(idea: Idea): CreatePrefill {
  return {
    brief: ideaBrief(idea),
    template: idea.template,
    ...(idea.count !== undefined ? { count: idea.count } : {}),
    targetSeconds: idea.targetSeconds,
    aspect: idea.aspect,
    brandKitId: idea.kitId ?? null,
    ideaId: idea.id,
    ...(idea.sourceVideoHint ? { sourceVideoHint: idea.sourceVideoHint } : {}),
  };
}

/**
 * Mode de la page de création qui reçoit une idée : toujours l'assistant,
 * qui monte aussi par-dessus des vidéos (la suggestion vient avec `hint`).
 */
export function prefillMode(_prefill: Pick<CreatePrefill, "sourceVideoHint">): "assistant" {
  return "assistant";
}


/** Adresse de la page de création, préremplie. */
export function createHref(prefill: CreatePrefill): string {
  const params = new URLSearchParams({
    mode: prefillMode(prefill),
    brief: prefill.brief.slice(0, IDEA_LIMITS.brief),
    template: prefill.template,
    count: prefill.count === undefined ? "auto" : String(prefill.count),
    seconds: String(prefill.targetSeconds),
    aspect: prefill.aspect,
  });
  if (prefill.brandKitId !== undefined) params.set("kit", prefill.brandKitId ?? NO_KIT);
  if (prefill.ideaId) params.set("idea", prefill.ideaId);
  if (prefill.sourceVideoHint) params.set("hint", prefill.sourceVideoHint.slice(0, IDEA_LIMITS.sourceVideoHint));
  return `${CREATE_PATH}?${params.toString()}`;
}

/** Nombre de segments lu dans l'adresse : 2 à 10, ou `undefined` (« auto », absent, illisible). */
export function readCount(value: string | null): number | undefined {
  if (value === null || value === "" || value === "auto") return undefined;
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(10, Math.max(2, parsed)) : undefined;
}

/**
 * Préremplissage lu dans l'adresse ; `null` sans demande (`brief`) ni idée.
 * L'ancienne adresse (`?action=create&mode=assistant` sur l'accueil) se lit
 * de la même façon.
 */
export function readCreatePrefill(params: Pick<URLSearchParams, "get">): CreatePrefill | null {
  const mode = params.get("mode");
  if (mode !== null && mode !== "assistant" && mode !== "overlay") return null;
  if (params.get("brief") === null && params.get("idea") === null) return null;
  // Blancs ordinaires seulement : les espaces insécables de la typographie restent.
  const brief = String(params.get("brief") ?? "").replace(/[^\S  ]+/g, " ").trim().slice(0, IDEA_LIMITS.brief);
  const template = IDEA_TEMPLATES.includes(params.get("template") as IdeaTemplate) ? (params.get("template") as IdeaTemplate) : "free";
  const count = readCount(params.get("count"));
  const aspect = IDEA_ASPECTS.includes(params.get("aspect") as AspectPreset) ? (params.get("aspect") as AspectPreset) : "9:16";
  // Bornée au format, comme le fait l'assistant (60 s au plus pour un short 9:16).
  const seconds = cleanTargetSeconds(params.get("seconds") ?? undefined, template, aspect);
  const kit = params.get("kit");
  const idea = params.get("idea");
  const hint = String(params.get("hint") ?? "").replace(/[^\S  ]+/g, " ").trim().slice(0, IDEA_LIMITS.sourceVideoHint);
  return {
    brief,
    template,
    ...(count !== undefined ? { count } : {}),
    targetSeconds: seconds,
    aspect,
    ...(kit === NO_KIT ? { brandKitId: null } : kit && KIT_ID.test(kit) ? { brandKitId: kit } : {}),
    ...(idea && IDEA_ID.test(idea) ? { ideaId: idea } : {}),
    ...(hint ? { sourceVideoHint: hint } : {}),
  };
}
