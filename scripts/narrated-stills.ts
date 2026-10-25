/**
 * Banc de rendu des vidéos de l'assistant montées en tableaux (dossier 01,
 * illustrations) : un vrai projet de l'assistant (ses voix, leurs mots
 * horodatés, ses illustrations) remonté par `buildNarratedProject`, avec la
 * vraie fiche de la marque, puis dessiné par le vrai moteur (`drawFrame`) sur
 * `@napi-rs/canvas`. Le plan des tableaux vient de Codex (`--ask`, réponse
 * gardée dans `answer.json`) ou d'une réponse déjà gardée (`--plan`). Les
 * logos sont simulés (un rond et le nom). Écrit une planche d'images
 * horodatées et la liste des défauts de placement relevés par le compilateur.
 *
 * Usage : bun scripts/narrated-stills.ts --project <projet.json> --media <dossier des images>
 *   --fonts <dossier des .ttf> --out <dossier> [--kit <dossier de la marque>] [--ask | --plan <answer.json>]
 *   [--step 0.5] [--full 1.2,8]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import { toBrandTheme } from "@/modules/brand-kit/lib/theme";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { drawFrame } from "@/modules/clip-studio/engine/render";
import { buildNarratedProject, narrationWords } from "@/modules/clip-studio/engine/narrated-board";
import { beatPlanPrompt, beatSpans, FULL_ILLUSTRATION_MIN_MS, planSignature, readBeatPlan } from "@/modules/clip-studio/engine/take-plan";
import { planBoards, takeGeometry } from "@/modules/clip-studio/engine/take-templates";
import { projectDuration } from "@/modules/clip-studio/engine/timeline";
import type { ClipProject, MediaSource } from "@/modules/clip-studio/engine/types";
import { askCodex, extractJson } from "@/modules/clip-studio/lib/codex";

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const projectFile = option("project");
const mediaDir = option("media");
const fontsDir = option("fonts");
const outDir = option("out");
const kitDir = option("kit");
const step = Number(option("step", "0.5"));
if (!projectFile || !mediaDir || !fontsDir || !outDir) {
  console.error("Usage : bun scripts/narrated-stills.ts --project <projet.json> --media <dossier> --fonts <dossier> --out <dossier> [--kit <dossier>] [--ask | --plan <answer.json>]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(fontsDir)) if (/\.(ttf|otf)$/i.test(file)) GlobalFonts.registerFromPath(join(fontsDir, file));

// La marque : sa fiche, ses polices sous leur nom de famille, ses images.
const kit = kitDir ? (JSON.parse(readFileSync(join(kitDir, "brand.json"), "utf-8")) as BrandKit) : null;
if (kit && kitDir) for (const font of kit.fonts) GlobalFonts.registerFromPath(join(kitDir, "fonts", font.file), font.family);
const theme = kit ? toBrandTheme(kit) : null;

// Le projet de l'assistant ramené à ce que donne le modèle monté nu : ses voix et ses illustrations.
const stored = JSON.parse(readFileSync(projectFile, "utf-8")) as ClipProject;
const base: ClipProject = {
  ...stored,
  brandKitId: undefined,
  tracks: [
    {
      id: "t-media",
      kind: "visual",
      name: "Principale",
      items: stored.tracks
        .filter((track) => track.name === "Principale")
        .flatMap((track) => track.items)
        .filter((item) => item.type === "image" || item.type === "video")
        .map((item) => ({ ...item, transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 } })),
    },
    ...stored.tracks.filter((track) => track.kind === "audio" && track.name.startsWith("Voix")),
    // La fin du modèle (la conclusion) : un aplat de repli tient sa place, comme dans le modèle monté nu.
    {
      id: "t-end",
      kind: "visual",
      name: "Principale 2",
      items: stored.tracks.filter((track) => track.name === "Principale").flatMap((track) => track.items).filter((item) => item.type === "shape"),
    },
  ],
};
const words = narrationWords(base);
const fps = base.fps;
const durationMs = Math.round((projectDuration(base) / fps) * 1000);
console.log(`voix : ${words.length} mots, ${(durationMs / 1000).toFixed(1)} s`);

const answerFile = join(outDir, "answer.json");
let raw: unknown;
if (args.includes("--ask")) {
  const notes = stored.brief?.visualNotes ?? [];
  const script = stored.brief?.script ?? [];
  const prompt = beatPlanPrompt({
    words,
    durationMs,
    language: "fr",
    mascot: Boolean(theme?.mascot),
    narration: {
      title: stored.brief?.title ?? stored.name,
      segments: script.map((text, line) => ({ text, shows: notes.filter((note) => note.line === line && note.kind === "show").map((note) => note.text).join(" ") })),
      notes: notes.filter((note) => note.kind === "board").map((note) => note.text),
    },
  });
  writeFileSync(join(outDir, "prompt.txt"), prompt);
  console.log("Codex compose les tableaux…");
  const answer = await askCodex(prompt, { origin: { module: "clip-studio", feature: "Tableaux" } });
  raw = extractJson(answer);
  writeFileSync(answerFile, JSON.stringify(raw, null, 2));
} else {
  raw = JSON.parse(readFileSync(option("plan", answerFile)!, "utf-8"));
}
const plan = readBeatPlan(raw, words, durationMs, stored.brief?.title ?? stored.name, { fullMinMs: FULL_ILLUSTRATION_MIN_MS });
console.log(`tableaux : ${plan.beats.length} : ${planSignature(plan)}`);
for (const beat of plan.beats) console.log(`  #${beat.word} « ${words[beat.word]?.text} » ${beat.layout}${beat.arrangement ? ":" + beat.arrangement : ""} ${[beat.heading?.text, ...(beat.items ?? []).map((item) => `${item.kind}(${item.text})`)].filter(Boolean).join(" · ")}`);

// Logos simulés : un rond de couleur, le nom dessiné dessus.
const logos = new Map<string, MediaSource>();
const logoImages = new Map<string, ReturnType<typeof createCanvas>>();
plan.beats.forEach((beat, sceneIndex) =>
  (beat.items ?? []).forEach((item, itemIndex) => {
    if (item.kind !== "logo") return;
    const ref = `bench:logo-${sceneIndex}-${itemIndex}`;
    logos.set(`${sceneIndex}:${itemIndex}`, { url: `/bench/${ref}.png`, ref, name: item.text, kind: "image", width: 256, height: 256 });
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = ["#e4572e", "#2f74f5", "#17a398", "#7b4fd6"][itemIndex % 4];
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px Poppins";
    ctx.textAlign = "center";
    ctx.fillText(item.text.slice(0, 10), 128, 142);
    logoImages.set(ref, canvas);
  })
);

const project = buildNarratedProject({ base, plan, words, logos, theme });
const total = projectDuration(project);
console.log(`pistes : ${project.tracks.map((track) => `${track.name} (${track.items.length})`).join(", ")}`);

// Défauts relevés par le compilateur, tableau par tableau.
const geometry = takeGeometry(base.aspect);
const spans = beatSpans(plan, words, projectDuration(base), fps);
const boards = planBoards({ spans, plan, words, fps, frame: { width: base.width, height: base.height }, geometry, logos, theme });
const issues = boards.flatMap((board, index) => board.issues.map((issue) => `tableau ${index + 1} : ${issue}`));
console.log(issues.length ? `défauts de placement :\n${issues.join("\n")}` : "défauts de placement : aucun");

// Images : celles de la vidéo et celles de la marque, chargées une fois.
const images = new Map<string, Image>();
const fileOf = (ref: string) => {
  const name = basename(ref);
  const candidates = [join(mediaDir, name), ...(kitDir ? [join(kitDir, "assets", name)] : [])];
  return candidates.find((file) => existsSync(file));
};
for (const track of project.tracks) {
  for (const item of track.items) {
    if (item.type !== "image" || images.has(item.source.ref)) continue;
    const file = fileOf(item.source.ref);
    if (file) images.set(item.source.ref, await loadImage(file));
  }
}
const resolve = (item: { type: string; source: MediaSource }) => logoImages.get(item.source.ref) ?? images.get(item.source.ref) ?? null;
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
writeFileSync(join(outDir, "project.json"), JSON.stringify(project));
console.log(`écrit : ${join(outDir, "contact.png")}`);
