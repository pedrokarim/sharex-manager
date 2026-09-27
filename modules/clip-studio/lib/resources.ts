/**
 * Ressources téléchargées à la demande : moteur de synthèse vocale, voix,
 * musiques.
 *
 * Rien de tout cela n'est versionné dans le dépôt ni cuit dans l'image
 * Docker. Les fichiers sont téléchargés une fois dans les données du module
 * (volume monté), au démarrage pour l'essentiel et à la première
 * utilisation pour le reste. Un redéploiement ne les retélécharge pas.
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { DATA_DIR } from "./store";

import { childEnv } from "../../../lib/child-env";
export const RESOURCES_DIR = path.join(DATA_DIR, "resources");

export interface ResourceSpec {
  id: string;
  label: string;
  url: string;
  /** Fichier ou dossier final, relatif à `RESOURCES_DIR`. */
  target: string;
  /** Archive à extraire dans `target` (qui est alors un dossier). */
  archive?: "tar.gz" | "zip";
  /** Taille attendue, pour la progression quand le serveur ne la donne pas. */
  size?: number;
}

export interface ResourceState {
  id: string;
  label: string;
  status: "missing" | "downloading" | "ready" | "error";
  received: number;
  total: number;
  error?: string;
}

// Partagé par processus : le démarrage (instrumentation) et les routes
// peuvent charger chacun leur copie de ce fichier, sans télécharger deux fois.
const registry = ((globalThis as any).__clipStudioResources ??= {
  states: new Map<string, ResourceState>(),
  inflight: new Map<string, Promise<string>>(),
}) as { states: Map<string, ResourceState>; inflight: Map<string, Promise<string>> };
const { states, inflight } = registry;

export function resourcePath(spec: ResourceSpec) {
  // `target` peut venir d'une source extérieure (banque de musique) : il ne
  // doit jamais sortir du dossier des ressources.
  const root = path.resolve(RESOURCES_DIR);
  const resolved = path.resolve(root, spec.target);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Chemin de ressource invalide : ${spec.target}`);
  return resolved;
}

export function isReady(spec: ResourceSpec) {
  return fs.existsSync(resourcePath(spec));
}

export function resourceState(spec: ResourceSpec): ResourceState {
  const known = states.get(spec.id);
  if (known && known.status !== "ready") return known;
  return {
    id: spec.id,
    label: spec.label,
    status: isReady(spec) ? "ready" : "missing",
    received: 0,
    total: spec.size ?? 0,
  };
}

/** Garantit la présence de la ressource ; un seul téléchargement à la fois par ressource. */
export function ensureResource(spec: ResourceSpec): Promise<string> {
  if (isReady(spec)) return Promise.resolve(resourcePath(spec));
  let pending = inflight.get(spec.id);
  if (!pending) {
    pending = download(spec).finally(() => inflight.delete(spec.id));
    inflight.set(spec.id, pending);
  }
  return pending;
}

async function download(spec: ResourceSpec): Promise<string> {
  const state: ResourceState = { id: spec.id, label: spec.label, status: "downloading", received: 0, total: spec.size ?? 0 };
  states.set(spec.id, state);
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  const final = resourcePath(spec);
  const temporary = `${final}.part-${Date.now()}`;
  fs.mkdirSync(path.dirname(final), { recursive: true });

  try {
    const response = await fetch(spec.url, { redirect: "follow", headers: { "user-agent": "ShareX-Manager/clip-studio" } });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    state.total = Number(response.headers.get("content-length")) || state.total;

    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        state.received += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const archivePath = spec.archive ? `${temporary}.${spec.archive === "zip" ? "zip" : "tar.gz"}` : temporary;
    await pipeline(Readable.fromWeb(response.body.pipeThrough(counter) as any), fs.createWriteStream(archivePath));

    if (spec.archive) {
      fs.mkdirSync(temporary, { recursive: true });
      // `tar` sait lire les deux formats (bsdtar sous Windows, GNU tar sous Linux pour .tar.gz).
      const args = spec.archive === "zip" ? ["-xf", archivePath, "-C", temporary] : ["-xzf", archivePath, "-C", temporary];
      // Sous Windows, le `tar` du PATH peut être celui de Git (GNU tar), qui
      // prend « C: » pour un hôte distant : on vise celui du système.
      const tar =
        process.platform === "win32"
          ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
          : "tar";
      await run(tar, args);
      fs.rmSync(archivePath, { force: true });
    }

    fs.mkdirSync(path.dirname(final), { recursive: true });
    fs.renameSync(temporary, final);
    state.status = "ready";
    states.delete(spec.id);
    return final;
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(`${temporary}.zip`, { force: true });
    fs.rmSync(`${temporary}.tar.gz`, { force: true });
    state.status = "error";
    state.error = error instanceof Error ? error.message : "Téléchargement impossible";
    throw new Error(`${spec.label} : ${state.error}`);
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: childEnv(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-1000);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} a échoué : ${stderr.trim()}`))));
  });
}
