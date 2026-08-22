/**
 * Repérage des agents en ligne de commande installés sur le serveur.
 *
 * On résout l'exécutable nous-mêmes plutôt que de laisser `spawn` s'en
 * charger : sous Windows un nom nu ne se résout qu'à travers un shell, et
 * lancer un shell pour passer un prompt utilisateur en argument ouvrirait la
 * porte à l'injection de commandes. Un chemin absolu supprime le problème et
 * sert en même temps à l'affichage « détecté ici ».
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";

const IS_WINDOWS = process.platform === "win32";

/** Extensions exécutables à essayer quand le nom est donné sans suffixe. */
function executableExtensions(): string[] {
  if (!IS_WINDOWS) return [""];
  const pathext = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  return ["", ...pathext.split(";").filter(Boolean).map((e) => e.toLowerCase())];
}

/**
 * Emplacements courants qui n'apparaissent pas toujours dans le PATH du
 * processus serveur : lancé par un service ou un gestionnaire de processus,
 * Next.js hérite souvent d'un environnement plus pauvre que le terminal de
 * l'utilisateur.
 */
function extraSearchDirs(): string[] {
  const home = os.homedir();
  const dirs = [
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".npm-global", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/opt/homebrew/bin",
  ];
  if (IS_WINDOWS) {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    dirs.push(
      path.join(localAppData, "Programs", "OpenAI", "Codex", "bin"),
      path.join(localAppData, "Programs", "Codex", "bin"),
      path.join(appData, "npm"),
      path.join(home, ".local", "bin")
    );
  }
  return dirs;
}

export function resolveBinary(name: string): string | null {
  // Un chemin explicite fourni par l'utilisateur court-circuite la recherche.
  if (name.includes("/") || name.includes("\\")) {
    return fs.existsSync(name) ? path.resolve(name) : null;
  }

  const fromPath = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates = [...fromPath, ...extraSearchDirs()];
  const extensions = executableExtensions();

  for (const dir of candidates) {
    for (const ext of extensions) {
      const full = path.join(dir, name + ext);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) return full;
      } catch {
        // Répertoire absent ou droit refusé : on continue simplement.
      }
    }
  }
  return null;
}

export interface CommandOutput {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Exécution courte et sans shell, pour les commandes de diagnostic. */
export function runCommand(
  file: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<CommandOutput> {
  const { timeoutMs = 15000, cwd, env } = options;
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: timeoutMs,
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const killed = Boolean(error && (error as any).killed);
        resolve({
          code: error ? ((error as any).code ?? 1) : 0,
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          timedOut: killed,
        });
      }
    );
  });
}

export interface CliProbe {
  /** Exécutable trouvé, chemin absolu. */
  binaryPath: string | null;
  version: string | null;
  /** Compte connecté sur le CLI, quand celui-ci sait le dire. */
  account: string | null;
  authenticated: boolean | null;
  error: string | null;
}

export const EMPTY_PROBE: CliProbe = {
  binaryPath: null,
  version: null,
  account: null,
  authenticated: null,
  error: null,
};
