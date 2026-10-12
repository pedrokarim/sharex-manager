/**
 * Crédits d'un projet (dossier 01 ter, § 3.1) : musiques, voix, images
 * trouvées, images générées. Fonction pure, partagée par l'écran Exporter
 * (relevé avant le rendu) et le serveur (crédits figés avec l'export).
 */

import type { ClipProject, MediaSource } from "../engine/types";

/** Média produit par AI Image Gen : à signaler comme image générée. */
export function isGeneratedSource(source: Pick<MediaSource, "ref" | "url">): boolean {
  return /(^|[/:])ai-image-gen\//.test(`${source.ref ?? ""} ${source.url ?? ""}`);
}

export interface ProjectCredit {
  /** Mention telle qu'elle partira dans la description. */
  text: string;
  kind: "music" | "voice" | "image" | "video" | "generated";
  /** Image trouvée sur le web dont les droits restent à vérifier. */
  unverified?: boolean;
}

/** Une voix de synthèse : rangée par l'outil de voix sous `module:clip-studio/assets/` avec une mention « Voix … ». */
const isVoice = (source: MediaSource) => source.kind === "audio" && (Boolean(source.words?.length) || /^(Voix|Voice)\b/i.test(source.credit ?? ""));

/**
 * Crédits du projet, dans l'ordre d'apparition, sans doublon. Les images
 * générées par IA tiennent en une seule ligne.
 */
export function projectCreditList(project: Pick<ClipProject, "tracks"> | null | undefined, language = "fr"): ProjectCredit[] {
  if (!project) return [];
  const items = project.tracks
    .flatMap((track) => track.items)
    .filter((item) => "source" in item)
    .sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const credits: ProjectCredit[] = [];
  let generated = false;
  for (const item of items) {
    if (!("source" in item)) continue;
    const source = item.source;
    if (source.kind === "image" && isGeneratedSource(source)) {
      generated = true;
      continue;
    }
    const text = String(source.credit ?? "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const kind: ProjectCredit["kind"] = isVoice(source) ? "voice" : source.kind === "audio" ? "music" : source.kind;
    credits.push({ text, kind, ...(source.rights === "unverified" ? { unverified: true } : {}) });
  }
  if (generated) credits.push({ text: /^fr\b/i.test(language) ? "Illustrations générées par IA" : "AI-generated illustrations", kind: "generated" });
  return credits;
}

/** Les mentions seules, telles qu'elles sont figées avec l'export. */
export function projectCredits(project: Pick<ClipProject, "tracks"> | null | undefined, language = "fr"): string[] {
  return projectCreditList(project, language).map((credit) => credit.text);
}

/** Noms des images trouvées sur le web dont les droits restent à vérifier. */
export function unverifiedSources(project: Pick<ClipProject, "tracks"> | null | undefined): string[] {
  if (!project) return [];
  const names = project.tracks.flatMap((track) => track.items.flatMap((item) => ("source" in item && item.source.rights === "unverified" ? [item.source.name] : [])));
  return [...new Set(names)];
}

/** Le projet montre-t-il des images générées (contenu synthétique à déclarer) ? */
export function usesGeneratedImages(project: Pick<ClipProject, "tracks"> | null | undefined): boolean {
  return Boolean(project?.tracks.some((track) => track.items.some((item) => "source" in item && item.source.kind === "image" && isGeneratedSource(item.source))));
}

/** Crédits reçus du navigateur : texte sur une ligne, sans doublon, bornés. */
export function sanitizeCredits(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 100) break;
  }
  return out;
}
