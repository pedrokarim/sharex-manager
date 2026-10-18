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
import { recordAiUsage, usageError, type AiUsageOrigin } from "@/lib/ai-usage";

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

export async function askCodex(prompt: string, options: CodexOptions = {}): Promise<string> {
  const { timeoutMs = 4 * 60 * 1000, signal, onLog, images = [], search = false } = options;
  const origin = options.origin ?? { module: "ai-image-gen", feature: "Texte" };
  const binary = findCodex();
  if (!binary) {
    throw new Error("Codex CLI est introuvable sur ce serveur : l'assistant d'écriture en a besoin.");
  }
  let tokens = 0;
  const note = (ok: boolean, error?: unknown) =>
    recordAiUsage({
      provider: "codex",
      module: origin.module,
      feature: origin.feature,
      model: "codex",
      unit: "calls",
      amount: 1,
      ok,
      ...(ok ? {} : { error: usageError(error) }),
      ...(tokens > 0 ? { extra: { tokens } } : {}),
    });

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-codex-"));
  const output = path.join(workspace, "answer.txt");
  // L'assistant n'a besoin que de lire : jamais d'écriture, et pas de bac à
  // sable désactivé sauf si le serveur l'autorise (hôte sans espaces de noms).
  const sandbox = resolveSandbox(codexSettings().sandbox) === "off" ? "off" : "read-only";
  const args = [
    // Option globale de Codex : elle se place avant la sous-commande, `exec` la refuserait.
    ...(search ? ["--search"] : []),
    "exec",
    // Un événement JSON par ligne : la fin du tour donne les jetons consommés.
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
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Codex n'a pas répondu à temps."));
      }, timeoutMs);
      const abort = () => {
        child.kill("SIGTERM");
        reject(new DOMException("Annulé", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });

      child.stdout.setEncoding("utf-8");
      // Une ligne peut arriver en deux morceaux : on attend sa fin avant de la lire.
      let partial = "";
      const readLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        const used = codexTurnTokens(line);
        if (used !== null) tokens += used;
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
        if (code === 0) resolve();
        else reject(new Error(`Codex s'est arrêté avec le code ${code}. ${stderrTail.split("\n").slice(-3).join(" ")}`.trim()));
      });

      // Le prompt part par l'entrée standard, comme dans AI Image Gen.
      child.stdin.write(prompt);
      child.stdin.end();
    });

    if (!fs.existsSync(output)) throw new Error("Codex n'a renvoyé aucune réponse.");
    const answer = fs.readFileSync(output, "utf-8");
    note(true);
    return answer;
  } catch (error) {
    note(false, error);
    throw error;
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
