/**
 * Demande un texte à Codex CLI, avec l'abonnement du compte connecté.
 *
 * C'est le seul accès à un modèle de langage disponible sans clé API sur le
 * serveur : il sert à améliorer un prompt ici, et à écrire les scripts de
 * Clip Studio. La détection de l'exécutable et le réglage d'isolation sont
 * ceux du moteur d'images Codex, pour se comporter exactement comme lui. La réponse finale est lue dans le fichier que Codex
 * écrit via `--output-last-message`, plus fiable que d'analyser son flux.
 *
 * Le flux part en JSON (`--json`), un événement par ligne : la fin du tour
 * (`turn.completed`) porte les jetons consommés, notés dans le registre de
 * consommation des IA avec l'origine que l'appelant donne.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { resolveBinary } from "./engines/cli-detect";
import { readSecrets } from "./store";

import { childEnv } from "@/lib/child-env";
import { resolveSandbox } from "./engines/sandbox";
import { recordAiUsage, usageError, type AiErrorKind, type AiUsageOrigin } from "@/lib/ai-usage";

export interface CodexOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  /** Images jointes à la demande (chemins de fichiers), pour une lecture visuelle. */
  images?: string[];
  /**
   * Recherche web en direct (`--search`) : l'outil de recherche du modèle est
   * ouvert, sans rien autoriser d'autre. Les adresses qu'il rend restent des
   * données à contrôler par l'appelant.
   */
  search?: boolean;
  /**
   * Module et usage à l'origine de la demande, pour le registre de
   * consommation. Absent : AI Image Gen, « Texte ».
   */
  origin?: AiUsageOrigin;
}

/** Jetons d'une ligne du flux JSON de `codex exec --json`, quand c'est la fin d'un tour. */
export function codexTurnTokens(line: string): number | null {
  if (!line.startsWith("{") || !line.includes("turn.completed")) return null;
  try {
    const event = JSON.parse(line) as { type?: unknown; usage?: Record<string, unknown> };
    if (event.type !== "turn.completed" || !event.usage) return null;
    const input = Number(event.usage.input_tokens) || 0;
    const output = Number(event.usage.output_tokens) || 0;
    return input + output > 0 ? input + output : null;
  } catch {
    return null;
  }
}

/** Texte lisible d'une ligne du flux JSON, pour `onLog` : message ou commande d'un élément terminé. */
function codexLogLine(line: string): string | null {
  if (!line.startsWith("{")) return line;
  try {
    const event = JSON.parse(line) as { type?: unknown; item?: { text?: unknown; command?: unknown } };
    const item = event.item;
    if (event.type !== "item.completed" || !item) return null;
    if (typeof item.text === "string") return item.text;
    if (typeof item.command === "string") return item.command;
    return null;
  } catch {
    return line;
  }
}

function codexSettings(): { binaryPath?: string; sandbox?: string } {
  try {
    return (readSecrets().cli?.codex as { binaryPath?: string; sandbox?: string }) ?? {};
  } catch {
    return {};
  }
}

export function findCodex(): string | null {
  const settings = codexSettings();
  return settings.binaryPath ?? resolveBinary("codex");
}

/** Erreur d'un appel à Codex, avec sa famille et ce que Codex en a dit, pour le registre et les nouveaux essais. */
export class CodexError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind,
    readonly detail?: string
  ) {
    super(message);
    this.name = "CodexError";
  }
}

/** Message d'erreur porté par une ligne du flux JSON (`error`, `turn.failed`), ou `null`. */
export function codexEventError(line: string): string | null {
  if (!line.startsWith("{") || !/"type":\s*"(error|turn\.failed)"/.test(line)) return null;
  try {
    const event = JSON.parse(line) as { type?: unknown; message?: unknown; error?: { message?: unknown } };
    if (event.type === "error" && typeof event.message === "string") return event.message;
    if (event.type === "turn.failed" && typeof event.error?.message === "string") return event.error.message;
    return null;
  } catch {
    return null;
  }
}

/** Famille d'un échec de Codex, d'après ce qu'il en dit. */
export function classifyCodexError(text: string): AiErrorKind {
  if (/\b429\b|too many requests|rate.?limit/i.test(text)) return "rate-limit";
  if (/usage limit|quota|credit|billing/i.test(text)) return "quota";
  if (/\b40[13]\b|unauthori[sz]ed|forbidden|not logged in|log ?in again|authenticat/i.test(text)) return "auth";
  if (/timed? ?out|délai|deadline/i.test(text)) return "timeout";
  if (/stream disconnected|econn|enotfound|network|socket|connection|\b50[0-4]\b/i.test(text)) return "network";
  return "unknown";
}

/** Message lisible d'un échec. */
function codexFailureMessage(kind: AiErrorKind, code: number | null): string {
  switch (kind) {
    case "rate-limit":
      return "Codex : trop de demandes rapprochées, l’abonnement les a refusées (429).";
    case "quota":
      return "Codex : la limite d’utilisation de l’abonnement est atteinte.";
    case "auth":
      return "Codex : le compte n’est plus connecté sur le serveur.";
    case "timeout":
      return "Codex : délai dépassé.";
    case "network":
      return "Codex : le service n’a pas répondu (réseau ou serveur indisponible).";
    default:
      return `Codex s’est arrêté avec le code ${code ?? "?"}.`;
  }
}

// ─── File d’attente commune ──────────────────────────────────────

/**
 * Appels simultanés au plus, pour tout le serveur. Au-delà, l’abonnement
 * ChatGPT de Codex répond 429 (vu le 19/10/2026 : cinq recherches d’images
 * lancées ensemble par l’assistant de Clip Studio).
 */
export const CODEX_MAX_CONCURRENT = 2;
/** Pause imposée à tous les appels après un refus pour excès de demandes. */
const RATE_LIMIT_COOLDOWN_MS = 20_000;
/** Attentes avant les nouveaux essais d’un échec passager. */
export const CODEX_RETRY_DELAYS_MS = [15_000, 45_000];

const queue: { running: number; waiting: (() => void)[]; pausedUntil: number } = { running: 0, waiting: [], pausedUntil: 0 };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Annulé", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Annulé", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Prend une place dans la file ; la fonction rendue la libère (une seule fois). */
async function acquireSlot(signal?: AbortSignal): Promise<() => void> {
  if (queue.running >= CODEX_MAX_CONCURRENT) {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = queue.waiting.indexOf(wake);
        if (index !== -1) queue.waiting.splice(index, 1);
        reject(new DOMException("Annulé", "AbortError"));
      };
      const wake = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      queue.waiting.push(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  queue.running++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    queue.running--;
    queue.waiting.shift()?.();
  };
  // Après un refus pour excès de demandes, tout le monde attend la fin de la pause.
  const pause = queue.pausedUntil - Date.now();
  if (pause > 0) {
    try {
      await sleep(pause, signal);
    } catch (error) {
      release();
      throw error;
    }
  }
  return release;
}

/** État de la file, pour les tests. */
export function codexQueueState() {
  return { running: queue.running, waiting: queue.waiting.length, pausedUntil: queue.pausedUntil };
}

export async function askCodex(prompt: string, options: CodexOptions = {}): Promise<string> {
  const { signal, images = [], search = false } = options;
  const origin = options.origin ?? { module: "ai-image-gen", feature: "Texte" };
  const binary = findCodex();
  if (!binary) {
    throw new Error("Codex CLI est introuvable sur ce serveur : l'assistant d'écriture en a besoin.");
  }
  const started = Date.now();
  let tokens = 0;
  let attempts = 0;
  const note = (ok: boolean, error?: unknown) =>
    recordAiUsage({
      provider: "codex",
      module: origin.module,
      feature: origin.feature,
      model: "codex",
      unit: "calls",
      amount: 1,
      ok,
      durationMs: Date.now() - started,
      attempts,
      ...(ok
        ? {}
        : {
            error: usageError(error),
            errorKind: error instanceof CodexError ? error.kind : classifyCodexError(usageError(error)),
            ...(error instanceof CodexError && error.detail ? { detail: error.detail } : {}),
          }),
      ...(tokens > 0 ? { extra: { tokens } } : {}),
    });

  try {
    for (;;) {
      attempts++;
      const release = await acquireSlot(signal);
      let retryIn: number | undefined;
      try {
        const answer = await runCodexOnce(binary, prompt, { ...options, images, search }, (used) => (tokens += used));
        note(true);
        return answer;
      } catch (error) {
        const passing = error instanceof CodexError && (error.kind === "rate-limit" || error.kind === "network");
        if (error instanceof CodexError && error.kind === "rate-limit") {
          queue.pausedUntil = Math.max(queue.pausedUntil, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        }
        retryIn = CODEX_RETRY_DELAYS_MS[attempts - 1];
        if (!passing || retryIn === undefined || signal?.aborted) throw error;
      } finally {
        release();
      }
      // Place rendue pendant l’attente : les autres appels avancent.
      options.onLog?.(`Codex occupé, nouvel essai dans ${Math.round(retryIn / 1000)} s…`);
      await sleep(retryIn, signal);
    }
  } catch (error) {
    note(false, error);
    throw error;
  }
}

/** Un essai : un espace de travail neuf, une exécution de `codex exec`. */
async function runCodexOnce(
  binary: string,
  prompt: string,
  options: CodexOptions & { images: string[]; search: boolean },
  onTokens: (used: number) => void
): Promise<string> {
  const { timeoutMs = 4 * 60 * 1000, signal, onLog, images, search } = options;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-codex-"));
  const output = path.join(workspace, "answer.txt");
  // L'assistant n'a besoin que de lire : jamais d'écriture, et pas de bac à
  // sable désactivé sauf si le serveur l'autorise (hôte sans espaces de noms).
  const sandbox = resolveSandbox(codexSettings().sandbox) === "off" ? "off" : "read-only";
  const args = [
    // Option globale de Codex : elle se place avant la sous-commande, `exec` la refuserait.
    ...(search ? ["--search"] : []),
    "exec",
    // Un événement JSON par ligne : la fin du tour donne les jetons consommés, un échec son message.
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--cd",
    workspace,
    "--output-last-message",
    output,
    ...(sandbox === "off" ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--sandbox", sandbox]),
    // Une option par image. Le prompt part par l'entrée standard : en argument, `--image` l'avalerait.
    ...images.flatMap((image) => ["--image", image]),
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: workspace,
        env: childEnv({ prefixes: ["CODEX_", "OPENAI_"] }),
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderrTail = "";
      const eventErrors: string[] = [];
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new CodexError("Codex n'a pas répondu à temps.", "timeout"));
      }, timeoutMs);
      const abort = () => {
        child.kill("SIGTERM");
        reject(new DOMException("Annulé", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });

      child.stdout.setEncoding("utf-8");
      // Une ligne peut arriver en deux morceaux : on attend sa fin avant de la lire.
      let partial = "";
      const readLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        const used = codexTurnTokens(line);
        if (used !== null) onTokens(used);
        const failure = codexEventError(line);
        if (failure) eventErrors.push(failure);
        const text = codexLogLine(line);
        if (text?.trim()) onLog?.(text.trim().slice(0, 300));
      };
      child.stdout.on("data", (chunk: string) => {
        const lines = (partial + chunk).split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) readLine(line);
      });
      child.stdout.on("end", () => {
        readLine(partial);
        partial = "";
      });
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-2000);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (code === 0 && eventErrors.length === 0) return resolve();
        // La cause est dans le flux JSON ; la sortie d’erreur ne dit souvent que « Reading prompt from stdin… ».
        const said = [...new Set(eventErrors)].join("\n");
        const stderrLines = stderrTail
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !/^Reading prompt from stdin/i.test(line))
          .slice(-4)
          .join("\n");
        const kind = classifyCodexError(`${said} ${stderrLines}`);
        const detail = [said, stderrLines].filter(Boolean).join("\n\n") || undefined;
        reject(new CodexError(codexFailureMessage(kind, code), kind, detail));
      });

      // Le prompt part par l'entrée standard, comme dans AI Image Gen.
      child.stdin.write(prompt);
      child.stdin.end();
    });

    if (!fs.existsSync(output)) throw new CodexError("Codex n'a renvoyé aucune réponse.", "provider");
    return fs.readFileSync(output, "utf-8");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/** Extrait le premier objet JSON d'une réponse, même entourée de texte ou de balises. */
export function extractJson<T>(answer: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer);
  const source = fenced ? fenced[1] : answer;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("La réponse de Codex ne contient pas de JSON.");
  return JSON.parse(source.slice(start, end + 1)) as T;
}
