"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api } from "../../lib/client";
import { errorMessage } from "../../lib/library-helpers";
import type { AiAction, AiCatalogue, AiModelOption } from "../../lib/types";

/**
 * État commun aux commandes d'IA de l'atelier : un seul appel à la fois, et ce
 * que la personne a déjà été prévenue de voir partir. Tenu hors de React pour
 * être le même dans tout l'inspecteur, quelle que soit la zone sélectionnée.
 */

let running: AiAction | null = null;
const listeners = new Set<() => void>();

function setRunning(next: AiAction | null) {
  running = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** L'action en cours, s'il y en a une : tant qu'elle attend sa réponse, tous les boutons d'IA sont inactifs. */
export function useAiRunning(): AiAction | null {
  return useSyncExternalStore(
    subscribe,
    () => running,
    () => null,
  );
}

/**
 * Lance un appel, un seul : rien n'est retenté, et un échec est rendu avec sa
 * raison. Rend `null` si un autre appel est déjà en cours.
 */
export async function runAiCall<T>(action: AiAction, call: () => Promise<T>): Promise<{ value: T } | { error: string } | null> {
  if (running) return null;
  setRunning(action);
  try {
    return { value: await call() };
  } catch (error) {
    return { error: errorMessage(error, "L’appel à l’IA a échoué.") };
  } finally {
    setRunning(null);
  }
}

/** Envois dont la personne a déjà été prévenue pendant cette visite : « action:fournisseur ». */
const acknowledged = new Set<string>();

export const wasAcknowledged = (action: AiAction, provider: string) => acknowledged.has(`${action}:${provider}`);
export const acknowledge = (action: AiAction, provider: string) => void acknowledged.add(`${action}:${provider}`);

/**
 * Ce qui quitte la machine, en une phrase, pour chaque action : le début, puis
 * la fin, entre lesquels l'interface pose le logo et le nom du fournisseur.
 */
export function sentSentence(action: AiAction, scope: "zone" | "page"): [string, string] {
  if (action === "reading") return ["L’image de cette zone, et elle seule, part chez ", "."];
  if (action === "page") return ["La page entière part chez ", ", qui en rend une copie traduite."];
  return scope === "zone"
    ? ["Le texte de cette zone, les lignes voisines et les termes du glossaire qu’elles citent partent chez ", ". Aucune image."]
    : ["Le texte des zones de cette page et les termes du glossaire qu’il cite partent chez ", ". Aucune image."];
}

/** Catalogues déjà lus, par chapitre : ils restent à l'écran pendant qu'on les relit. */
const catalogues = new Map<string, AiCatalogue>();

/**
 * Modèles proposés pour un chapitre. Lu seulement quand `enabled` passe à
 * vrai : tant que la section d'IA n'est pas ouverte, rien n'est demandé au
 * serveur.
 */
export function useAiCatalogue(chapterId: string, enabled: boolean) {
  const [catalogue, setCatalogue] = useState<AiCatalogue | null>(() => catalogues.get(chapterId) ?? null);
  const [failed, setFailed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getAiCatalogue(chapterId);
      catalogues.set(chapterId, next);
      setCatalogue(next);
      setFailed(null);
    } catch (error) {
      setFailed(errorMessage(error, "La palette d’IA n’a pas pu être lue."));
    }
  }, [chapterId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { catalogue, failed, refresh };
}

/** Premier modèle à proposer : celui que le chapitre a retenu, s'il est encore dans la palette. Aucun n'est choisi d'office. */
export function initialModel(catalogue: AiCatalogue | null, action: AiAction): string {
  return catalogue?.defaults[action] ?? "";
}

export function findModel(catalogue: AiCatalogue | null, action: AiAction, key: string): AiModelOption | undefined {
  return catalogue?.models[action].find((model) => model.key === key);
}

/** Retient un modèle comme défaut du chapitre pour une action. Les réglages sont relus juste avant, pour ne rien écraser. */
export async function keepChapterModel(chapterId: string, action: AiAction, key: string): Promise<boolean> {
  try {
    const { chapter } = await api.getChapter(chapterId);
    await api.updateChapter(chapterId, { settings: { ...chapter.settings, aiModels: { ...chapter.settings.aiModels, [action]: key } } });
    const known = catalogues.get(chapterId);
    if (known) catalogues.set(chapterId, { ...known, defaults: { ...known.defaults, [action]: key } });
    toast.success("Modèle retenu pour ce chapitre");
    return true;
  } catch (error) {
    toast.error(errorMessage(error, "Le modèle n’a pas pu être retenu pour ce chapitre."));
    return false;
  }
}
