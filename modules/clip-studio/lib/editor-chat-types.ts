/**
 * Conversation de l'assistant de l'éditeur, partagée entre le serveur
 * (`editor-chat.ts`, qui la range) et le panneau de l'éditeur.
 */

import type { EditorChange, EditorOpEntry } from "../engine/editor-ops";

/** Ce que l'éditeur a fait d'une réponse : changements appliqués, écartés, puis peut-être annulés. */
export interface EditorChatOutcome {
  applied: EditorChange[];
  skipped: EditorChange[];
  at: number;
  /** Annulés ensuite par le bouton « Annuler ces changements ». */
  reverted?: boolean;
}

export interface EditorChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  /** Demande : où en était l'éditeur quand elle est partie. */
  context?: { seconds: number; selectedId?: string; selectedName?: string; image: boolean };
  /** Réponse : les points compris de la demande, numérotés à partir de 1. */
  understood?: string[];
  /** Réponse : les opérations proposées, dans l'ordre de Codex (refusées à la lecture comprises). */
  ops?: EditorOpEntry[];
  /** Réponse : appliquée (ou non) par l'éditeur. */
  outcome?: EditorChatOutcome;
  /** Réponse : un échec ou une annulation, pas une réponse de Codex. */
  error?: "failed" | "canceled" | "interrupted";
  /** Réponse : durée de l'appel à Codex. */
  durationMs?: number;
}

/** Demande en cours de traitement. */
export interface EditorChatPending {
  jobId: string;
  /** Message de l'utilisateur auquel la réponse répondra. */
  messageId: string;
  startedAt: number;
  /** Ce qui se passe, en une ligne. */
  detail: string;
}

export interface EditorChat {
  projectId: string;
  messages: EditorChatMessage[];
  pending?: EditorChatPending;
  updatedAt: number;
}

/** Bornes de la conversation rangée. */
export const EDITOR_CHAT_LIMITS = {
  /** Caractères d'une demande. */
  request: 2000,
  /** Messages gardés par projet : les plus anciens partent. */
  messages: 80,
  /** Taille du fichier d'une conversation. */
  bytes: 400_000,
  /** Image de l'aperçu envoyée par le navigateur. */
  imageBytes: 6 * 1024 * 1024,
} as const;
