"use client";

import { siDeepl, siLibretranslate } from "simple-icons";
import { cn } from "@/lib/utils";
import type { TranslationEngineId } from "../../lib/types";

/**
 * Logos officiels des moteurs de traduction, tracés de simple-icons (CC0).
 * Les marques restent la propriété de leurs titulaires : elles ne servent ici
 * qu'à désigner le service. Dessinés avec `currentColor`, pour rester lisibles
 * en thème sombre.
 */
const MARKS: Record<Exclude<TranslationEngineId, "mymemory">, { title: string; path: string }> = {
  deepl: { title: siDeepl.title, path: siDeepl.path },
  libretranslate: { title: siLibretranslate.title, path: siLibretranslate.path },
};

/** MyMemory n'est pas dans simple-icons : son icône officielle, prise sur son site, est servie avec les autres logos. */
const MYMEMORY_LOGO = "/logos/mymemory.png";

/** Nom affiché d'un moteur, quand le serveur n'a pas encore répondu. */
export const ENGINE_NAMES: Record<TranslationEngineId, string> = {
  deepl: "DeepL",
  libretranslate: "LibreTranslate",
  mymemory: "MyMemory",
};

/** Logo d'un moteur. Décoratif : le nom est toujours écrit à côté. */
export function EngineLogo({ engine, className }: { engine: TranslationEngineId; className?: string }) {
  if (engine === "mymemory") {
    // eslint-disable-next-line @next/next/no-img-element -- petit logo local, sans optimisation utile
    return <img src={MYMEMORY_LOGO} alt="" aria-hidden className={cn("size-4 shrink-0 rounded-[3px] bg-white p-px", className)} />;
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d={MARKS[engine].path} />
    </svg>
  );
}

/** Le logo et le nom, côte à côte, dans une phrase. */
export function EngineName({ engine, className }: { engine: TranslationEngineId; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle font-medium whitespace-nowrap", className)}>
      <EngineLogo engine={engine} className="size-3.5" />
      {ENGINE_NAMES[engine]}
    </span>
  );
}
