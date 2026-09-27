/**
 * Voix de synthèse avec Piper, localement et sans clé API.
 *
 * Le moteur et les voix sont téléchargés dans les données du module (voir
 * `resources.ts`). Seules des voix sous licence libre réutilisable sont
 * proposées ; leur mention est affichée dans l'interface.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { ClipAsset, TimedWord } from "../engine/types";
import { ensureResource, resourcePath, resourceState, type ResourceSpec, type ResourceState } from "./resources";
import { alignWords } from "./align";
import { ASSETS_DIR, ensureDirs, readAssets, writeAssets } from "./store";

import { childEnv } from "@/lib/child-env";
const PIPER_RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2";
// Révision figée du dépôt des voix : `main` bouge, et une empreinte ne vaut
// que pour une version précise des fichiers.
const VOICES_REVISION = "c10ece1aade47bb51c153c893d14e5bf8e5b7117";
const VOICES_BASE = `https://huggingface.co/rhasspy/piper-voices/resolve/${VOICES_REVISION}/fr/fr_FR`;

const PIPER: ResourceSpec =
  process.platform === "win32"
    ? {
        id: "piper",
        label: "Moteur Piper",
        url: `${PIPER_RELEASE}/piper_windows_amd64.zip`,
        target: "piper-windows",
        archive: "zip",
        size: 22_477_236,
        sha256: "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea",
      }
    : {
        id: "piper",
        label: "Moteur Piper",
        url: `${PIPER_RELEASE}/piper_linux_x86_64.tar.gz`,
        target: "piper-linux",
        archive: "tar.gz",
        size: 26_460_462,
        sha256: "a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992",
      };

export interface Voice {
  id: string;
  label: string;
  description: string;
  gender: "female" | "male";
  model: string;
  modelPath: string;
  speaker?: number;
  license: string;
  credit: string;
  size: number;
  /** Empreintes SHA-256 du modèle et de ses réglages, à la révision `VOICES_REVISION`. */
  sha256: { model: string; config: string };
}

export const VOICES: Voice[] = [
  {
    id: "siwis",
    label: "Siwis",
    description: "Voix féminine claire et posée",
    gender: "female",
    model: "fr_FR-siwis-medium",
    modelPath: "siwis/medium",
    license: "CC BY 4.0",
    credit: "SIWIS French Speech Synthesis Database, Université d'Édimbourg",
    size: 63_201_294,
    sha256: {
      model: "641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99",
      config: "39479916c2db192b5ac9764daddd0c744d83e023ad890c6976c0633ae4df8959",
    },
  },
  {
    id: "pierre",
    label: "Pierre",
    description: "Voix masculine grave",
    gender: "male",
    model: "fr_FR-upmc-medium",
    modelPath: "upmc/medium",
    speaker: 1,
    license: "CC BY-SA 4.0",
    credit: "UPMC Pierre, MaryTTS",
    size: 76_733_615,
    sha256: {
      model: "9abb3800c199148897a9ed64e100d224f3de83579f100044174ad19418f1786f",
      config: "e8636ec15dfd5d72db37a02cb5320a20f2b8d339f2a0e4337da64c58a33a5868",
    },
  },
  {
    id: "jessica",
    label: "Jessica",
    description: "Voix féminine dynamique",
    gender: "female",
    model: "fr_FR-upmc-medium",
    modelPath: "upmc/medium",
    speaker: 0,
    license: "CC BY-SA 4.0",
    credit: "UPMC Jessica, MaryTTS",
    size: 76_733_615,
    sha256: {
      model: "9abb3800c199148897a9ed64e100d224f3de83579f100044174ad19418f1786f",
      config: "e8636ec15dfd5d72db37a02cb5320a20f2b8d339f2a0e4337da64c58a33a5868",
    },
  },
  {
    id: "gilles",
    label: "Gilles",
    description: "Voix masculine, plus légère",
    gender: "male",
    model: "fr_FR-gilles-low",
    modelPath: "gilles/low",
    license: "CC0",
    credit: "French Single Speaker Speech Dataset",
    size: 63_104_526,
    sha256: {
      model: "5cd711846720e261c2a176f6924c198a7424d0a75dd4b0a5357a5fb9cb739285",
      config: "5a47cc0789e91267d17666bbec842dd92950669271a09023eb6970ee364cf88a",
    },
  },
];

export const DEFAULT_VOICE = "siwis";

function voiceResources(voice: Voice): [ResourceSpec, ResourceSpec] {
  const base = `${VOICES_BASE}/${voice.modelPath}/${voice.model}`;
  return [
    { id: `voice:${voice.model}`, label: `Voix ${voice.label}`, url: `${base}.onnx`, target: `voices/${voice.model}.onnx`, size: voice.size, sha256: voice.sha256.model },
    { id: `voice:${voice.model}:config`, label: `Réglages de la voix ${voice.label}`, url: `${base}.onnx.json`, target: `voices/${voice.model}.onnx.json`, sha256: voice.sha256.config },
  ];
}

function findVoice(id: string): Voice {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[0];
}

// ─── État ────────────────────────────────────────────────────────

export interface VoiceStatus extends Voice {
  state: ResourceState;
}

export function voiceStatuses(): { engine: ResourceState; voices: VoiceStatus[] } {
  return {
    engine: resourceState(PIPER),
    voices: VOICES.map((voice) => ({ ...voice, state: resourceState(voiceResources(voice)[0]) })),
  };
}

/** Téléchargement au démarrage : le moteur et la voix par défaut. */
export function prefetchTts() {
  // Pendant `next build`, les modules sont aussi initialisés : télécharger
  // ici remplirait une couche de l'image Docker, perdue au déploiement.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  void ensureResource(PIPER).catch(() => undefined);
  for (const spec of voiceResources(findVoice(DEFAULT_VOICE))) void ensureResource(spec).catch(() => undefined);
}

export async function prepareVoice(id: string) {
  const voice = findVoice(id);
  await ensureResource(PIPER);
  for (const spec of voiceResources(voice)) await ensureResource(spec);
}

// ─── Synthèse ────────────────────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();

function piperBinary(): string {
  const root = resourcePath(PIPER);
  const name = process.platform === "win32" ? "piper.exe" : "piper";
  for (const candidate of [path.join(root, "piper", name), path.join(root, name)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Le moteur Piper est introuvable après téléchargement.");
}

/** Durée d'un WAV PCM, lue dans son en-tête. */
export function wavDurationMs(file: string): number {
  const buffer = fs.readFileSync(file);
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("latin1", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    // En-tête tronqué ou incohérent : pas de lecture hors du fichier.
    if (id === "fmt " && offset + 20 <= buffer.length) byteRate = buffer.readUInt32LE(offset + 16);
    if (id === "data" && byteRate) return Math.round((size / byteRate) * 1000);
    offset += 8 + size + (size % 2);
  }
  return 0;
}

export interface SpeechResult {
  asset: ClipAsset;
  durationMs: number;
  /** Instants de chaque mot, pour les sous-titres animés. */
  words: TimedWord[];
}

/**
 * Lit un texte avec une voix et range le son parmi les médias du module.
 * Les synthèses passent une par une : Piper occupe un cœur à plein.
 */
/** Synthèses en attente au plus : chacune occupe un cœur et écrit un fichier. */
const MAX_PENDING = 20;
let pending = 0;

export function synthesize(input: { text: string; voice?: string; speed?: number }): Promise<SpeechResult> {
  if (pending >= MAX_PENDING) {
    return Promise.reject(new Error("Trop de voix en cours de génération : réessayez dans un instant."));
  }
  pending++;
  const task = queue.then(() => runSynthesis(input)).finally(() => {
    pending--;
  });
  queue = task.catch(() => undefined);
  return task;
}

async function runSynthesis(input: { text: string; voice?: string; speed?: number }): Promise<SpeechResult> {
  const text = String(input.text ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!text) throw new Error("Rien à lire.");
  const voice = findVoice(input.voice ?? DEFAULT_VOICE);
  await prepareVoice(voice.id);
  ensureDirs();

  const file = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`;
  const output = path.join(ASSETS_DIR, file);
  const speed = Math.min(1.6, Math.max(0.7, Number(input.speed) || 1));
  const args = [
    "--model",
    resourcePath(voiceResources(voice)[0]),
    "--output_file",
    output,
    "--length_scale",
    (1 / speed).toFixed(3),
    "--sentence_silence",
    "0.2",
  ];
  if (voice.speaker !== undefined) args.push("--speaker", String(voice.speaker));

  await new Promise<void>((resolve, reject) => {
    const binary = piperBinary();
    const child = spawn(binary, args, { cwd: path.dirname(binary), env: childEnv(), windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 120_000);
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-1500);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(output)) resolve();
      else reject(new Error(`La synthèse vocale a échoué. ${stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`.trim()));
    });
    child.stdin.write(text);
    child.stdin.end();
  });

  const durationMs = wavDurationMs(output);
  let words: TimedWord[] = [];
  try {
    words = alignWords(output, text);
  } catch {
    // Sans alignement, la voix reste utilisable ; seuls les sous-titres manquent.
  }
  const asset: ClipAsset = {
    file,
    kind: "audio",
    originalName: `Voix ${voice.label} : ${text.slice(0, 60)}`,
    size: fs.statSync(output).size,
    durationMs,
    credit: `Voix ${voice.label} : ${voice.credit}, ${voice.license}`,
    words,
    createdAt: Date.now(),
  };
  writeAssets([asset, ...readAssets()]);
  return { asset, durationMs, words };
}
