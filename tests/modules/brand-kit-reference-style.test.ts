import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ffmpegPath } from "@/lib/media/ffmpeg";
import {
  assembleStyle,
  changeRate,
  detectBeats,
  detectCuts,
  estimateShotMotion,
  frameDistance,
  mergeFlatShots,
  summarizeBeats,
  summarizeCaptions,
  summarizeShots,
  textBands,
  type GrayFrame,
  type TextBand,
} from "@/modules/brand-kit/lib/reference-analysis";
import { analyzeReferenceFile, applyStyleAnalysis, sniffVideo, startStyleAnalysis } from "@/modules/brand-kit/lib/server/reference-video";
import { createKit, getBrandTheme, requireKit, saveKit } from "@/modules/brand-kit/lib/server/kits";
import { setDataRoot, uploadsDir } from "@/modules/brand-kit/lib/server/store";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";
import { SHORT_SAFE_ZONE } from "@/modules/clip-studio/engine/brand";
import { contrastRatio } from "@/modules/clip-studio/engine/legibility";
import {
  MEASURED_CAPTION_SIZE,
  MEASURED_SHOT_BOUNDS,
  measuredPlan,
  readMeasuredStyle,
  type MeasuredStyle,
} from "@/modules/clip-studio/engine/measured-style";
import { beatSounds, EDIT_PACES, longestStill, readPace } from "@/modules/clip-studio/engine/rhythm";
import { buildFromTemplate, type FreeData, type VoiceClip } from "@/modules/clip-studio/engine/templates";
import type { ClipProject, ImageItem, MediaSource, TextItem } from "@/modules/clip-studio/engine/types";

// Style mesuré sur une vidéo de référence (dossier 07 sexies, D4) : l'analyse
// relève des valeurs connues sur des images, des sons et une vidéo fabriqués ;
// le moteur s'y conforme dans les bornes des règles, la lisibilité d'abord.

// ─── Fabrication ─────────────────────────────────────────────────

/** Générateur reproductible. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Image texturée douce : des taches de gris lissées, comme une photo vue de loin. */
function texture(width: number, height: number, seed: number): GrayFrame {
  const next = random(seed);
  const coarse = Array.from({ length: 12 * 20 }, () => 40 + next() * 170);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = (x / width) * 11;
      const gy = (y / height) * 19;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const at = (i: number, j: number) => coarse[j * 12 + i];
      const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      data[y * width + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return { width, height, data };
}

/** La même image agrandie de `zoom` autour de son centre (plus proche voisin suffit ici). */
function zoomed(frame: GrayFrame, zoom: number): GrayFrame {
  const { width, height } = frame;
  const data = new Uint8Array(width * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.round(cx + (x - cx) / zoom);
      const sy = Math.round(cy + (y - cy) / zoom);
      data[y * width + x] = frame.data[sy * width + sx];
    }
  }
  return { width, height, data };
}

/**
 * Sous-titre factice : `words` mots de lettres blanches en anneau, qui se
 * touchent dans un mot, le mot cerné d'un contour noir, centrés à `center` de
 * la hauteur, de `lineHeight` de haut (contour compris).
 */
function withCaption(frame: GrayFrame, center: number, lineHeight: number, words: number): GrayFrame {
  const { width, height } = frame;
  const data = new Uint8Array(frame.data);
  const h = Math.round(lineHeight * height);
  const top = Math.round(center * height - h / 2);
  const letter = Math.round(h * 0.7);
  const wordWidth = letter * 4;
  const gap = Math.round(h * 0.35);
  const total = words * wordWidth + (words - 1) * gap;
  let x = Math.round((width - total) / 2);
  for (let w = 0; w < words; w++) {
    for (let y = top; y < top + h; y++) {
      for (let xx = x; xx < x + wordWidth; xx++) {
        const local = xx - x;
        const row = y - top;
        const inner = local >= 2 && local < wordWidth - 2 && row >= 2 && row < h - 2;
        // Anneau de 2 pixels autour de chaque lettre, une barre au milieu.
        const inLetter = (local - 2) % letter;
        const ring = row < 4 || row >= h - 4 || inLetter < 2 || inLetter >= letter - 2 || Math.abs(row - h / 2) < 1;
        data[y * width + xx] = inner && ring ? 255 : 0;
      }
    }
    x += wordWidth + gap;
  }
  return { width, height, data };
}

/** Voix factice harmonique, syllabée, à attaque douce, et bruitages secs à des instants connus. */
function soundtrack(seconds: number, rate: number, hits: number[]): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  const next = random(7);
  let t = 0.2;
  while (t < seconds - 0.4) {
    const length = 0.14 + next() * 0.08;
    const f0 = 120 + next() * 60;
    const start = Math.round(t * rate);
    for (let i = 0; i < length * rate && start + i < out.length; i++) {
      const local = i / rate;
      const envelope = Math.min(1, local / 0.035) * Math.min(1, (length - local) / 0.05);
      let value = 0;
      for (let h = 1; h <= 12; h++) value += Math.sin(2 * Math.PI * f0 * h * local) / h;
      out[start + i] += value * envelope * 0.12;
    }
    t += length + 0.05 + (next() < 0.15 ? 0.4 : 0);
  }
  for (const hit of hits) {
    const start = Math.round(hit * rate);
    for (let i = 0; i < 0.12 * rate && start + i < out.length; i++) out[start + i] += (next() * 2 - 1) * Math.exp(-i / (0.02 * rate)) * 0.6;
  }
  return out;
}

// ─── Analyse ─────────────────────────────────────────────────────

describe("analyse d'une vidéo de référence", () => {
  it("trouve les coupes franches et ignore un mouvement lent", () => {
    const fps = 10;
    // Plans de 1,2 s, 0,8 s, 2 s et 1 s ; un léger mouvement entre deux images d'un même plan.
    const scores = [0, ...Array(11).fill(0.01), 0.7, ...Array(7).fill(0.02), 0.5, ...Array(19).fill(0.015), 0.9, ...Array(9).fill(0.01)];
    const cuts = detectCuts(scores, fps);
    expect(cuts).toEqual([12, 20, 40]);
    const shots = summarizeShots([1.2, 0.8, 2, 1]);
    expect(shots?.median).toBe(1.1);
    expect(shots?.longest).toBe(2);
    expect(shots?.histogram.reduce((a, b) => a + b, 0)).toBe(4);
    // Une seule coupe ne fait pas un rythme.
    expect(summarizeShots([3])).toBeUndefined();
  });

  it("compare deux images : identiques, recadrées, sans rapport", () => {
    const a = texture(54, 96, 1);
    expect(frameDistance(a, a)).toBe(0);
    expect(frameDistance(a, texture(54, 96, 2))).toBeGreaterThan(0.3);
    // Un passage au noir de moins d'une demi-seconde entre deux plans n'est pas un plan.
    const black: GrayFrame = { width: 54, height: 96, data: new Uint8Array(54 * 96) };
    const frames = [...Array(10).fill(a), black, black, ...Array(10).fill(texture(54, 96, 2))];
    expect(mergeFlatShots([10, 12], frames, 10)).toEqual([12]);
  });

  it("estime le zoom d'un plan", () => {
    const first = texture(54, 96, 3);
    const motion = estimateShotMotion(first, zoomed(first, 1.12));
    expect(motion.conclusive).toBe(true);
    expect(motion.zoom).toBeGreaterThan(1.09);
    expect(motion.zoom).toBeLessThan(1.15);
    const still = estimateShotMotion(first, first);
    expect(still.zoom).toBe(1);
  });

  it("trouve la place et la taille des sous-titres, et les distingue d'un titre fixe", () => {
    const frames: TextBand[][] = [];
    for (let i = 0; i < 24; i++) {
      const base = texture(216, 384, 10 + (i % 5));
      // Un titre fixe en haut sur toutes les images ; des sous-titres qui changent (2 ou 3 mots) à 72 %.
      const titled = withCaption(base, 0.2, 0.05, 3);
      const frame = i % 4 === 3 ? titled : withCaption(titled, 0.72, 0.055, i % 3 === 0 ? 3 : 2);
      frames.push(textBands(frame));
    }
    const captions = summarizeCaptions(frames);
    expect(captions).toBeDefined();
    expect(captions!.center).toBeGreaterThan(0.7);
    expect(captions!.center).toBeLessThan(0.74);
    // Ces lettres factices ont des barres pleines en haut et en bas, presque sans contour : la ligne
    // mesurée y est plus basse que dessinée. Sur de vraies lettres (drawtext, rendu du moteur), elle tombe juste.
    expect(captions!.lineHeight).toBeGreaterThan(0.025);
    expect(captions!.lineHeight).toBeLessThan(0.065);
    expect(captions!.words).toBe(2);
    expect(changeRate([])).toBe(0);
  });

  it("compte les bruitages, pas les syllabes de la voix", () => {
    const rate = 16000;
    const hits = [1.1, 3.4, 5.25, 7.8];
    const result = detectBeats(soundtrack(10, rate, hits), rate);
    expect(result.times).toHaveLength(hits.length);
    result.times.forEach((time, index) => expect(Math.abs(time - hits[index])).toBeLessThan(0.06));
    expect(result.voiceShare).toBeGreaterThan(0.2);
    // La voix seule : aucun bruitage.
    expect(detectBeats(soundtrack(10, rate, []), rate).times).toHaveLength(0);
    expect(summarizeBeats(result, 10)?.perMinute).toBe(24);
  });

  it("dit franchement ce qui n'a pas pu être mesuré", () => {
    const style = assembleStyle({ name: "court.mp4", durationSeconds: 8, width: 1080, height: 1920, analyzedAt: 1, silent: true });
    expect(style.shots).toBeUndefined();
    expect(style.missing?.shots).toBeTruthy();
    expect(style.missing?.beats).toMatch(/son/);
    expect(style.missing?.music).toBeTruthy();
  });

  it("reconnaît le type réel d'une vidéo", () => {
    expect(sniffVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("webm");
    expect(sniffVideo(Buffer.from("\0\0\0\x18ftypisom\0\0\0\0", "latin1"))).toBe("mp4");
    expect(sniffVideo(Buffer.from("\0\0\0\x18ftypM4A \0\0\0\0", "latin1"))).toBeNull();
    expect(sniffVideo(Buffer.from("\x89PNG\r\n\x1a\n\0\0\0\0", "latin1"))).toBeNull();
  });

  // Vidéo fabriquée par ffmpeg : seulement quand le binaire épinglé est déjà là (pas en CI).
  const ffmpeg = ffmpegPath();
  it.skipIf(!ffmpeg)("relève les plans et les bruitages d'une vidéo fabriquée par ffmpeg", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reference-video-"));
    try {
      const durations = [1.2, 0.9, 1.6, 1.1, 2.0, 1.3];
      const colors = ["0x2a6f97", "0xe76f51", "0x264653", "0xf4a261", "0x8ab17d", "0x6d597a"];
      const inputs = durations.flatMap((duration, index) => ["-f", "lavfi", "-i", `color=c=${colors[index]}:s=180x320:r=30:d=${duration}`]);
      const total = durations.reduce((a, b) => a + b, 0);
      // Une voix factice et trois bruitages secs, aux secondes 1, 3,5 et 6.
      const rate = 16000;
      const samples = soundtrack(total, rate, [1, 3.5, 6]);
      const wav = Buffer.alloc(44 + samples.length * 2);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(36 + samples.length * 2, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(rate, 24);
      wav.writeUInt32LE(rate * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(samples.length * 2, 40);
      samples.forEach((value, index) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2));
      const sound = path.join(dir, "sound.wav");
      fs.writeFileSync(sound, wav);
      const filter = `${durations.map((_, i) => `[${i}:v]`).join("")}concat=n=${durations.length}:v=1:a=0[v]`;
      const out = path.join(dir, "reference.mp4");
      const result = spawnSync(
        ffmpeg!,
        ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-i", sound, "-filter_complex", filter, "-map", "[v]", "-map", `${durations.length}:a`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out],
        { encoding: "utf8", timeout: 60_000 }
      );
      expect(result.status).toBe(0);
      const style = await analyzeReferenceFile(out, { name: "reference.mp4", now: 1 });
      expect(style.shots?.count).toBe(durations.length);
      expect(style.shots?.median).toBeCloseTo(1.25, 1);
      expect(style.shots?.longest).toBeCloseTo(2, 1);
      expect(style.beats?.count).toBe(3);
      // Des aplats unis : ni mouvement ni sous-titre à mesurer, et c'est dit.
      expect(style.captions).toBeUndefined();
      expect(style.missing?.captions).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

// ─── Application par le moteur ───────────────────────────────────

const REFERENCE: MeasuredStyle = {
  version: 1,
  reference: { name: "reference.mp4", durationSeconds: 21.4, width: 720, height: 1280, analyzedAt: 1 },
  shots: { count: 16, median: 1.3, q1: 1.1, q3: 1.53, longest: 2, histogram: [0, 2, 9, 4, 1, 0, 0, 0, 0], confidence: 0.95 },
  motion: { measuredShots: 16, animatedShare: 0.75, zoomShare: 0.5, panShare: 0.25, typicalZoom: 1.12, confidence: 1 },
  captions: { presence: 0.57, center: 0.719, top: 0.69, bottom: 0.747, lineHeight: 0.0573, lineHeightRange: [0.0521, 0.0573], words: 2, confidence: 0.91 },
  beats: { count: 8, perMinute: 22.4, confidence: 0.8 },
};

const image = (name: string): MediaSource => ({ url: `/test/${name}.png`, ref: `test:${name}`, name, kind: "image", width: 1600, height: 1067 });

/** Voix de synthèse factice : un mot toutes les 330 ms. */
function voice(text: string): VoiceClip {
  const words = text.split(/\s+/).map((word, index) => ({ text: word, startMs: 100 + index * 330, endMs: 100 + index * 330 + 300 }));
  const durationMs = 100 + words.length * 330 + 200;
  return { durationMs, source: { url: "/test/voix.wav", ref: "test:voix", name: "voix", kind: "audio", durationMs, words, speech: { text, voice: "test" } } };
}

const FREE: FreeData = {
  title: "Trois gestes pour un balcon",
  outro: "Lequel vas-tu tenter ?",
  voice: { intro: voice("Trois gestes pour un balcon fleuri."), outro: voice("Lequel vas-tu tenter ?") },
  scenes: [
    { heading: "Un bac profond", text: "Trente centimètres de terre suffisent aux tomates cerises et au basilic." },
    { heading: "L’arrosage du soir", text: "Arroser après le coucher du soleil limite l’évaporation de moitié." },
    { heading: "Des fleurs", text: "La lavande et la bourrache attirent les abeilles jusqu’au cinquième étage." },
  ].map((scene, index) => ({ ...scene, image: image(`balcon-${index}`), voice: voice(`${scene.heading}. ${scene.text}`) })) as FreeData["scenes"],
};

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const captionsOf = (project: ClipProject) => items(project).filter((item): item is TextItem => item.type === "text" && Boolean(item.karaoke));
const shots = (project: ClipProject) => items(project).filter((item): item is ImageItem => item.type === "image" && (item.label ?? "").startsWith("Plan "));

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-reference-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

function measuredTheme(style: MeasuredStyle | undefined, pace: "measured" | "normal" = "measured") {
  const kit = createKit({ name: "Atelier Brume" });
  const saved = saveKit({ ...kit, pace }, kit.updatedAt);
  if (style) fs.writeFileSync(path.join(root, "kits", kit.id, "brand.json"), JSON.stringify({ ...saved, measuredStyle: style }));
  return getBrandTheme(kit.id);
}

describe("style mesuré appliqué par une marque", () => {
  it("lit un style avec rigueur et le borne par les règles", () => {
    expect(readMeasuredStyle({ version: 2 })).toBeUndefined();
    expect(readMeasuredStyle({ ...REFERENCE, shots: { ...REFERENCE.shots, median: -1 } })?.shots).toBeUndefined();
    expect(readMeasuredStyle(REFERENCE)).toEqual(REFERENCE);

    const plan = measuredPlan(REFERENCE, { width: 1080, height: 1920 }, SHORT_SAFE_ZONE)!;
    expect(plan.shots).toEqual({ target: 1.3, upper: 1.53 });
    expect(plan.caption?.groupSize).toBe(2);
    expect(plan.beats?.perMinute).toBe(22.4);

    // Une référence extrême reste dans les bornes : plans, taille et place des sous-titres.
    const extreme = measuredPlan(
      { ...REFERENCE, shots: { ...REFERENCE.shots!, median: 6, q1: 5, q3: 8, longest: 9 }, captions: { ...REFERENCE.captions!, center: 0.97, top: 0.95, bottom: 0.99, lineHeight: 0.01 } },
      { width: 1080, height: 1920 },
      SHORT_SAFE_ZONE
    )!;
    expect(extreme.shots!.target).toBe(MEASURED_SHOT_BOUNDS.max);
    expect(extreme.shots!.upper).toBeLessThanOrEqual(MEASURED_SHOT_BOUNDS.upper);
    expect(extreme.caption!.size).toBe(MEASURED_CAPTION_SIZE.min);
    expect(extreme.caption!.y).toBeLessThan(SHORT_SAFE_ZONE.bottom);

    // Trop incertain : rien n'est repris ; un cadre large ne reprend pas la place des sous-titres d'un short.
    expect(measuredPlan({ ...REFERENCE, shots: { ...REFERENCE.shots!, confidence: 0.2 } }, { width: 1080, height: 1920 }, SHORT_SAFE_ZONE)?.shots).toBeUndefined();
    expect(measuredPlan(REFERENCE, { width: 1920, height: 1080 }, SHORT_SAFE_ZONE)?.caption).toBeUndefined();
    expect(EDIT_PACES).toContain("measured");
    expect(readPace("measured")).toBe("measured");
  });

  it("monte le clip dans les valeurs de la référence", () => {
    const project = buildFromTemplate("free", "Balcon", "9:16", FREE, measuredTheme(REFERENCE));
    const fps = project.fps;
    // Plans : au plus près de 1,3 s, jamais plus de 1,53 s.
    const lengths = shots(project).map((shot) => shot.duration / fps);
    expect(lengths.length).toBeGreaterThan(8);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(1.53 + 1 / fps);
    const sorted = [...lengths].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBeGreaterThanOrEqual(REFERENCE.shots!.q1);
    expect(median).toBeLessThanOrEqual(REFERENCE.shots!.q3);
    // Une part de plans fixes, comme la référence ; chaque coupe change le cadrage.
    const still = shots(project).filter((shot) => shot.motion === "none").length / shots(project).length;
    expect(still).toBeGreaterThan(0.1);
    expect(still).toBeLessThan(0.45);
    // Le critère de D3 tient toujours.
    expect(longestStill(project).frames).toBeLessThanOrEqual(2.5 * fps);
    // Sous-titres : taille de la référence, deux mots, dans la zone visible du short.
    for (const caption of captionsOf(project)) {
      expect(caption.karaoke!.groupSize).toBe(2);
      expect(caption.style.size).toBeCloseTo(0.0573 / 0.86, 3);
      expect(caption.transform.y).toBeGreaterThan(0.6);
      expect(caption.transform.y + caption.style.size * 1.15 * 0.5).toBeLessThanOrEqual(SHORT_SAFE_ZONE.bottom + 1e-9);
    }
    // Bruitages : la densité de la référence (22,4 par minute), à 1 s l'un de l'autre au moins.
    const sounds = beatSounds(project).map((sound) => sound.start / fps).sort((a, b) => a - b);
    const perMinute = (sounds.length * 60 * fps) / project.tracks.flatMap((track) => track.items).reduce((end, item) => Math.max(end, item.start + item.duration), 0);
    expect(perMinute).toBeGreaterThan(22.4 * 0.75);
    expect(perMinute).toBeLessThanOrEqual(24);
    sounds.slice(1).forEach((time, index) => expect(time - sounds[index]).toBeGreaterThanOrEqual(1 - 1e-9));
  });

  it("garde la lisibilité d'abord, quelle que soit la référence", () => {
    const style: MeasuredStyle = { ...REFERENCE, captions: { ...REFERENCE.captions!, center: 0.97, top: 0.95, bottom: 0.99, lineHeight: 0.3 } };
    const project = buildFromTemplate("free", "Balcon", "9:16", FREE, measuredTheme(style));
    for (const caption of captionsOf(project)) {
      expect(caption.style.size).toBeLessThanOrEqual(MEASURED_CAPTION_SIZE.max);
      // Le bloc entier reste au-dessus de la légende du short.
      expect(caption.transform.y).toBeLessThan(SHORT_SAFE_ZONE.bottom - caption.style.size * 0.5);
      // Contour épais de la marque, contraste d'au moins 4,5:1 entre lettres et contour.
      expect(caption.style.stroke).toBeTruthy();
      expect(contrastRatio(caption.style.color, caption.style.stroke!.color)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(caption.karaoke!.highlight, caption.style.stroke!.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sans style mesuré, « D'après la vidéo de référence » monte comme le rythme normal", () => {
    const measured = buildFromTemplate("free", "Balcon", "9:16", FREE, measuredTheme(undefined, "measured"));
    const normal = buildFromTemplate("free", "Balcon", "9:16", FREE, measuredTheme(undefined, "normal"));
    const outline = (project: ClipProject) => items(project).map((item) => [item.type, item.start, item.duration, item.label ?? "", item.type === "image" ? item.motion : ""]);
    expect(outline(measured)).toEqual(outline(normal));
  });

  it("le relevé n'entre dans la marque que par le serveur", () => {
    const kit = createKit({ name: "Atelier Brume" });
    const jobs = [{ id: "job-test1234", kitId: kit.id, status: "done", phase: "compute", progress: 1, referenceName: "reference.mp4", style: REFERENCE, createdAt: 1, finishedAt: 2 }];
    fs.writeFileSync(path.join(root, "style-jobs.json"), JSON.stringify(jobs));
    const applied = applyStyleAnalysis(kit.id, "job-test1234");
    expect(applied.pace).toBe("measured");
    expect(applied.measuredStyle).toEqual(REFERENCE);
    expect(getBrandTheme(kit.id).measuredStyle).toEqual(REFERENCE);
    // L'éditeur ne peut pas le remplacer, seulement le retirer.
    const stored = requireKit(kit.id);
    const forged = { ...stored, measuredStyle: { ...REFERENCE, shots: { ...REFERENCE.shots!, median: 0.2 } } };
    expect(sanitizeKit(forged, stored).measuredStyle?.shots?.median).toBe(1.3);
    const { measuredStyle: _removed, ...without } = stored;
    expect(sanitizeKit(without, stored).measuredStyle).toBeUndefined();
    expect(() => applyStyleAnalysis(kit.id, "job-inconnu1")).toThrow(/relancez/);
  });

  it("refuse un fichier déposé qui n'est pas une vidéo, et l'efface", () => {
    const kit = createKit({ name: "Atelier Brume" });
    fs.mkdirSync(uploadsDir(), { recursive: true });
    const file = path.join(uploadsDir(), "faux.mp4");
    fs.writeFileSync(file, Buffer.from("\x89PNG\r\n\x1a\n0000000000", "latin1"));
    expect(() => startStyleAnalysis(kit.id, { file: "faux.mp4", name: "faux.mp4" })).toThrow(/MP4, MOV ou WebM/);
    expect(fs.existsSync(file)).toBe(false);
    expect(() => startStyleAnalysis(kit.id, { file: "../brand.json" })).toThrow(/invalide/);
  });
});
