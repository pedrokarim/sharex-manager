/**
 * Arrêt d’un processus et de tous ses descendants (serveur seulement).
 *
 * yt-dlp lance lui-même ffmpeg pour un passage (`--download-sections`), et
 * l’exécutable Linux est un PyInstaller « onefile » : un chargeur qui lance
 * l’interpréteur Python dans un second processus. `child.kill()` n’arrête
 * que le premier ; les autres continuent d’écrire sur le disque et gardent
 * les tuyaux de sortie ouverts (l’événement `close` n’arrive jamais).
 *
 * - Linux et macOS : le processus est lancé dans son propre groupe
 *   (`detached: true`), et c’est tout le groupe qui reçoit `SIGKILL`.
 * - Windows : `taskkill /T /F` arrête l’arbre entier, sans shell.
 */

import { spawn, type ChildProcess } from "child_process";

export interface ProcessTreeDeps {
  platform: NodeJS.Platform;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  spawn: typeof spawn;
}

export const processTreeDeps: ProcessTreeDeps = {
  get platform() {
    return process.platform;
  },
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
  spawn,
};

/** Options de `spawn` qui permettent d’arrêter ensuite tout l’arbre. */
export function treeSpawnOptions(platform: NodeJS.Platform = processTreeDeps.platform): { detached: boolean } {
  // Sous Windows, `detached` ouvrirait une console à part : taskkill suit l’arbre sans cela.
  return { detached: platform !== "win32" };
}

/**
 * Tue `child` et ses descendants. Sans effet si le processus est déjà fini.
 * Ne lève jamais : un processus disparu entre-temps n’est pas une erreur.
 */
export function killProcessTree(child: Pick<ChildProcess, "pid" | "kill" | "exitCode" | "signalCode">, deps: ProcessTreeDeps = processTreeDeps): void {
  const pid = child.pid;
  if (!pid) return;
  if (deps.platform === "win32") {
    // Le processus principal fini, taskkill ne retrouve plus l’arbre par son numéro.
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      const killer = deps.spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
      killer.on("error", () => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Déjà fini.
        }
      });
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Déjà fini.
      }
    }
    return;
  }
  try {
    // Numéro négatif : tout le groupe du processus, lancé avec `detached: true`.
    // Le groupe survit à son chef tant qu’un descendant (ffmpeg) tourne : il est visé même si yt-dlp a fini.
    deps.kill(-pid, "SIGKILL");
  } catch {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      child.kill("SIGKILL");
    } catch {
      // Déjà fini.
    }
  }
}
