/**
 * Voix de synthèse avec Piper, localement et sans clé API, et voix en ligne
 * par clé API (voir `cloud-tts.ts`).
 *
 * Le moteur et les voix sont téléchargés dans les données du module (voir
 * `resources.ts`). Seules des voix sous licence libre réutilisable sont
 * proposées ; leur mention est affichée dans l'interface.
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { spawn } from "child_process";
import type { ClipAsset, SpeechInfo, TimedWord } from "../engine/types";
import { ensureResource, resourcePath, resourceState, type ResourceSpec, type ResourceState } from "./resources";
import { alignWords } from "./align";
import { ASSETS_DIR, DATA_DIR, ensureDirs, readAssets, writeAssets } from "./store";
import {
  cloudVoiceLabel,
  isCloudVoiceUsable,
  listCloudVoices,
  parseCloudVoice,
  providerLabel,
  sourceAvailability,
  synthesizeCloud,
  type CloudProvider,
  type SourceAvailability,
} from "./cloud-tts";
import { toPcmWav } from "@/lib/media/ffmpeg";
import { cleanSpeed } from "./voice-settings";

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

/**
 * Intonation des voix locales : réglages du bruit de Piper. `noise_scale`
 * fait varier le timbre et la mélodie, `noise_w` la durée des sons. Les
 * valeurs d'origine des modèles (0,667 et 0,8) donnent un débit irrégulier,
 * qui peut sonner « mou » ; les réglages plus bas le stabilisent.
 */
export const PIPER_TONES = {
  steady: { label: "Régulière", noiseScale: 0.5, noiseW: 0.4 },
  balanced: { label: "Équilibrée", noiseScale: 0.6, noiseW: 0.6 },
  expressive: { label: "Expressive", noiseScale: 0.667, noiseW: 0.8 },
} as const;

export type PiperTone = keyof typeof PIPER_TONES;
export const DEFAULT_TONE: PiperTone = "balanced";

export function isPiperTone(value: unknown): value is PiperTone {
  return typeof value === "string" && value in PIPER_TONES;
}

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

/** Voix proposée à l'interface, locale ou en ligne. */
export interface VoiceStatus {
  id: string;
  label: string;
  description: string;
  gender?: "female" | "male";
  provider: "piper" | CloudProvider;
  /** Voix locale : mention de licence. En ligne : nom du fournisseur. */
  credit: string;
  license?: string;
  /** Langue de la voix (« fr-FR »). */
  locale?: string;
  state: ResourceState;
}

/** Source de voix et sa disponibilité, pour le sélecteur. */
export interface VoiceSource {
  id: "piper" | CloudProvider;
  label: string;
  available: boolean;
  reason?: string;
  usage?: SourceAvailability["usage"];
}

const READY = (id: string): ResourceState => ({ id, label: id, status: "ready", received: 0, total: 0 });

export async function voiceStatuses(): Promise<{ engine: ResourceState; voices: VoiceStatus[]; sources: VoiceSource[] }> {
  const cloud = await listCloudVoices();
  // Après la liste : elle note les erreurs des fournisseurs.
  const sources: VoiceSource[] = [
    { id: "piper", label: "Locales", available: true },
    ...sourceAvailability().map((source: SourceAvailability): VoiceSource => source),
  ];
  return {
    engine: resourceState(PIPER),
    sources,
    voices: [
      ...VOICES.map((voice): VoiceStatus => ({
        id: voice.id,
        label: voice.label,
        description: voice.description,
        gender: voice.gender,
        provider: "piper",
        credit: voice.credit,
        license: voice.license,
        locale: "fr-FR",
        state: resourceState(voiceResources(voice)[0]),
      })),
      ...cloud.map((voice): VoiceStatus => ({
        id: voice.id,
        label: voice.label,
        description: voice.description,
        gender: voice.gender,
        provider: voice.provider,
        credit: providerLabel(voice.provider),
        locale: voice.locale,
        state: READY(voice.id),
      })),
    ],
  };
}

/** Voix acceptée par la synthèse : locale, ou en ligne avec une clé configurée. */
export function isKnownVoice(id: unknown): id is string {
  return typeof id === "string" && (VOICES.some((voice) => voice.id === id) || isCloudVoiceUsable(id));
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
  // Une voix en ligne n'a rien à télécharger.
  if (parseCloudVoice(id)) return;
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

/** Synthèses en attente au plus : chacune occupe un cœur et écrit un fichier. */
const MAX_PENDING = 20;
let pending = 0;

export interface SpeakInput {
  text: string;
  voice?: string;
  speed?: number;
  /** Intonation d'une voix locale ; ignorée par les voix en ligne. */
  tone?: string;
}

/**
 * Lit un texte avec une voix et range le son parmi les médias du module.
 * Les synthèses locales passent une par une : Piper occupe un cœur à plein.
 */
export function synthesize(input: SpeakInput): Promise<SpeechResult> {
  if (pending >= MAX_PENDING) {
    return Promise.reject(new Error("Trop de voix en cours de génération : réessayez dans un instant."));
  }
  pending++;
  // Une voix en ligne ne charge pas le processeur : elle n'attend pas Piper.
  if (parseCloudVoice(String(input.voice ?? ""))) {
    return runCloudSynthesis(input).finally(() => {
      pending--;
    });
  }
  return inPiperQueue(() => runSynthesis(input)).finally(() => {
    pending--;
  });
}

/** File d'attente de Piper, commune aux voix et aux extraits d'écoute. */
function inPiperQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

function cleanText(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!text) throw new Error("Rien à lire.");
  return text;
}

/** Débit borné, commun aux moteurs (voir `voice-settings.ts`). */
export { cleanSpeed };

/** Durée, alignement et rangement parmi les médias : communs à tous les moteurs. */
function registerSpeech(file: string, label: string, credit: string, speech: SpeechInfo, providedWords?: TimedWord[]): SpeechResult {
  const output = path.join(ASSETS_DIR, file);
  const durationMs = wavDurationMs(output);
  let words: TimedWord[] = providedWords?.length ? providedWords : [];
  if (!words.length) {
    try {
      words = alignWords(output, speech.text);
    } catch {
      // Sans alignement, la voix reste utilisable ; seuls les sous-titres manquent.
    }
  }
  const asset: ClipAsset = {
    file,
    kind: "audio",
    originalName: `Voix ${label} : ${speech.text.slice(0, 60)}`,
    size: fs.statSync(output).size,
    durationMs,
    credit,
    words,
    speech,
    createdAt: Date.now(),
  };
  writeAssets([asset, ...readAssets()]);
  return { asset, durationMs, words };
}

function creditFor(provider: string, label: string): string {
  return provider === "Microsoft Edge"
    ? `Voix ${label} : synthèse Microsoft (lecture à voix haute d'Edge), voix générée par IA`
    : `Voix ${label} : synthèse ${provider}, voix générée par IA`;
}

async function runCloudSynthesis(input: SpeakInput): Promise<SpeechResult> {
  const text = cleanText(input.text);
  const voice = String(input.voice);
  const speed = cleanSpeed(input.speed);
  ensureDirs();
  const { audio, extension, words } = await synthesizeCloud(voice, text, speed);
  const stem = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const raw = path.join(ASSETS_DIR, `${stem}.source.${extension}`);
  const file = `${stem}.wav`;
  fs.writeFileSync(raw, audio);
  try {
    await toPcmWav(raw, path.join(ASSETS_DIR, file));
  } finally {
    fs.rmSync(raw, { force: true });
  }
  const { label, provider } = await cloudVoiceLabel(voice);
  return registerSpeech(file, label, creditFor(provider, label), { text, voice, speed }, words);
}

/** Lance Piper sur un texte et écrit le WAV produit. */
async function runPiper(voice: Voice, text: string, speed: number, tone: PiperTone, output: string): Promise<void> {
  await prepareVoice(voice.id);
  const settings = PIPER_TONES[tone];
  const args = [
    "--model",
    resourcePath(voiceResources(voice)[0]),
    "--output_file",
    output,
    "--length_scale",
    (1 / speed).toFixed(3),
    "--noise_scale",
    settings.noiseScale.toFixed(3),
    "--noise_w",
    settings.noiseW.toFixed(3),
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
}

async function runSynthesis(input: SpeakInput): Promise<SpeechResult> {
  const text = cleanText(input.text);
  const voice = findVoice(input.voice ?? DEFAULT_VOICE);
  const speed = cleanSpeed(input.speed);
  const tone = isPiperTone(input.tone) ? input.tone : DEFAULT_TONE;
  ensureDirs();
  const file = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`;
  await runPiper(voice, text, speed, tone, path.join(ASSETS_DIR, file));
  return registerSpeech(file, voice.label, `Voix ${voice.label} : ${voice.credit}, ${voice.license}`, { text, voice: voice.id, speed, tone });
}

// ─── Relire avec une autre voix ──────────────────────────────────

/** Texte d'une voix déjà rangée : gardé avec elle, sinon reconstitué depuis ses mots ou son nom. */
export function speechTextOf(asset: Pick<ClipAsset, "originalName" | "words" | "speech">): string {
  if (asset.speech?.text) return asset.speech.text;
  if (asset.words?.length) return asset.words.map((word) => word.text).join(" ");
  return asset.originalName.replace(/^Voix [^:]{1,60}:\s*/, "").trim();
}

/**
 * Relit une voix de la timeline avec une autre voix. Le texte vient de la
 * fiche du son d'origine (référence « module:clip-studio/assets/… ») ; à
 * défaut, de celui envoyé par l'éditeur.
 */
export function respeak(input: { ref?: string; text?: string; voice: string; speed?: number; tone?: string }): Promise<SpeechResult & { text: string }> {
  const file = /^module:clip-studio\/assets\/([a-z0-9][a-z0-9._-]{0,120})$/i.exec(String(input.ref ?? ""))?.[1];
  const asset = file ? readAssets().find((entry) => entry.file === file) : undefined;
  const text = (asset ? speechTextOf(asset) : "") || String(input.text ?? "").trim();
  if (!text) return Promise.reject(new Error("Texte d'origine introuvable pour cette voix."));
  const speed = input.speed ?? asset?.speech?.speed;
  return synthesize({ text, voice: input.voice, speed, tone: input.tone ?? asset?.speech?.tone }).then((result) => ({ ...result, text }));
}

// ─── Extraits d'écoute ───────────────────────────────────────────

export const SAMPLES_DIR = path.join(DATA_DIR, "voice-samples");

/** Phrase d'exemple dans la langue de la voix ; le français par défaut. */
const SAMPLE_SENTENCES: Record<string, string> = {
  fr: "Bonjour ! Voici ma voix pour raconter vos vidéos. Qu'en pensez-vous ?",
  en: "Hello! This is my voice, ready to tell your video's story. What do you think?",
  es: "¡Hola! Esta es mi voz para contar tus vídeos. ¿Qué te parece?",
  de: "Hallo! So klingt meine Stimme in deinen Videos. Wie gefällt sie dir?",
  it: "Ciao! Questa è la mia voce per raccontare i tuoi video. Che ne pensi?",
  pt: "Olá! Esta é a minha voz para narrar os seus vídeos. O que acha?",
  nl: "Hallo! Dit is mijn stem voor jouw video's. Wat vind je ervan?",
  pl: "Cześć! Tak brzmi mój głos w twoich filmach. Jak ci się podoba?",
  ja: "こんにちは。これがあなたの動画のための私の声です。いかがですか？",
  zh: "你好！这是我为你的视频配音的声音。你觉得怎么样？",
  ko: "안녕하세요! 여러분의 영상을 위한 제 목소리입니다. 어떠세요?",
  ar: "مرحبا! هذا صوتي لرواية مقاطع الفيديو الخاصة بك. ما رأيك؟",
  ru: "Привет! Так звучит мой голос в ваших видео. Как вам?",
};

export function sampleSentence(locale?: string): string {
  const language = String(locale ?? "fr").slice(0, 2).toLowerCase();
  return SAMPLE_SENTENCES[language] ?? SAMPLE_SENTENCES.en;
}

/** Nom du fichier d'un extrait : une empreinte de la voix, des réglages et de la phrase. */
export function sampleFileName(voice: string, speed: number, tone: string | undefined, text: string, extension: "mp3" | "wav"): string {
  const key = JSON.stringify({ voice, speed: Number(speed.toFixed(2)), tone: tone ?? "", text });
  return `sample-${createHash("sha256").update(key).digest("hex").slice(0, 32)}.${extension}`;
}

export function sampleUrl(file: string): string {
  return `/api/modules/clip-studio/data/voice-samples/${file}`;
}

const pendingSamples = new Map<string, Promise<{ url: string; cached: boolean }>>();

/**
 * Extrait d'écoute d'une voix : synthétisé une seule fois, puis gardé dans
 * les données du module. Les voix en ligne gardent le son tel qu'il arrive
 * (MP3 ou WAV), que le navigateur lit directement.
 */
export function voiceSample(input: { voice: string; speed?: number; tone?: string; locale?: string }): Promise<{ url: string; cached: boolean }> {
  const voiceId = String(input.voice ?? "");
  const cloud = parseCloudVoice(voiceId);
  if (!cloud && !VOICES.some((voice) => voice.id === voiceId)) return Promise.reject(new Error("Voix inconnue."));
  if (cloud && !isCloudVoiceUsable(voiceId)) return Promise.reject(new Error("Cette source de voix n'est pas configurée."));
  // Débit arrondi au pas de 0,05 : quelques extraits par voix, pas un par centième (cache et appels en ligne bornés).
  const speed = cleanSpeed(Math.round(cleanSpeed(input.speed) * 20) / 20);
  const tone = cloud ? undefined : isPiperTone(input.tone) ? input.tone : DEFAULT_TONE;
  // Langue : celle de la voix (« fr-FR-DeniseNeural »), sinon celle donnée par l'interface.
  const locale = cloud ? /^([a-z]{2,3})-/.exec(cloud.voice)?.[1] ?? input.locale : "fr";
  const text = sampleSentence(locale);

  // Fichier déjà là : quelle que soit son extension.
  for (const extension of ["mp3", "wav"] as const) {
    const file = sampleFileName(voiceId, speed, tone, text, extension);
    if (fs.existsSync(path.join(SAMPLES_DIR, file))) return Promise.resolve({ url: sampleUrl(file), cached: true });
  }
  const key = sampleFileName(voiceId, speed, tone, text, "wav");
  const running = pendingSamples.get(key);
  if (running) return running;

  const task = (async () => {
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
    if (cloud) {
      const { audio, extension } = await synthesizeCloud(voiceId, text, speed);
      const file = sampleFileName(voiceId, speed, tone, text, extension);
      fs.writeFileSync(path.join(SAMPLES_DIR, file), audio);
      return { url: sampleUrl(file), cached: false };
    }
    const file = key;
    const temporary = path.join(SAMPLES_DIR, `${file}.${process.pid}.tmp.wav`);
    await inPiperQueue(() => runPiper(findVoice(voiceId), text, speed, tone ?? DEFAULT_TONE, temporary));
    fs.renameSync(temporary, path.join(SAMPLES_DIR, file));
    return { url: sampleUrl(file), cached: false };
  })().finally(() => pendingSamples.delete(key));
  pendingSamples.set(key, task);
  return task;
}
