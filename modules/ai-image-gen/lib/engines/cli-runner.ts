/**
 * Exécution d'un agent CLI et récolte des images qu'il produit.
 *
 * Un agent n'est pas une API : il ne « renvoie » pas d'image, il en écrit sur
 * le disque au fil de son raisonnement. Le contrat commun se réduit donc à
 * trois questions – quels arguments lancer, comment lire son avancement, et où
 * regarder ensuite. Chaque moteur répond à ces trois questions dans
 * `cli-engines.ts`, tout le reste est mutualisé ici.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type {
  EngineModelSpec,
  GenerateRequest,
  LogLine,
  ReferenceImage,
} from "./types";
import { EngineError } from "./types";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export interface CliPlan {
  args: string[];
  env?: Record<string, string>;
  /** Prompt envoyé sur l'entrée standard plutôt qu'en argument. */
  stdin?: string;
  /** Répertoires à inspecter en plus de l'espace de travail. */
  watchDirs?: string[];
}

export interface CliRunState {
  /** Identifiant de session extrait des évènements, quand il y en a un. */
  sessionId: string | null;
  log: LogLine[];
  stdoutTail: string[];
  stderrTail: string[];
}

export interface CliPlanInput {
  request: GenerateRequest;
  /** Répertoire de travail jetable, accessible en écriture. */
  workspace: string;
  /** Sous-dossier où l'agent est prié de déposer ses images. */
  outputDir: string;
  /** Références déjà écrites sur le disque, chemins absolus. */
  referenceFiles: string[];
  options: Record<string, unknown>;
}

export interface CliEngineSpec {
  id: string;
  label: string;
  /** Noms d'exécutable à tester, dans l'ordre de préférence. */
  binaries: string[];
  installHint: string;
  docsUrl?: string;
  /** Le CLI sait-il générer une image sans clé API ? */
  imageCapable: boolean;
  /** Arguments d'une commande de version, pour la détection. */
  versionArgs: string[];
  /** Commande facultative rendant compte du compte connecté. */
  authArgs?: string[];
  parseAuth?: (out: string) => { authenticated: boolean; account: string | null };
  /**
   * Modes de bac a sable proposes, quand le CLI en a un. En conteneur, le
   * mecanisme d'isolation peut etre indisponible selon le noyau et le profil
   * seccomp de l'hote : il faut pouvoir le relacher sans toucher au code.
   */
  sandboxModes?: { value: string; label: string; description: string }[];
  models: EngineModelSpec[];
  /** Construit la ligne de commande d'une génération. */
  plan(input: CliPlanInput): CliPlan;
  /** Interprète une ligne de sortie ; peut renseigner l'identifiant de session. */
  consume?(line: string, state: CliRunState): LogLine | null;
  /** Répertoires où chercher les images une fois l'agent terminé. */
  outputDirs?(state: CliRunState, workspace: string): string[];
}

/** Écrit les images de référence pour que le CLI puisse les lire. */
export function writeReferences(
  references: ReferenceImage[] | undefined,
  dir: string
): string[] {
  if (!references?.length) return [];
  fs.mkdirSync(dir, { recursive: true });
  return references.map((ref, index) => {
    const extension = (ref.mimeType.split("/")[1] || "png").split("+")[0];
    const file = path.join(dir, `reference-${index + 1}.${extension}`);
    fs.writeFileSync(file, Buffer.from(ref.b64, "base64"));
    return file;
  });
}

function listImages(dir: string): { file: string; mtime: number }[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: { file: string; mtime: number }[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listImages(full));
      continue;
    }
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    try {
      found.push({ file: full, mtime: fs.statSync(full).mtimeMs });
    } catch {
      // Fichier disparu entre le listing et le stat.
    }
  }
  return found;
}

export interface CliRunOutcome {
  files: string[];
  state: CliRunState;
  exitCode: number | null;
}

/**
 * Lance l'agent, suit sa sortie ligne à ligne, puis ramasse les images.
 *
 * Le filtrage par date de modification est indispensable : les moteurs qui
 * archivent leurs rendus dans un dossier partagé – Codex range tout sous
 * `~/.codex/generated_images` – exposeraient sinon les images des exécutions
 * précédentes.
 */
export async function runCliEngine(
  spec: CliEngineSpec,
  binaryPath: string,
  input: CliPlanInput,
  hooks: {
    onProgress?: (line: LogLine) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<CliRunOutcome> {
  const { onProgress, signal, timeoutMs = 15 * 60 * 1000 } = hooks;
  const plan = spec.plan(input);
  // Marge de deux secondes : l'horodatage des fichiers et celui du processus
  // ne viennent pas toujours de la même horloge.
  const startedAt = Date.now() - 2000;

  const state: CliRunState = {
    sessionId: null,
    log: [],
    stdoutTail: [],
    stderrTail: [],
  };

  const push = (line: LogLine) => {
    state.log.push(line);
    // Un agent bavard produirait un journal illisible et un fichier d'état qui
    // gonfle sans fin : on garde une fenêtre glissante.
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
    onProgress?.(line);
  };

  push({ ts: Date.now(), level: "info", text: `Lancement de ${spec.label}…` });

  const child = spawn(binaryPath, plan.args, {
    cwd: input.workspace,
    env: { ...process.env, ...(plan.env ?? {}) },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (plan.stdin !== undefined) {
    child.stdin.write(plan.stdin);
  }
  child.stdin.end();

  const consumeStream = (
    stream: NodeJS.ReadableStream,
    channel: "stdout" | "stderr"
  ) => {
    let buffer = "";
    stream.setEncoding("utf-8");
    stream.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.trim()) {
          const tail = channel === "stdout" ? state.stdoutTail : state.stderrTail;
          tail.push(line);
          if (tail.length > 200) tail.shift();

          const parsed = spec.consume?.(line, state);
          if (parsed) push(parsed);
        }
        index = buffer.indexOf("\n");
      }
    });
  };

  consumeStream(child.stdout, "stdout");
  consumeStream(child.stderr, "stderr");

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(
          new EngineError(
            `${spec.label} n'a pas répondu dans le temps imparti (${Math.round(timeoutMs / 1000)} s).`
          )
        )
      );
    }, timeoutMs);

    const onAbort = () => {
      child.kill("SIGKILL");
      finish(() => reject(new EngineError("Génération annulée.")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) =>
      finish(() =>
        reject(
          new EngineError(
            `Impossible de lancer ${spec.label} : ${error.message}`,
            binaryPath
          )
        )
      )
    );
    child.on("close", (code) => finish(() => resolve(code)));
  });

  const dirs = new Set<string>([input.outputDir, ...(plan.watchDirs ?? [])]);
  for (const dir of spec.outputDirs?.(state, input.workspace) ?? []) {
    dirs.add(dir);
  }

  const referenceSet = new Set(input.referenceFiles.map((f) => path.resolve(f)));
  const files = [...dirs]
    .flatMap((dir) => listImages(dir))
    .filter((entry) => entry.mtime >= startedAt)
    // Les références écrites pour l'agent vivent aussi sur le disque : elles ne
    // doivent pas revenir dans les résultats.
    .filter((entry) => !referenceSet.has(path.resolve(entry.file)))
    .sort((a, b) => a.mtime - b.mtime)
    .map((entry) => entry.file);

  // Doublons possibles quand l'agent copie son rendu dans l'espace de travail
  // alors qu'on surveille déjà son dossier d'archive.
  const unique = dedupeBySize(files);

  push({
    ts: Date.now(),
    level: unique.length ? "info" : "warn",
    text: unique.length
      ? `${unique.length} image(s) récupérée(s).`
      : "Aucune image trouvée à l'issue de l'exécution.",
  });

  return { files: unique, state, exitCode };
}

/**
 * Deux chemins pour le même rendu : on ne garde que le premier trouvé. La
 * taille en octets suffit à les rapprocher – il s'agit de copies exactes, pas
 * de rendus voisins.
 */
function dedupeBySize(files: string[]): string[] {
  const seen = new Map<number, string>();
  for (const file of files) {
    try {
      const { size } = fs.statSync(file);
      if (!seen.has(size)) seen.set(size, file);
    } catch {
      // Ignoré : le fichier vient de disparaître.
    }
  }
  return [...seen.values()];
}
