/**
 * Demande un texte à Codex CLI, avec l'abonnement du compte connecté.
 *
 * C'est le seul accès à un modèle de langage disponible sans clé API sur le
 * serveur : il sert à améliorer un prompt ici, et à écrire les scripts de
 * Clip Studio. La détection de l'exécutable et le réglage d'isolation sont
 * ceux du moteur d'images Codex, pour se comporter exactement comme lui. La réponse finale est lue dans le fichier que Codex
 * écrit via `--output-last-message`, plus fiable que d'analyser son flux.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { resolveBinary } from "./engines/cli-detect";
import { readSecrets } from "./store";

import { childEnv } from "@/lib/child-env";
import { resolveSandbox } from "./engines/sandbox";

export interface CodexOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
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
  const { timeoutMs = 4 * 60 * 1000, signal, onLog } = options;
  const binary = findCodex();
  if (!binary) {
    throw new Error("Codex CLI est introuvable sur ce serveur : l'assistant d'écriture en a besoin.");
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-codex-"));
  const output = path.join(workspace, "answer.txt");
  // L'assistant n'a besoin que de lire : jamais d'écriture, et pas de bac à
  // sable désactivé sauf si le serveur l'autorise (hôte sans espaces de noms).
  const sandbox = resolveSandbox(codexSettings().sandbox) === "off" ? "off" : "read-only";
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--cd",
    workspace,
    "--output-last-message",
    output,
    ...(sandbox === "off" ? ["--dangerously-bypass-approvals-and-sandbox"] : ["--sandbox", sandbox]),
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
      child.stdout.on("data", (chunk: string) => {
        for (const line of chunk.split("\n")) if (line.trim()) onLog?.(line.trim().slice(0, 300));
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
