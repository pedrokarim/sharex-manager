/**
 * Assistant de l'éditeur, côté serveur : la conversation de chaque projet et
 * l'appel à Codex en arrière-plan.
 *
 * 1. Le navigateur enregistre le projet, puis envoie la demande, l'instant de
 *    la tête de lecture, la sélection et une image de l'aperçu
 *    (`sendEditorChat`).
 * 2. La demande entre aussitôt dans la conversation ; Codex lit le projet tel
 *    qu'enregistré, la conversation passée et l'image, et répond par un
 *    message et des opérations (`engine/editor-brief.ts`).
 * 3. Le navigateur suit l'avancement (`getEditorChat`), applique les
 *    opérations au projet qu'il a sous les yeux, en une seule étape
 *    d'annulation, puis range ce qui a été appliqué ou écarté
 *    (`recordEditorChatOutcome`).
 *
 * Une conversation par projet, dans `data/editor-chats/<projet>.json`,
 * écrite par un fichier temporaire puis un renommage, comme les projets ;
 * bornée en messages et en taille. Une demande à la fois par projet,
 * annulable. Supprimer un projet supprime sa conversation (`store.ts`).
 */

import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { describeProject, editorAssistantPrompt, readEditorReply, type BriefTurn } from "../engine/editor-brief";
import { itemName, type EditorChange } from "../engine/editor-ops";
import { findItem } from "../engine/edit";
import type { ClipProject } from "../engine/types";
import { askCodex, extractJson } from "./codex";
import { EDITOR_CHAT_LIMITS, type EditorChat, type EditorChatMessage, type EditorChatOutcome } from "./editor-chat-types";
import { publicErrorMessage } from "./job-safety";
import { assertId, EDITOR_CHATS_DIR, readProject } from "./store";

export type { EditorChat, EditorChatMessage, EditorChatOutcome } from "./editor-chat-types";

/** Un appel à Codex : trois minutes au plus, la file commune fait le reste. */
const ASK_TIMEOUT_MS = 3 * 60 * 1000;
const MESSAGE_ID = /^m-[a-z0-9]{6,40}$/;

// ─── Dépendances (remplaçables dans les tests) ───────────────────

export const editorChatDeps = {
  dir: () => EDITOR_CHATS_DIR,
  readProject: (id: string): ClipProject | null => readProject(id),
  ask(prompt: string, options: { signal: AbortSignal; images: string[]; onLog: (line: string) => void }): Promise<string> {
    return askCodex(prompt, { ...options, timeoutMs: ASK_TIMEOUT_MS, origin: { module: "clip-studio", feature: "Assistant de l’éditeur" } });
  },
  /** Image de l'aperçu ramenée à 1280 px au plus, en JPEG : assez pour lire un texte, léger pour Codex. */
  async prepareImage(buffer: Buffer): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp(buffer, { limitInputPixels: 20_000_000, failOn: "error" })
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#000000" })
      .jpeg({ quality: 82 })
      .toBuffer();
  },
  now: () => Date.now(),
};

// ─── Rangement ───────────────────────────────────────────────────

function chatFile(projectId: string): string {
  assertId(projectId, "Identifiant de projet");
  return path.join(editorChatDeps.dir(), `${projectId}.json`);
}

function emptyChat(projectId: string): EditorChat {
  return { projectId, messages: [], updatedAt: 0 };
}

function readChat(projectId: string): EditorChat {
  try {
    const parsed = JSON.parse(fs.readFileSync(chatFile(projectId), "utf-8")) as EditorChat;
    if (!parsed || !Array.isArray(parsed.messages)) return emptyChat(projectId);
    return { ...parsed, projectId };
  } catch {
    return emptyChat(projectId);
  }
}

/** Écrit la conversation, bornée : les messages les plus anciens partent d'abord. */
function writeChat(chat: EditorChat) {
  const file = chatFile(chat.projectId);
  let messages = chat.messages.slice(-EDITOR_CHAT_LIMITS.messages);
  let serialized = JSON.stringify({ ...chat, messages });
  while (serialized.length > EDITOR_CHAT_LIMITS.bytes && messages.length > 1) {
    messages = messages.slice(Math.max(1, Math.ceil(messages.length / 10)));
    serialized = JSON.stringify({ ...chat, messages });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, serialized);
  fs.renameSync(temporary, file);
}

/** Lit, modifie et réécrit la conversation d'un coup (synchrone : aucun autre accès ne s'intercale). */
function updateChat(projectId: string, change: (chat: EditorChat) => EditorChat | null): EditorChat {
  const next = change(readChat(projectId));
  if (!next) return readChat(projectId);
  const stamped = { ...next, updatedAt: editorChatDeps.now() };
  writeChat(stamped);
  return stamped;
}

function newMessageId(): string {
  return `m-${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

// ─── Travaux en cours ────────────────────────────────────────────

/** Demande en cours par projet ; survit au rechargement à chaud du serveur de développement. */
const running = ((globalThis as any).__sxmEditorChatJobs ??= new Map<string, { jobId: string; controller: AbortController }>()) as Map<
  string,
  { jobId: string; controller: AbortController }
>;

/**
 * La conversation d'un projet. Une demande restée « en cours » sans travail
 * vivant (serveur redémarré) est close par un message qui le dit.
 */
export function getEditorChat(projectId: unknown): EditorChat {
  assertId(projectId, "Identifiant de projet");
  const chat = readChat(projectId as string);
  const pending = chat.pending;
  if (!pending || running.get(chat.projectId)?.jobId === pending.jobId) return chat;
  return updateChat(chat.projectId, (current) => {
    if (current.pending?.jobId !== pending.jobId) return null;
    const { pending: _pending, ...rest } = current;
    return {
      ...rest,
      messages: [
        ...rest.messages,
        { id: newMessageId(), role: "assistant", text: "La demande a été interrompue par un redémarrage du serveur : rien n’a été changé. Renvoyez-la.", at: editorChatDeps.now(), error: "interrupted" },
      ],
    };
  });
}

export interface EditorChatRequest {
  projectId: string;
  text: string;
  /** Image de la tête de lecture. */
  frame: number;
  selectedId?: string | null;
}

function cleanRequest(raw: unknown): EditorChatRequest {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  assertId(input.projectId, "Identifiant de projet");
  const text = typeof input.text === "string" ? input.text.replace(/\r\n?/g, "\n").trim() : "";
  if (!text) throw new Error("Écrivez ce qu’il faut changer.");
  if (text.length > EDITOR_CHAT_LIMITS.request) throw new Error(`Demande trop longue : ${EDITOR_CHAT_LIMITS.request} caractères au plus.`);
  const frame = typeof input.frame === "number" && Number.isFinite(input.frame) && input.frame >= 0 ? Math.round(input.frame) : 0;
  const selectedId = typeof input.selectedId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(input.selectedId) ? input.selectedId : null;
  return { projectId: input.projectId as string, text, frame, selectedId };
}

/**
 * Envoie une demande : elle entre dans la conversation, Codex la traite en
 * arrière-plan. Le projet doit avoir été enregistré juste avant (l'éditeur
 * le fait) : c'est lui que Codex lit.
 */
export function sendEditorChat(raw: unknown, image?: unknown): EditorChat {
  const request = cleanRequest(raw);
  const projectId = request.projectId;
  const project = editorChatDeps.readProject(projectId);
  if (!project) throw new Error("Ce projet est introuvable : rechargez l’éditeur.");
  if (image !== undefined && image !== null && (!Buffer.isBuffer(image) || image.length === 0 || image.length > EDITOR_CHAT_LIMITS.imageBytes)) {
    throw new Error("L’image de l’aperçu est illisible ou trop lourde : réessayez sans elle.");
  }
  // Une demande en cours, et vivante : la suivante attend.
  const chat = getEditorChat(projectId);
  if (chat.pending) throw new Error("Une demande est déjà en cours : attendez la réponse ou annulez-la.");

  const fps = project.fps;
  const selected = request.selectedId ? findItem(project, request.selectedId)?.item : undefined;
  const message: EditorChatMessage = {
    id: newMessageId(),
    role: "user",
    text: request.text,
    at: editorChatDeps.now(),
    context: {
      seconds: Math.round((request.frame / fps) * 100) / 100,
      ...(selected ? { selectedId: selected.id, selectedName: itemName(selected).slice(0, 120) } : {}),
      image: Buffer.isBuffer(image),
    },
  };
  const jobId = `ejob-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const history = historyOf(chat.messages);
  const next = updateChat(projectId, (current) => ({
    ...current,
    messages: [...current.messages, message],
    pending: { jobId, messageId: message.id, startedAt: editorChatDeps.now(), detail: "Codex lit le projet…" },
  }));
  const controller = new AbortController();
  running.set(projectId, { jobId, controller });
  void runTurn({ project, request: { ...request, selectedId: selected?.id ?? null }, history, image: Buffer.isBuffer(image) ? image : null, jobId, signal: controller.signal }).finally(() => {
    if (running.get(projectId)?.jobId === jobId) running.delete(projectId);
  });
  return next;
}

/** Annule la demande en cours d'un projet. */
export function cancelEditorChat(projectId: unknown): { success: boolean } {
  assertId(projectId, "Identifiant de projet");
  const job = running.get(projectId as string);
  if (!job) return { success: false };
  job.controller.abort();
  return { success: true };
}

/** Repart d'une conversation vide ; une demande en cours est annulée et sa réponse oubliée. */
export function clearEditorChat(projectId: unknown): EditorChat {
  assertId(projectId, "Identifiant de projet");
  running.get(projectId as string)?.controller.abort();
  running.delete(projectId as string);
  fs.rmSync(chatFile(projectId as string), { force: true });
  return emptyChat(projectId as string);
}

// ─── Résultat dans l'éditeur ─────────────────────────────────────

function cleanChange(raw: unknown): EditorChange | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (!Number.isInteger(input.index) || (input.index as number) < 0 || (input.index as number) > 100) return null;
  const text = (value: unknown, length: number) => (typeof value === "string" ? value.slice(0, length) : "");
  const summary = text(input.summary, 300);
  if (!summary) return null;
  const change: EditorChange = { index: input.index as number, op: text(input.op, 40) || "?", summary };
  if (typeof input.itemId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(input.itemId)) change.itemId = input.itemId;
  if (typeof input.seconds === "number" && Number.isFinite(input.seconds) && input.seconds >= 0 && input.seconds <= 30 * 60) change.seconds = input.seconds;
  if (Number.isInteger(input.point) && (input.point as number) >= 1 && (input.point as number) <= 50) change.point = input.point as number;
  const reason = text(input.reason, 300);
  if (reason) change.reason = reason;
  return change;
}

/**
 * Range ce que l'éditeur a fait d'une réponse : changements appliqués et
 * écartés (résumés calculés par l'éditeur), ou leur annulation.
 */
export function recordEditorChatOutcome(raw: unknown): EditorChat {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  assertId(input.projectId, "Identifiant de projet");
  if (typeof input.messageId !== "string" || !MESSAGE_ID.test(input.messageId)) throw new Error("Réponse introuvable.");
  const list = (value: unknown) => (Array.isArray(value) ? value.slice(0, 60).map(cleanChange).filter((change): change is EditorChange => change !== null) : []);
  let found = false;
  const chat = updateChat(input.projectId as string, (current) => {
    const messages = current.messages.map((message) => {
      if (message.id !== input.messageId || message.role !== "assistant" || message.error) return message;
      found = true;
      if (input.reverted === true) {
        return message.outcome ? { ...message, outcome: { ...message.outcome, reverted: true } } : message;
      }
      const outcome: EditorChatOutcome = { applied: list(input.applied), skipped: list(input.skipped), at: editorChatDeps.now() };
      return { ...message, outcome };
    });
    return found ? { ...current, messages } : null;
  });
  if (!found) throw new Error("Cette réponse n’est plus dans la conversation.");
  return chat;
}

// ─── Appel à Codex ───────────────────────────────────────────────

/** Les tours passés, tels que Codex les relit. */
export function historyOf(messages: EditorChatMessage[]): BriefTurn[] {
  return messages
    .filter((message) => message.role === "user" || !message.error)
    .slice(-12)
    .map((message): BriefTurn => {
      if (message.role === "user") return { role: "user", text: message.text };
      const outcome = message.outcome;
      return {
        role: "assistant",
        text: message.text,
        ...(outcome?.applied.length ? { applied: outcome.applied.map((change) => change.summary) } : {}),
        ...(outcome?.skipped.length ? { skipped: outcome.skipped.map((change) => `${change.summary} : ${change.reason ?? "écarté"}`) } : {}),
        ...(outcome?.reverted ? { reverted: true } : {}),
        ...(!outcome && message.ops?.length ? { notApplied: true } : {}),
      };
    });
}

interface Turn {
  project: ClipProject;
  request: EditorChatRequest;
  history: BriefTurn[];
  image: Buffer | null;
  jobId: string;
  signal: AbortSignal;
}

/** La réponse (ou l'échec) entre dans la conversation, sauf si elle a été vidée ou le projet supprimé entre-temps. */
function finish(projectId: string, jobId: string, message: Omit<EditorChatMessage, "id" | "at">) {
  if (!fs.existsSync(chatFile(projectId))) return;
  updateChat(projectId, (current) => {
    if (current.pending?.jobId !== jobId) return null;
    const { pending: _pending, ...rest } = current;
    return { ...rest, messages: [...rest.messages, { id: newMessageId(), at: editorChatDeps.now(), ...message }] };
  });
}

function note(projectId: string, jobId: string, detail: string) {
  if (!fs.existsSync(chatFile(projectId))) return;
  updateChat(projectId, (current) => (current.pending?.jobId === jobId ? { ...current, pending: { ...current.pending, detail: detail.slice(0, 160) } } : null));
}

async function runTurn(turn: Turn) {
  const { project, request, jobId, signal } = turn;
  const projectId = project.id;
  const started = editorChatDeps.now();
  let workspace: string | null = null;
  try {
    const images: string[] = [];
    if (turn.image) {
      try {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-editor-chat-"));
        const file = path.join(workspace, "apercu.jpg");
        fs.writeFileSync(file, await editorChatDeps.prepareImage(turn.image));
        images.push(file);
      } catch {
        // Une image illisible n'empêche pas la réponse : Codex lit alors le projet seul.
      }
    }
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    note(projectId, jobId, images.length ? "Codex lit le projet et regarde l’aperçu…" : "Codex lit le projet…");
    const prompt = editorAssistantPrompt({
      brief: describeProject(project, { frame: request.frame, selectedId: request.selectedId }),
      history: turn.history,
      request: request.text,
      image: images.length > 0,
    });
    const answer = await editorChatDeps.ask(prompt, {
      signal,
      images,
      // Seuls les messages de la file commune parlent à l'utilisateur ; le reste du flux est du bruit.
      onLog: (line) => {
        if (/^Codex occupé/.test(line)) note(projectId, jobId, line);
      },
    });
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    const reply = readEditorReply(extractJson(answer));
    finish(projectId, jobId, {
      role: "assistant",
      text: reply.message,
      ...(reply.understood.length ? { understood: reply.understood } : {}),
      ...(reply.ops.length ? { ops: reply.ops } : {}),
      durationMs: editorChatDeps.now() - started,
    });
  } catch (error) {
    const canceled = signal.aborted || (error as Error)?.name === "AbortError";
    finish(projectId, jobId, {
      role: "assistant",
      text: canceled ? "Demande annulée : rien n’a été changé." : publicErrorMessage(error, "L’assistant n’a pas pu répondre : réessayez.", "[clip-studio] assistant de l’éditeur"),
      error: canceled ? "canceled" : "failed",
      durationMs: editorChatDeps.now() - started,
    });
  } finally {
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  }
}
