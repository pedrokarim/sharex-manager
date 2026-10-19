/**
 * Page « Nouveau clip » : le mode de création porté par l'adresse
 * (`?mode=`), et le renvoi des anciennes adresses (`?action=create` de
 * l'accueil et de la galerie) vers la page.
 *
 * Pur : aucun disque, aucun réseau.
 */

import { CREATE_PATH, createHref, type CreatePrefill } from "./idea-prefill";

export type CreateMode = "assistant" | "idea" | "overlay" | "template" | "blank" | "subtitle" | "clipping" | "gallery";

export const CREATE_MODES: readonly CreateMode[] = ["assistant", "idea", "overlay", "template", "blank", "subtitle", "clipping", "gallery"];

/** Modes de l'assistant : brief, durée, séquences, voix, musique et illustrations. */
export const ASSISTANT_MODES: readonly CreateMode[] = ["assistant", "overlay"];

/** Fichiers de la galerie (`files=a.png,b.jpg`), dans l'ordre de la sélection. */
export function readFiles(params: Pick<URLSearchParams, "get">): string[] {
  return String(params.get("files") ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean)
    .slice(0, 60);
}

/**
 * Mode lu dans l'adresse. Sans mode valable : la sélection de la galerie quand
 * il y en a une, sinon l'assistant. « gallery » sans fichiers n'a rien à monter.
 */
export function readMode(params: Pick<URLSearchParams, "get">): CreateMode {
  const files = readFiles(params);
  const raw = params.get("mode");
  const mode = CREATE_MODES.includes(raw as CreateMode) ? (raw as CreateMode) : null;
  if (mode === "gallery" && files.length === 0) return "assistant";
  return mode ?? (files.length ? "gallery" : "assistant");
}

/** Adresse de la page pour un autre mode : les autres paramètres (fichiers, idée) restent. */
export function modeHref(params: URLSearchParams | string, mode: CreateMode): string {
  const next = new URLSearchParams(params.toString());
  next.set("mode", mode);
  next.delete("job");
  return `${CREATE_PATH}?${next.toString()}`;
}

/**
 * Ancienne adresse de création (`?action=create` sur l'accueil ou la page des
 * projets) : l'adresse de la page « Nouveau clip » qui la remplace, avec les
 * mêmes paramètres ; `null` si ce n'en est pas une.
 */
export function legacyCreateHref(params: URLSearchParams | string): string | null {
  const source = new URLSearchParams(params.toString());
  if (source.get("action") !== "create") return null;
  source.delete("action");
  const query = source.toString();
  return query ? `${CREATE_PATH}?${query}` : CREATE_PATH;
}

/**
 * Adresse de la page pour une demande de création venue d'un ancien appel de
 * la fenêtre « Nouveau clip » : sélection de la galerie, idée préremplie, ou
 * « Sous-titrer » / « Découper ».
 */
export function createRequestHref(request: { files?: string[]; prefill?: CreatePrefill; mode?: "subtitle" | "clipping" }): string {
  if (request.prefill) return createHref(request.prefill);
  const params = new URLSearchParams();
  if (request.files?.length) {
    params.set("mode", "gallery");
    params.set("files", request.files.join(","));
  } else if (request.mode) {
    params.set("mode", request.mode);
  }
  const query = params.toString();
  return query ? `${CREATE_PATH}?${query}` : CREATE_PATH;
}
