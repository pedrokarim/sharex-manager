/**
 * Réglage du moteur de transcription (serveur seulement), choisi par un
 * administrateur dans « Voix en ligne » :
 *
 * - `auto` (par défaut) : OpenAI quand une clé est enregistrée, et le moteur
 *   local dès qu'OpenAI échoue (crédit épuisé, clé refusée, réseau, délai) ;
 *   sans clé, le moteur local directement ;
 * - `openai` : OpenAI seulement (payant, à la seconde) ;
 * - `local` : whisper.cpp sur le serveur seulement (gratuit, plus lent).
 *
 * Rangé dans `data/transcription.json`, écrit d'un bloc.
 */

import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDirs } from "./store";
import type { WhisperCppStatus } from "@/lib/media/whisper-cpp";

export const TRANSCRIPTION_ENGINES = ["auto", "openai", "local"] as const;
export type TranscriptionEngine = (typeof TRANSCRIPTION_ENGINES)[number];

const SETTINGS_FILE = path.join(DATA_DIR, "transcription.json");

/** Ce que voit l'écran de réglage : le moteur choisi, la clé OpenAI, l'état du moteur local. */
export interface TranscriptionSettings {
  engine: TranscriptionEngine;
  /** Une clé OpenAI est enregistrée (son crédit n'est pas vérifié ici). */
  openAiKey: boolean;
  local: WhisperCppStatus;
}

export function isTranscriptionEngine(value: unknown): value is TranscriptionEngine {
  return typeof value === "string" && (TRANSCRIPTION_ENGINES as readonly string[]).includes(value);
}

/** Moteur réglé ; `auto` si rien n'est enregistré ou si le fichier est illisible. */
export function transcriptionEngine(): TranscriptionEngine {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    return isTranscriptionEngine(raw?.engine) ? raw.engine : "auto";
  } catch {
    return "auto";
  }
}

export function saveTranscriptionEngine(value: unknown): TranscriptionEngine {
  if (!isTranscriptionEngine(value)) throw new Error("Moteur de transcription inconnu.");
  ensureDirs();
  const temporary = `${SETTINGS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ engine: value, savedAt: Date.now() }, null, 2));
  fs.renameSync(temporary, SETTINGS_FILE);
  return value;
}

/**
 * Moteurs à essayer, dans l'ordre, pour un réglage donné et selon qu'une clé
 * OpenAI est enregistrée. Fonction pure.
 */
export function enginePlan(engine: TranscriptionEngine, hasOpenAiKey: boolean): ("openai" | "local")[] {
  if (engine === "openai") return ["openai"];
  if (engine === "local") return ["local"];
  return hasOpenAiKey ? ["openai", "local"] : ["local"];
}
