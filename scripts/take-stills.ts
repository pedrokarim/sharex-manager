/**
 * Banc de rendu de « Monter ma prise » (dossier 01, illustrations, étape
 * I2) : un plan de tableaux qui passe par toutes les dispositions et les
 * trois mises en page, monté par `buildTakeProject` comme le serveur le
 * ferait, puis dessiné par le vrai moteur (`drawFrame`) sur
 * `@napi-rs/canvas`. La caméra est simulée (un fond sombre et un visage
 * stylisé). Écrit une planche d'images horodatées et la liste des défauts
 * de placement relevés par le compilateur.
 *
 * Usage : bun scripts/take-stills.ts --fonts <dossier des .ttf> --out <dossier> [--step 0.5] [--full 1.2,8] [--brand sombre]
 *
 * `--brand sombre` monte le même plan avec une marque d'essai sombre (encre
 * claire, accent orangé) : la planche doit en prendre les couleurs et la
 * police, sans aucun autre style de la marque.
 */

import { mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { compileBoard } from "@/modules/clip-studio/engine/board";
import { defaultRoleStyles, type BrandTheme } from "@/modules/clip-studio/engine/brand";
import { boardPaletteOf } from "@/modules/clip-studio/engine/board-palette";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import { editDecisionList } from "@/modules/clip-studio/engine/take-cut";
import { beatSpans, readBeatPlan } from "@/modules/clip-studio/engine/take-plan";
import { sceneBoard } from "@/modules/clip-studio/engine/take-scenes";
import { buildTakeProject, takeGeometry } from "@/modules/clip-studio/engine/take-templates";
import type { MediaSource, TimedWord } from "@/modules/clip-studio/engine/types";

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const fontsDir = option("fonts");
const outDir = option("out");
const step = Number(option("step", "0.5"));
if (!fontsDir || !outDir) {
  console.error("Usage : bun scripts/take-stills.ts --fonts <dossier> --out <dossier> [--step 0.5]");
  process.exit(1);
}
for (const file of readdirSync(fontsDir)) if (/\.(ttf|otf)$/i.test(file)) GlobalFonts.registerFromPath(join(fontsDir, file), file.split("-")[0]);
mkdirSync(outDir, { recursive: true });

// Ce qui est dit : une phrase par tableau, les mots répartis régulièrement.
const SENTENCES: [number, number, string][] = [
  [0, 3.2, "Tes montages se ressemblent tous, même avec trois outils différents."],
  [3.4, 7.4, "Parce que l'assistant suit une recette : un titre, trois idées, abonne-toi."],
  [7.6, 13.6, "Moi, la première fois que j'ai vu ça, j'ai cru à un bug, alors j'ai tout repris de zéro."],
  [13.8, 19.4, "Ce qu'il faut, c'est réfléchir : une promesse, du concret, une relance, une preuve."],
  [19.6, 23.4, "Avant, trois heures de montage. Après, vingt minutes."],
  [23.6, 27.8, "Résultat : seize mille sept cent neuf vues en une semaine."],
];
const words: TimedWord[] = SENTENCES.flatMap(([from, to, sentence]) => {
  const tokens = sentence.split(" ");
  const span = ((to - from) * 1000) / tokens.length;
  return tokens.map((text, index) => ({ text, startMs: Math.round(from * 1000 + index * span), endMs: Math.round(from * 1000 + (index + 1) * span - 40) }));
});
const at = (prefix: string, after = 0) => {
  const index = words.findIndex((word, position) => position >= after && word.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "").startsWith(prefix));
  if (index < 0) throw new Error(`mot absent : ${prefix}`);
  return index;
};
const durationMs = words[words.length - 1].endMs + 300;

const raw = {
  hook: "Tes montages se ressemblent tous",
  mood: "energetic",
  emphasis: [at("ressemblent"), at("recette"), at("réfléchir"), at("vingt")],
  beats: [
    { word: 0, layout: "split", arrangement: "row", heading: { text: "Tes montages se ressemblent tous", pill: "ressemblent", underline: "tous", underlineWord: at("tous") }, items: [{ kind: "logo", text: "Outil A" }, { kind: "logo", text: "Outil B", word: at("même") }, { kind: "logo", text: "Outil C", word: at("outils"), cross: at("différents") }] },
    { word: at("parce"), layout: "split", arrangement: "list", heading: { text: "La recette" }, items: [{ kind: "card", text: "Un titre", word: at("titre"), strike: at("abonne") }, { kind: "card", text: "Trois idées", word: at("trois", at("titre")) }, { kind: "card", text: "Abonne-toi", word: at("abonne") }] },
    { word: at("moi"), layout: "full" },
    { word: at("ce", at("zéro")), layout: "board", arrangement: "hub", items: [{ kind: "card", text: "Réfléchir", word: at("réfléchir") }, { kind: "chip", text: "Promesse", word: at("promesse") }, { kind: "chip", text: "Concret", word: at("concret") }, { kind: "chip", text: "Relance", word: at("relance") }, { kind: "chip", text: "Preuve", word: at("preuve") }] },
    { word: at("avant"), layout: "split", arrangement: "versus", items: [{ kind: "card", text: "3 h de montage", word: at("avant"), cross: at("après") }, { kind: "card", text: "20 min", word: at("après") }], payoff: true },
    { word: at("résultat"), layout: "split", arrangement: "stack", items: [{ kind: "counter", text: "16 709", unit: "vues", word: at("seize") }, { kind: "chip", text: "en une semaine", word: at("semaine") }], payoff: true },
  ],
};
const plan = readBeatPlan(raw, words, durationMs);
const fps = 30;
const segments = editDecisionList([[{ startMs: 0, endMs: durationMs }]], fps, 1);

// Caméra simulée et logos d'essai.
const camera = createCanvas(1920, 1080);
{
  const ctx = camera.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 1080);
  gradient.addColorStop(0, "#5b4636");
  gradient.addColorStop(1, "#2a211b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = "#d9a98a";
  ctx.beginPath();
  ctx.ellipse(960, 470, 170, 220, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f1f22";
  ctx.fillRect(700, 760, 520, 320);
}
const logoCanvases = ["#e4572e", "#2f74f5", "#17a398"].map((color) => {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
});
const takeSource: MediaSource = { url: "/api/bench/take.mp4", ref: "bench:take", name: "Prise", kind: "video", width: 1920, height: 1080, durationMs, hasAudio: true };
const logos = new Map<string, MediaSource>();
plan.beats.forEach((beat, sceneIndex) => (beat.items ?? []).forEach((item, itemIndex) => {
  if (item.kind === "logo") logos.set(`${sceneIndex}:${itemIndex}`, { url: `/api/bench/logo-${itemIndex}.png`, ref: `bench:logo-${itemIndex}`, name: item.text, kind: "image", width: 256, height: 256 });
}));

// Marque d'essai sombre : ses styles de rôle ont des fonds et des contours, que la planche ne doit pas reprendre.
const darkBrand: BrandTheme | null = option("brand") === "sombre"
  ? {
      kitId: "kit-bench",
      name: "Banc sombre",
      palette: { background: "#15171c", ink: "#f3efe6", surface: "#252830", onSurface: "#f3efe6", accent: "#ff6a3d", onAccent: "#15171c", extras: [] },
      textStyles: Object.fromEntries(Object.entries(defaultRoleStyles()).map(([role, style]) => [role, { ...style, font: "Poppins", weight: 700 }])) as BrandTheme["textStyles"],
      fonts: [],
    }
  : null;
const project = buildTakeProject({ name: "Banc", aspect: "9:16", takes: [{ source: takeSource, focus: { x: 0.5, y: 0.42 } }], segments, words, plan, logos, theme: darkBrand });
const total = Math.max(...project.tracks.flatMap((track) => track.items.map((item) => item.start + item.duration)));
console.log(`tableaux : ${plan.beats.length}, pistes : ${project.tracks.length}, durée : ${(total / fps).toFixed(1)} s`);

// Défauts relevés par le compilateur, tableau par tableau.
const geometry = takeGeometry("9:16");
const spans = beatSpans(plan, words, total, fps);
const issues: string[] = [];
spans.forEach((span, index) => {
  const spec = sceneBoard(span, { fps, frame: { width: 1080, height: 1920 }, geometry, logos, palette: boardPaletteOf(null), index: plan.beats.indexOf(span.beat), opening: index === 0, previousLayout: index ? spans[index - 1].beat.layout : undefined });
  if (spec) for (const issue of compileBoard(spec, { fps, frame: { width: 1080, height: 1920 }, words }).issues) issues.push(`tableau ${index + 1} : ${issue}`);
});
console.log(issues.length ? `défauts de placement :\n${issues.join("\n")}` : "défauts de placement : aucun");

const resolve = (item: { type: string; source: MediaSource }) => {
  if (item.type === "video") return camera as unknown as CanvasImageSource;
  const match = /logo-(\d)/.exec(item.source.ref);
  return match ? (logoCanvases[Number(match[1])] as unknown as CanvasImageSource) : null;
};
function render(frame: number) {
  const canvas = createCanvas(project.width, project.height);
  drawFrame(canvas.getContext("2d") as unknown as CanvasRenderingContext2D, project, frame, resolve as never);
  return canvas;
}

const times: number[] = [];
for (let t = 0; t < total / fps; t += step) times.push(Number(t.toFixed(3)));
const columns = 8;
const thumbWidth = 216;
const thumbHeight = 384;
const sheet = createCanvas(columns * (thumbWidth + 6), Math.ceil(times.length / columns) * (thumbHeight + 6));
const sheetCtx = sheet.getContext("2d");
sheetCtx.fillStyle = "#000";
sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
times.forEach((time, index) => {
  const x = (index % columns) * (thumbWidth + 6);
  const y = Math.floor(index / columns) * (thumbHeight + 6);
  sheetCtx.drawImage(render(Math.round(time * fps)), x, y, thumbWidth, thumbHeight);
  sheetCtx.fillStyle = "rgba(0,0,0,0.7)";
  sheetCtx.fillRect(x, y, 58, 20);
  sheetCtx.fillStyle = "#ffe14d";
  sheetCtx.font = "14px Poppins";
  sheetCtx.fillText(`${time.toFixed(1)} s`, x + 5, y + 15);
});
writeFileSync(join(outDir, "contact.png"), sheet.toBuffer("image/png"));
for (const value of (option("full", "") ?? "").split(",").filter(Boolean)) writeFileSync(join(outDir, `frame-${value}s.png`), render(Math.round(Number(value) * fps)).toBuffer("image/png"));
console.log(`écrit : ${join(outDir, "contact.png")}`);
