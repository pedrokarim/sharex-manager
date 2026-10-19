/**
 * Types et erreur partagés par les deux moteurs de transcription : Whisper
 * d'OpenAI (`transcribe.ts`) et whisper.cpp sur le serveur
 * (`transcribe-local.ts`). Repris tels quels par `transcribe.ts`.
 */

import type { TimedWord } from "../engine/types";

/** Moteur qui a produit une transcription. */
export type TranscriptionProvider = "openai" | "local";

export interface TranscribeOptions {
  /** Langue parlée (ISO 639-1 : « fr », « en »…) ; absente : reconnue par Whisper. */
  language?: string;
  signal?: AbortSignal;
  /** Avancement : extraction du son, puis morceau `done` sur `total` (ou pourcentage du moteur local). */
  onProgress?: (progress: TranscribeProgress) => void;
  /** Fonctionnalité notée au registre des IA. */
  feature?: string;
  /**
   * Transcription mot pour mot : hésitations, faux départs et reprises
   * gardés (Whisper les lisse sinon). Sert au montage d'une prise de parole,
   * qui doit les voir pour les couper.
   */
  verbatim?: boolean;
  /** Moteur imposé ; absent : le réglage de Clip Studio (`transcription-settings.ts`). */
  engine?: "openai" | "local";
}

export type TranscribeProgress =
  | { stage: "extracting"; engine?: TranscriptionProvider }
  | { stage: "downloading"; engine: "local"; received: number; total: number }
  | { stage: "transcribing"; done: number; total: number; engine?: TranscriptionProvider }
  /** Repli : OpenAI a échoué, le moteur local prend le relais. */
  | { stage: "fallback"; reason: string };

export interface TranscriptionResult {
  words: TimedWord[];
  /** Texte complet, ponctué. */
  text: string;
  /** Langue reconnue, en code ISO 639-1 quand il est connu. */
  language?: string;
  /** Durée du son transcrit, en secondes. */
  durationSec: number;
  /** Moteur qui a transcrit ; absent : OpenAI (résultats d'avant le moteur local). */
  provider?: TranscriptionProvider;
}

/** Erreur lisible à montrer telle quelle (sans secret). */
export class TranscriptionError extends Error {
  /** Famille de l'échec côté OpenAI : un repli sur le moteur local a du sens pour celles-ci. */
  kind?: "quota" | "auth" | "network" | "timeout" | "rate-limit" | "no-key";
  constructor(message: string, kind?: TranscriptionError["kind"]) {
    super(message);
    this.name = "TranscriptionError";
    if (kind) this.kind = kind;
  }
}
