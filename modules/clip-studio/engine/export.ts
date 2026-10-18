/**
 * Export MP4 dans le navigateur.
 *
 * Chaque image est dessinée par `drawFrame` (la même fonction que l'aperçu)
 * sur un canevas hors écran, puis encodée en H.264 par WebCodecs via
 * Mediabunny. Les vidéos sources sont décodées image par image, à l'instant
 * exact demandé, et non lues en temps réel : l'export est fidèle à l'image
 * près, même sur une machine lente. Le son est mixé hors temps réel par un
 * `OfflineAudioContext`, avec les mêmes volumes et fondus que l'aperçu.
 *
 * Rien n'est calculé sur le serveur : il ne reçoit que le fichier final.
 */

import {
  ALL_FORMATS,
  AudioBufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  canEncodeAudio,
  canEncodeVideo,
  type WrappedCanvas,
} from "mediabunny";
import { isAudible, voiceWindows } from "./mix";
import { applyGainEnvelope } from "./preview";
import { drawFrame } from "./render";
import { isActive, projectDuration, sourceTimeAt, speedOf, transitionAt } from "./timeline";
import { hasAudio, type ClipProject, type VideoItem, type VisualItem } from "./types";

export interface ExportProgress {
  phase: "prepare" | "audio" | "video" | "finalize";
  /** 0 à 1. */
  ratio: number;
  frame?: number;
  totalFrames?: number;
}

export interface ExportResult {
  blob: Blob;
  durationMs: number;
}

const AUDIO_SAMPLE_RATE = 48_000;

export async function canExportInBrowser(): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") {
    return "Ce navigateur ne sait pas encoder de vidéo (WebCodecs absent). Utilisez Chrome, Edge ou un Firefox récent.";
  }
  if (!(await canEncodeVideo("avc"))) {
    return "Ce navigateur ne sait pas encoder en H.264.";
  }
  return null;
}

export async function exportProject(
  project: ClipProject,
  options: {
    onProgress?: (progress: ExportProgress) => void;
    signal?: AbortSignal;
    /** Ramène le niveau moyen du mixage vers −16 dB, sans saturer. */
    normalize?: boolean;
  } = {}
): Promise<ExportResult> {
  const { onProgress, signal, normalize = true } = options;
  const fps = project.fps;
  const totalFrames = projectDuration(project);
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Export annulé", "AbortError");
  };

  onProgress?.({ phase: "prepare", ratio: 0 });

  // ─── Images ────────────────────────────────────────────────────
  const images = new Map<string, ImageBitmap>();
  const imageUrls = new Set<string>();
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.type === "image") imageUrls.add(item.source.url);
    }
  }
  await Promise.all(
    [...imageUrls].map(async (url) => {
      const blob = await (await fetch(url)).blob();
      images.set(url, await createImageBitmap(blob));
    })
  );
  throwIfAborted();

  // ─── Son ───────────────────────────────────────────────────────
  onProgress?.({ phase: "audio", ratio: 0 });
  const mixed = await mixAudio(project, totalFrames);
  if (mixed && normalize) normalizeLoudness(mixed);
  throwIfAborted();

  // ─── Sortie ────────────────────────────────────────────────────
  const canvas = new OffscreenCanvas(project.width, project.height);
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (mixed && (await canEncodeAudio("aac"))) {
    audioSource = new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH });
    output.addAudioTrack(audioSource);
  }

  await output.start();

  // ─── Vidéos sources : une lecture séquentielle par élément ─────
  const decoders = new Map<string, VideoDecoderState>();
  const frameFor = async (item: VideoItem, frame: number): Promise<CanvasImageSource | null> => {
    let state = decoders.get(item.id);
    if (!state) {
      state = await openVideo(item, project);
      decoders.set(item.id, state);
    }
    return state.next(frame);
  };

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted();

      // On récupère d'abord les images des vidéos actives, puis on dessine.
      const videoFrames = new Map<string, CanvasImageSource | null>();
      for (const track of project.tracks) {
        if (track.kind !== "visual" || track.hidden) continue;
        for (const item of track.items) {
          if (item.type === "video" && isActive(item, frame)) {
            videoFrames.set(item.id, await frameFor(item, frame));
          }
          // Vidéo qui s'en va pendant une transition : son décodeur, arrivé
          // au bout, rend sa dernière image.
          if (item.type !== "audio" && isActive(item, frame)) {
            const from = transitionAt(track.items as VisualItem[], item, frame)?.from;
            if (from?.type === "video") videoFrames.set(from.id, await frameFor(from, frame));
          }
        }
      }

      drawFrame(ctx, project, frame, (item) =>
        item.type === "image"
          ? images.get(item.source.url) ?? null
          : videoFrames.get(item.id) ?? null
      );
      await videoSource.add(frame / fps, 1 / fps);

      if (frame % 5 === 0) {
        onProgress?.({
          phase: "video",
          ratio: frame / totalFrames,
          frame,
          totalFrames,
        });
      }
    }

    if (audioSource && mixed) await audioSource.add(mixed);

    onProgress?.({ phase: "finalize", ratio: 1 });
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    for (const bitmap of images.values()) bitmap.close();
    for (const state of decoders.values()) await state.close();
  }

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("L'export n'a produit aucun fichier.");
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    durationMs: (totalFrames / fps) * 1000,
  };
}

// ─── Décodage des vidéos sources ─────────────────────────────────

interface VideoDecoderState {
  next(frame: number): Promise<CanvasImageSource | null>;
  close(): Promise<void>;
}

async function openVideo(item: VideoItem, project: ClipProject): Promise<VideoDecoderState> {
  const url = new URL(item.source.url, window.location.href);
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) {
    return { next: async () => null, close: async () => input.dispose() };
  }
  const sink = new CanvasSink(track, { poolSize: 3 });

  // Les instants demandés sont croissants : Mediabunny décode chaque paquet
  // au plus une fois.
  const first = item.start;
  const last = item.start + item.duration;
  function* timestamps() {
    for (let frame = first; frame < last; frame++) {
      yield Math.max(0, sourceTimeAt(item, frame, project.fps));
    }
  }
  const iterator = sink.canvasesAtTimestamps(timestamps());
  let lastCanvas: WrappedCanvas | null = null;

  return {
    async next() {
      const result = await iterator.next();
      if (!result.done && result.value) lastCanvas = result.value;
      // Au-delà de la fin de la source, on garde la dernière image.
      return lastCanvas?.canvas ?? null;
    },
    async close() {
      await iterator.return(undefined);
      input.dispose();
    },
  };
}

// ─── Normalisation du volume ─────────────────────────────────────

/**
 * Intensité visée : −14 LUFS, celle que les plateformes de vidéos courtes
 * appliquent à la lecture. Un clip plus fort serait baissé par elles, un clip
 * plus faible paraîtrait éteint à côté des autres.
 */
export const TARGET_LUFS = -14;
/** Crête maximale après correction : −1 dB, pour ne jamais saturer. */
const PEAK_CEILING = Math.pow(10, -1 / 20);
const MAX_GAIN = 8;

/** Filtre biquadratique (forme directe I), qui rend une copie filtrée. */
function biquad(input: Float32Array, b: [number, number, number], a: [number, number]): Float32Array {
  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < input.length; index++) {
    const x = input[index];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    output[index] = y;
  }
  return output;
}

/**
 * Pondération K de l'ITU-R BS.1770 : un plateau qui relève les aigus comme
 * l'oreille, puis un passe-haut qui ignore les très basses fréquences. Les
 * coefficients sont calculés pour la fréquence d'échantillonnage réelle.
 */
function kWeighted(data: Float32Array, sampleRate: number): Float32Array {
  // Plateau : +4 dB au-dessus d'environ 1,7 kHz.
  const shelfQ = 0.7071752369554196;
  const shelfK = Math.tan((Math.PI * Math.min(1681.974450955533, sampleRate * 0.49)) / sampleRate);
  const vh = Math.pow(10, 3.999843853973347 / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const shelf0 = 1 + shelfK / shelfQ + shelfK * shelfK;
  const shelved = biquad(
    data,
    [
      (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / shelf0,
      (2 * (shelfK * shelfK - vh)) / shelf0,
      (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / shelf0,
    ],
    [(2 * (shelfK * shelfK - 1)) / shelf0, (1 - shelfK / shelfQ + shelfK * shelfK) / shelf0]
  );
  // Passe-haut à 38 Hz.
  const passQ = 0.5003270373238773;
  const passK = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const pass0 = 1 + passK / passQ + passK * passK;
  return biquad(shelved, [1, -2, 1], [(2 * (passK * passK - 1)) / pass0, (1 - passK / passQ + passK * passK) / pass0]);
}

/**
 * Intensité intégrée en LUFS (ITU-R BS.1770-4, EBU R128) : pondération K,
 * blocs de 400 ms qui se chevauchent aux trois quarts, porte absolue à
 * −70 LUFS puis porte relative 10 LU sous la moyenne. Les silences et les
 * passages très faibles ne tirent donc pas la mesure vers le bas. Rend
 * `-Infinity` pour un son muet.
 */
export function integratedLoudness(buffer: AudioBuffer): number {
  const weighted = Array.from({ length: buffer.numberOfChannels }, (_, index) => kWeighted(buffer.getChannelData(index), buffer.sampleRate));
  const blockSize = Math.max(1, Math.round(buffer.sampleRate * 0.4));
  const hop = Math.max(1, Math.round(buffer.sampleRate * 0.1));
  const loudnessOf = (power: number) => -0.691 + 10 * Math.log10(power);

  const powers: number[] = [];
  const lastStart = Math.max(0, buffer.length - blockSize);
  for (let start = 0; start <= lastStart; start += hop) {
    const end = Math.min(buffer.length, start + blockSize);
    let power = 0;
    // Gauche et droite pèsent 1 chacune : on additionne les puissances des canaux.
    for (const data of weighted) {
      let sum = 0;
      for (let index = start; index < end; index++) sum += data[index] * data[index];
      power += sum / (end - start);
    }
    powers.push(power);
  }

  const audible = powers.filter((power) => power > 0 && loudnessOf(power) > -70);
  if (audible.length === 0) return -Infinity;
  const mean = audible.reduce((sum, power) => sum + power, 0) / audible.length;
  const threshold = loudnessOf(mean) - 10;
  const gated = audible.filter((power) => loudnessOf(power) > threshold);
  return loudnessOf(gated.reduce((sum, power) => sum + power, 0) / gated.length);
}

/**
 * Corrige le volume de tout le mixage d'un seul gain : l'intensité intégrée
 * va vers −14 LUFS, mais la crête la plus forte ne dépasse jamais −1 dB. Un
 * gain unique garde les nuances du montage, là où une compression les
 * écraserait.
 */
export function normalizeLoudness(buffer: AudioBuffer): number {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  let peak = 0;
  for (const data of channels) {
    for (let index = 0; index < data.length; index++) {
      const magnitude = Math.abs(data[index]);
      if (magnitude > peak) peak = magnitude;
    }
  }
  const loudness = integratedLoudness(buffer);
  if (!Number.isFinite(loudness) || peak === 0) return 1;
  const gain = Math.min(Math.pow(10, (TARGET_LUFS - loudness) / 20), PEAK_CEILING / peak, MAX_GAIN);
  // Un gain insignifiant est sauté, sauf s'il évite une saturation.
  if (Math.abs(gain - 1) < 0.01 && peak <= PEAK_CEILING) return 1;
  for (const data of channels) {
    for (let index = 0; index < data.length; index++) data[index] *= gain;
  }
  return gain;
}

// ─── Mixage audio hors temps réel ────────────────────────────────

async function mixAudio(project: ClipProject, totalFrames: number): Promise<AudioBuffer | null> {
  const fps = project.fps;
  // Une vidéo coupée, sans son ou au son détaché ne joue rien (`isAudible`) ;
  // le son détaché passe par son élément audio lié.
  const sounding = project.tracks.flatMap((track) =>
    track.muted || (track.kind === "visual" && track.hidden) ? [] : track.items.filter(hasAudio).filter(isAudible)
  );
  if (sounding.length === 0) return null;

  const length = Math.ceil((totalFrames / fps) * AUDIO_SAMPLE_RATE);
  const offline = new OfflineAudioContext(2, length, AUDIO_SAMPLE_RATE);

  const decoded = new Map<string, AudioBuffer | null>();
  for (const item of sounding) {
    if (decoded.has(item.source.url)) continue;
    try {
      const data = await (await fetch(item.source.url)).arrayBuffer();
      decoded.set(item.source.url, await offline.decodeAudioData(data));
    } catch {
      // Vidéo sans piste son, ou format non décodable : on l'ignore.
      decoded.set(item.source.url, null);
    }
  }

  let scheduled = 0;
  // Fenêtres de voix off, sous lesquelles une musique marquée `duck` s'efface (`mix.ts`).
  const voices = voiceWindows(project);
  for (const item of sounding) {
    const buffer = decoded.get(item.source.url);
    if (!buffer) continue;
    const offset = item.trimStart / fps;
    if (offset >= buffer.duration) continue;
    // Vidéo, ou son détaché d'une vidéo accélérée : la source se lit à sa vitesse.
    const rate = speedOf(item);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = offline.createGain();
    const when = item.start / fps;
    applyGainEnvelope(gain.gain, item, when, fps, voices);
    source.connect(gain).connect(offline.destination);
    source.start(when, offset, (item.duration / fps) * rate);
    scheduled++;
  }
  if (scheduled === 0) return null;
  return offline.startRendering();
}
