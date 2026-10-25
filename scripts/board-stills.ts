/**
 * Banc de rendu des planches d'illustrations (dossier 01, illustrations,
 * étape I1) : compile la planche d'essai, la dessine avec le vrai moteur
 * (`drawFrame`) sur `@napi-rs/canvas`, écrit une planche d'images
 * horodatées, et mesure le placement des textes dans leurs cartes et leurs
 * pavés (écart au-dessus contre écart en dessous des lettres, en pixels).
 *
 * Usage : bun scripts/board-stills.ts --fonts <dossier des .ttf> --out <dossier> [--step 0.5]
 * Les polices nommées par la planche (Poppins) doivent être dans le dossier :
 * sans elles, les mesures ne vaudraient rien.
 */

import { mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createCanvas, GlobalFonts, type Canvas } from "@napi-rs/canvas";
import { boardTracks, compileBoard } from "@/modules/clip-studio/engine/board";
import { createProject } from "@/modules/clip-studio/engine/edit";
import { keyedFrame } from "@/modules/clip-studio/engine/keys";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import type { ClipItem, ClipProject, MediaSource, ShapeItem, TextItem } from "@/modules/clip-studio/engine/types";
import { SAMPLE_FPS, SAMPLE_WORDS, sampleBoards } from "../tests/modules/clip-studio-board-sample";

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const fontsDir = option("fonts");
const outDir = option("out");
const step = Number(option("step", "0.5"));
if (!fontsDir || !outDir) {
  console.error("Usage : bun scripts/board-stills.ts --fonts <dossier> --out <dossier> [--step 0.5]");
  process.exit(1);
}
for (const file of readdirSync(fontsDir)) if (/\.(ttf|otf)$/i.test(file)) GlobalFonts.registerFromPath(join(fontsDir, file));
mkdirSync(outDir, { recursive: true });

// Trois « logos » d'essai, dessinés ici : un disque, un losange, un anneau.
const logoCanvases: Canvas[] = ["#e4572e", "#2f74f5", "#17a398"].map((color, index) => {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  if (index === 0) ctx.arc(128, 128, 104, 0, Math.PI * 2);
  else if (index === 1) {
    ctx.moveTo(128, 16);
    ctx.lineTo(240, 128);
    ctx.lineTo(128, 240);
    ctx.lineTo(16, 128);
    ctx.closePath();
  } else {
    ctx.arc(128, 128, 104, 0, Math.PI * 2);
    ctx.arc(128, 128, 56, 0, Math.PI * 2, true);
  }
  ctx.fill();
  return canvas;
});
const logos: MediaSource[] = logoCanvases.map((_, index) => ({ url: `/api/bench/logo-${index}.png`, ref: `bench:${index}`, name: `Logo ${index + 1}`, kind: "image", width: 256, height: 256 }));

// Projet : les planches en haut, une caméra simulée en bas (un aplat sombre).
const base = createProject("Banc de planche", "9:16");
const fps = SAMPLE_FPS;
const boards = sampleBoards(logos);
const compiled = boards.map((spec) => compileBoard(spec, { fps, frame: { width: base.width, height: base.height }, words: SAMPLE_WORDS }));
const total = Math.max(...boards.map((spec) => spec.end));
const camera: ShapeItem = {
  id: "cam",
  type: "shape",
  shape: "rect",
  start: 0,
  duration: total,
  fill: "#3b4049",
  radius: 0,
  transform: { x: 0.5, y: 0.8, width: 1, height: 0.4, rotation: 0, opacity: 1 },
  animIn: { kind: "none", frames: 1 },
  animOut: { kind: "none", frames: 1 },
  label: "Caméra simulée",
};
const boardItems: ClipItem[] = compiled.flatMap((board) => board.items);
const project: ClipProject = {
  ...base,
  fps,
  tracks: [...boardTracks(compiled), { id: "t-cam", kind: "visual", name: "Caméra", items: [camera] }],
};
console.log(`pistes : ${project.tracks.length}, éléments : ${boardItems.length}, durée : ${(total / fps).toFixed(1)} s`);
const issues = compiled.flatMap((board, index) => board.issues.map((issue) => `planche ${index + 1} : ${issue}`));
console.log(issues.length ? `défauts de placement :\n${issues.join("\n")}` : "défauts de placement : aucun");

const resolve = (item: { source: MediaSource }) => {
  const index = logos.findIndex((logo) => logo.ref === item.source.ref);
  return index >= 0 ? (logoCanvases[index] as unknown as CanvasImageSource) : null;
};

function render(frame: number) {
  const canvas = createCanvas(project.width, project.height);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx as unknown as CanvasRenderingContext2D, project, frame, resolve as never);
  return canvas;
}

// ─── Planche d'images ────────────────────────────────────────────

const times: number[] = [];
for (let t = 0; t < total / fps; t += step) times.push(Number(t.toFixed(3)));
const columns = 6;
const thumbWidth = 270;
const thumbHeight = 480;
const rows = Math.ceil(times.length / columns);
const sheet = createCanvas(columns * (thumbWidth + 6), rows * (thumbHeight + 6));
const sheetCtx = sheet.getContext("2d");
sheetCtx.fillStyle = "#000";
sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
times.forEach((time, index) => {
  const frame = render(Math.round(time * fps));
  const x = (index % columns) * (thumbWidth + 6);
  const y = Math.floor(index / columns) * (thumbHeight + 6);
  sheetCtx.drawImage(frame, x, y, thumbWidth, thumbHeight);
  sheetCtx.fillStyle = "rgba(0,0,0,0.7)";
  sheetCtx.fillRect(x, y, 64, 22);
  sheetCtx.fillStyle = "#ffe14d";
  sheetCtx.font = "16px Poppins";
  sheetCtx.fillText(`${time.toFixed(1)} s`, x + 6, y + 16);
});
writeFileSync(join(outDir, "contact.png"), sheet.toBuffer("image/png"));

// Images pleine taille aux instants demandés (`--full 1.2,8.5`).
for (const value of (option("full", "") ?? "").split(",").filter(Boolean)) {
  writeFileSync(join(outDir, `frame-${value}s.png`), render(Math.round(Number(value) * fps)).toBuffer("image/png"));
}

// ─── Mesures ─────────────────────────────────────────────────────

/**
 * Lignes de pixels qui portent de l'encre dans un rectangle : un pixel est
 * de l'encre quand il s'écarte du fond (le pixel au coin intérieur) de plus
 * de `threshold` sur une composante.
 */
function inkRows(data: Uint8ClampedArray, width: number, rect: { x: number; y: number; w: number; h: number }, ground: [number, number, number], threshold = 60) {
  let top = -1;
  let bottom = -1;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const offset = (y * width + x) * 4;
      const distance = Math.max(Math.abs(data[offset] - ground[0]), Math.abs(data[offset + 1] - ground[1]), Math.abs(data[offset + 2] - ground[2]));
      if (distance > threshold) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { top, bottom };
}

const report: string[] = [];
const restFrame = (item: ClipItem) => item.start + item.duration - Math.round(0.4 * fps);
for (const track of project.tracks) {
  for (const item of track.items) {
    if (item.type !== "shape" || item.label !== "Planche – carte") continue;
    const frame = restFrame(item);
    const canvas = render(frame);
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    // Cadre de la carte à l'image mesurée (après son entrée), pas sa position de départ.
    const t = keyedFrame(item, frame).transform;
    const inset = 6;
    const rect = {
      x: Math.round((t.x - t.width / 2) * project.width) + inset,
      y: Math.round((t.y - t.height / 2) * project.height) + inset,
      w: Math.round(t.width * project.width) - inset * 2,
      h: Math.round(t.height * project.height) - inset * 2,
    };
    // Fond de la carte : au bord gauche intérieur, à mi-hauteur (un coin arrondi est hors de la carte).
    const probe = ((rect.y + Math.round(rect.h / 2)) * canvas.width + rect.x + 6) * 4;
    const ground: [number, number, number] = [data[probe], data[probe + 1], data[probe + 2]];
    const texts = project.tracks.flatMap((entry) => entry.items).filter((other): other is TextItem => other.type === "text" && Math.abs(keyedFrame(other, frame).transform.y - t.y) < 0.002 && other.start <= frame && frame < other.start + other.duration);
    // Une carte à repère se mesure sur le repère (des chiffres : hauteur de capitale, ni accent ni jambage) ;
    // sinon sur tout le texte, accents et jambages compris (l'écart dit alors aussi leur part).
    const indexed = texts.find((text) => /^\d+$/.test(text.text));
    const measured = indexed
      ? { ...rect, x: Math.round((keyedFrame(indexed, frame).transform.x - indexed.transform.width / 2) * project.width), w: Math.round(indexed.transform.width * project.width) }
      : rect;
    const ink = inkRows(data, canvas.width, measured, ground);
    const above = ink.top - (rect.y - inset);
    const below = rect.y - inset + rect.h + inset * 2 - 1 - ink.bottom;
    report.push(`carte « ${texts.map((text) => text.text).join(" ")} » (${indexed ? "repère" : "texte entier"}) à ${(frame / fps).toFixed(2)} s : ${above} px au-dessus, ${below} px en dessous (écart ${Math.abs(above - below)} px)`);
  }
}
// Étalonnage : le centrage se fait sur la hauteur des capitales (un « HHHH » tombe au pixel près sur le
// centre). Les chiffres de Poppins dépassent les capitales de 3 px environ à ce corps : sur un repère en
// chiffres, un écart de 3 à 5 px vient de la police, pas du centrage.
report.push("étalonnage : capitales centrées au pixel près ; un repère en chiffres garde 3 à 5 px d'écart, celui des chiffres de la police.");
writeFileSync(join(outDir, "mesures.txt"), `${report.join("\n")}\n`);
console.log(report.join("\n"));
console.log(`écrit : ${join(outDir, "contact.png")}`);
