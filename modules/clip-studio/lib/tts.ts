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

import { childEnv } from "../../../lib/child-env";
const PIPER_RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2";
const VOICES_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR";

const PIPER: ResourceSpec =
  process.platform === "win32"
    ? { id: "piper", label: "Moteur Piper", url: `${PIPER_RELEASE}/piper_windows_amd64.zip`, target: "piper-windows", archive: "zip", size: 22_477_236 }
    : { id: "piper", label: "Moteur Piper", url: `${PIPER_RELEASE}/piper_linux_x86_64.tar.gz`, target: "piper-linux", archive: "tar.gz", size: 26_460_462 };

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
  },
];

export const DEFAULT_VOICE = "siwis";

function voiceResources(voice: Voice): [ResourceSpec, ResourceSpec] {
  const base = `${VOICES_BASE}/${voice.modelPath}/${voice.model}`;
  return [
    { id: `voice:${voice.model}`, label: `Voix ${voice.label}`, url: `${base}.onnx`, target: `voices/${voice.model}.onnx`, size: voice.size },
    { id: `voice:${voice.model}:config`, label: `Réglages de la voix ${voice.label}`, url: `${base}.onnx.json`, target: `voices/${voice.model}.onnx.json` },
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
    if (id === "fmt ") byteRate = buffer.readUInt32LE(offset + 16);
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
export function synthesize(input: { text: string; voice?: string; speed?: number }): Promise<SpeechResult> {
  const task = queue.then(() => runSynthesis(input));
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
