/**
 * Génération de poses de la mascotte (dossier 07 sexies, D2).
 *
 * La marque demande à AI Image Gen une pose par couple émotion / geste, avec
 * sa fiche de modèle jointe et son identité (`mascot.identityPrompt`), sur
 * un fond vert uni. Chaque rendu est détouré puis gardé de côté
 * (`kits/<id>/pending/`) : il n'entre dans la marque que si l'utilisateur
 * l'accepte. Rien n'est ajouté en silence.
 */

import fs from "fs";
import path from "path";
import { newItemId } from "../defaults";
import { POSE_EMOTION_LABELS, POSE_GESTURE_LABELS, sanitizePoseTags } from "../mascot";
import { KIT_LIMITS, POSE_EMOTIONS, type BrandKit, type PoseEmotion, type PoseFacing, type PoseFraming, type PoseGesture, type PoseTags } from "../types";
import { cutOutImage } from "./cutout-image";
import { chooseModel, generateImage } from "./image-gen";
import { addImageToKit, requireKit } from "./kits";
import { dataRoot, isFileName, kitArea, kitDir, readJson, writeJson } from "./store";

export type PoseCandidateState = "pending" | "running" | "ready" | "error" | "accepted" | "rejected";

export interface PoseCandidate {
  id: string;
  tags: PoseTags;
  state: PoseCandidateState;
  /** Rendu détouré, dans `kits/<kitId>/pending/`. */
  file?: string;
  width?: number;
  height?: number;
  /** Le fond n'a pas été reconnu (ni vert ni transparent) : l'image n'est pas détourée. */
  notCutOut?: boolean;
  prompt?: string;
  imageJobId?: string;
  error?: string;
}

export interface PoseJob {
  id: string;
  kitId: string;
  status: "running" | "done" | "error" | "canceled";
  candidates: PoseCandidate[];
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

const controllers = new Map<string, AbortController>();
const jobsFile = () => path.join(/* turbopackIgnore: true */ dataRoot(), "pose-jobs.json");
const pendingDir = (kitId: string) => path.join(kitDir(kitId), "pending");

function readJobs(): PoseJob[] {
  return readJson<PoseJob[]>(jobsFile()) ?? [];
}

function save(job: PoseJob) {
  writeJson(jobsFile(), [job, ...readJobs().filter((entry) => entry.id !== job.id)].slice(0, 30));
}

/** Un travail « en cours » sans contrôleur a été interrompu par un redémarrage. */
function settle(job: PoseJob): PoseJob {
  if (job.status !== "running" || controllers.has(job.id)) return job;
  return {
    ...job,
    status: "error",
    error: "Interrompu par un redémarrage du serveur",
    candidates: job.candidates.map((candidate) => (candidate.state === "pending" || candidate.state === "running" ? { ...candidate, state: "error", error: "Interrompue" } : candidate)),
  };
}

/**
 * Travaux d'une marque à montrer : en cours, ou avec des poses encore à
 * accepter ou rejeter. Ceux dont tout est réglé disparaissent.
 */
export function listPoseJobs(kitId: unknown): PoseJob[] {
  const kit = requireKit(kitId);
  return readJobs()
    .filter((job) => job.kitId === kit.id)
    .map(settle)
    .filter((job) => job.status === "running" || job.candidates.some((candidate) => candidate.state === "ready" || (candidate.state === "error" && Date.now() - (job.finishedAt ?? job.createdAt) < 3_600_000)));
}

export function cancelPoseJob(jobId: unknown) {
  controllers.get(String(jobId))?.abort();
}

// ─── Consigne ────────────────────────────────────────────────────

/** Le geste, en anglais pour le moteur d'image. */
const GESTURE_PROMPTS: Record<PoseGesture, string> = {
  pointing: "pointing with her index finger, arm fully extended",
  leaning: "leaning forward on her forearms, as if resting on a table edge",
  "arms-raised": "both arms thrown up high in celebration, hands open",
  "hands-on-cheeks": "both palms pressed on her cheeks",
  "thumbs-up": "one arm stretched forward giving a big thumbs-up, the other hand relaxed",
  "chin-in-hand": "one arm folded across her waist supporting the other elbow, that hand holding her chin",
  waving: "one hand raised at shoulder height, waving hello",
  "showing-object": "holding up a small simple object toward the viewer to show it",
  presenting: "one arm extended to the side with the palm open and up, presenting something next to her like a show host",
  shrugging: "shrugging, both forearms raised to the sides with palms turned up",
  "arms-crossed": "arms crossed tightly over her chest",
  "hands-on-hips": "standing tall with both fists on her hips",
  facepalm: "one hand covering the upper half of her face (facepalm), shoulders slumped",
  "finger-on-lips": "index finger raised to her lips in a 'shh, secret' gesture",
  recoiling: "leaning back and stepping back in alarm, both hands raised in front of her chest, palms out",
  idle: "relaxed natural stance, no particular gesture",
};

/** L'expression, en anglais pour le moteur d'image. */
const EMOTION_PROMPTS: Record<PoseEmotion, string> = {
  joy: "big happy open smile, eyes bright",
  excitement: "ecstatic wide-open grin, eyes sparkling",
  surprise: "wide round eyes, small round open mouth, eyebrows raised high",
  shock: "shocked: tiny pupils, eyes wide, mouth open in a gasp, a sweat drop",
  thinking: "thoughtful, eyes looking up and to the side, lips pursed",
  doubt: "skeptical: one eyebrow raised, half-closed eyes, crooked unimpressed mouth",
  disappointment: "disappointed, flat frown, a sigh",
  sadness: "sad: teary eyes, eyebrows tilted up, small trembling frown",
  anger: "annoyed angry pout, frowning eyebrows, cheeks puffed",
  mischief: "mischievous: one eye winking, sly grin",
  pride: "proud, smug confident smile, eyes half-closed with satisfaction",
  neutral: "calm friendly soft smile",
};

const FRAMING_PROMPTS: Record<PoseFraming, string> = {
  full: "full body, head to shoes fully visible, small margin around the character",
  bust: "bust shot from the waist up, hands visible in frame",
  face: "close-up of the head and shoulders",
};

const FACING_PROMPTS: Record<PoseFacing, string> = {
  front: "The character faces the viewer.",
  left: "The character's body, gaze and gesture are all turned toward the LEFT side of the image.",
  right: "The character's body, gaze and gesture are all turned toward the RIGHT side of the image.",
};

/** Consigne d'une pose : identité du personnage, pose, cadrage, fond vert uni. */
export function posePrompt(kit: BrandKit, tags: PoseTags): string {
  const identity = kit.mascot?.identityPrompt.trim();
  return [
    "The attached images are the model sheet of an ORIGINAL mascot character. Draw this SAME character, matching the sheet exactly (face, hair, outfit, accessories, shoes, colours).",
    identity ? `Character: ${identity}` : "",
    `Pose and gesture: ${GESTURE_PROMPTS[tags.gesture]}.`,
    `Facial expression: ${EMOTION_PROMPTS[tags.emotion]}.`,
    `Framing: ${FRAMING_PROMPTS[tags.framing]}.`,
    FACING_PROMPTS[tags.facing],
    "Same line art and colouring style as the model sheet.",
    "Background: one perfectly flat, solid, pure chroma-key green (#00FF00) over the whole canvas. No gradient, no floor, no cast shadow, no glow or halo, no props unless the gesture needs one, no text, no logo, no watermark.",
    "Anatomy: each visible hand has exactly five fingers.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Fiches de modèle jointes : les plus lisibles d'abord (une planche très étirée en dernier), trois au plus. */
function sheetPaths(kit: BrandKit): string[] {
  const sheets = (kit.mascot?.sheetAssetIds ?? []).map((id) => kit.assets.find((asset) => asset.id === id && asset.kind === "mascot-sheet")).filter((asset) => asset !== undefined);
  const stretch = (asset: { width: number; height: number }) => Math.max(asset.width, asset.height) / Math.max(1, Math.min(asset.width, asset.height));
  return [...sheets]
    .sort((a, b) => Number(stretch(a) > 2.2) - Number(stretch(b) > 2.2))
    .slice(0, 3)
    .map((asset) => path.join(kitArea(kit.id, "assets"), asset.file))
    .filter((file) => fs.existsSync(file));
}

// ─── Lancement ───────────────────────────────────────────────────

/** Demandes reçues du navigateur : étiquettes contrôlées, sans doublon, bornées. */
export function sanitizePoseRequests(input: unknown): PoseTags[] {
  const fallback: PoseTags = { emotion: "neutral", gesture: "idle", framing: "full", facing: "front" };
  const seen = new Set<string>();
  const out: PoseTags[] = [];
  for (const entry of Array.isArray(input) ? input : []) {
    if (!entry || typeof entry !== "object" || !POSE_EMOTIONS.includes((entry as { emotion?: PoseEmotion }).emotion as PoseEmotion)) continue;
    const tags = sanitizePoseTags(entry, fallback);
    const key = `${tags.emotion}/${tags.gesture}/${tags.framing}/${tags.facing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tags);
    if (out.length >= KIT_LIMITS.poseRequests) break;
  }
  return out;
}

export async function startPoseGeneration(kitId: unknown, requests: unknown): Promise<PoseJob> {
  const kit = requireKit(kitId);
  if (!kit.mascot || (!kit.mascot.identityPrompt.trim() && kit.mascot.sheetAssetIds.length === 0)) {
    throw new Error("Décrivez d’abord la mascotte (identité) ou ajoutez sa feuille de modèle : la génération en a besoin.");
  }
  const tags = sanitizePoseRequests(requests);
  if (tags.length === 0) throw new Error("Choisissez au moins une pose à générer.");
  const room = KIT_LIMITS.poses - kit.mascot.poseAssetIds.length;
  if (room <= 0) throw new Error(`La mascotte a déjà ${KIT_LIMITS.poses} poses : retirez-en avant d’en générer.`);
  if (readJobs().some((job) => job.kitId === kit.id && settle(job).status === "running")) throw new Error("Une génération de poses est déjà en cours pour cette marque.");
  // Lève une erreur lisible si aucun moteur d'image n'est prêt.
  const model = await chooseModel();

  const job: PoseJob = {
    id: newItemId("job"),
    kitId: kit.id,
    status: "running",
    candidates: tags.slice(0, room).map((entry, index) => ({ id: `pose-${index + 1}`, tags: entry, state: "pending" })),
    createdAt: Date.now(),
  };
  save(job);
  const controller = new AbortController();
  controllers.set(job.id, controller);
  void run(job, model, controller.signal).finally(() => controllers.delete(job.id));
  return job;
}

async function run(job: PoseJob, model: string, signal: AbortSignal) {
  const update = (id: string, patch: Partial<PoseCandidate>) => {
    job.candidates = job.candidates.map((candidate) => (candidate.id === id ? { ...candidate, ...patch } : candidate));
    save(job);
  };
  try {
    for (const candidate of job.candidates) {
      if (signal.aborted) throw new DOMException("Annulé", "AbortError");
      // La fiche est relue à chaque pose : l'identité a pu être retouchée entre-temps.
      const kit = requireKit(job.kitId);
      const prompt = posePrompt(kit, candidate.tags);
      update(candidate.id, { state: "running", prompt });
      try {
        const image = await generateImage({ prompt, size: candidate.tags.framing === "full" ? "1024x1536" : "1024x1024", references: sheetPaths(kit).map((file) => ({ file, role: "subject" as const })), model }, signal, (imageJobId) =>
          update(candidate.id, { imageJobId })
        );
        const cut = await cutOutImage(fs.readFileSync(image.path));
        const file = `${job.id}-${candidate.id}.png`;
        fs.mkdirSync(pendingDir(job.kitId), { recursive: true });
        fs.writeFileSync(path.join(pendingDir(job.kitId), file), cut.buffer);
        update(candidate.id, { state: "ready", file, width: cut.width, height: cut.height, notCutOut: cut.method === "none" || undefined, imageJobId: image.jobId });
      } catch (error) {
        if (signal.aborted) throw error;
        update(candidate.id, { state: "error", error: (error as Error)?.message || "La génération a échoué." });
      }
    }
    job.status = "done";
  } catch (error) {
    const aborted = signal.aborted || (error as Error)?.name === "AbortError";
    job.status = aborted ? "canceled" : "error";
    job.error = aborted ? "Annulée" : (error as Error)?.message || "Échec de la génération";
    job.candidates = job.candidates.map((candidate) => (candidate.state === "pending" || candidate.state === "running" ? { ...candidate, state: "error", error: aborted ? "Annulée" : "Interrompue" } : candidate));
  }
  job.finishedAt = Date.now();
  save(job);
}

// ─── Accepter, rejeter ───────────────────────────────────────────

function findCandidate(kitId: string, jobId: unknown, candidateId: unknown) {
  const job = readJobs().find((entry) => entry.id === jobId && entry.kitId === kitId);
  const candidate = job?.candidates.find((entry) => entry.id === candidateId);
  if (!job || !candidate) throw new Error("Pose générée introuvable.");
  if (candidate.state !== "ready" || !candidate.file || !isFileName(candidate.file)) throw new Error("Cette pose n’attend plus de décision.");
  return { job, candidate, file: path.join(pendingDir(kitId), candidate.file) };
}

function resolve(job: PoseJob, candidateId: string, state: "accepted" | "rejected", file: string) {
  fs.rmSync(file, { force: true });
  save({ ...job, candidates: job.candidates.map((entry) => (entry.id === candidateId ? { ...entry, state, file: undefined } : entry)) });
}

/** Libellé d'une pose générée : « Joie · pouce levé ». */
export function poseLabel(tags: PoseTags): string {
  return `${POSE_EMOTION_LABELS[tags.emotion]} · ${POSE_GESTURE_LABELS[tags.gesture].toLocaleLowerCase("fr")}`;
}

/** La pose entre dans la marque, avec ses étiquettes (retouchées au besoin). */
export async function acceptPoseCandidate(kitId: unknown, jobId: unknown, candidateId: unknown, tags?: unknown): Promise<BrandKit> {
  const kit = requireKit(kitId);
  const { job, candidate, file } = findCandidate(kit.id, jobId, candidateId);
  if (!fs.existsSync(file)) throw new Error("Le fichier de cette pose a disparu.");
  const pose = sanitizePoseTags(tags, candidate.tags);
  const { kit: next } = await addImageToKit(kit.id, fs.readFileSync(file), "mascot-pose", poseLabel(pose), {
    pose,
    generated: { prompt: candidate.prompt ?? "", jobId: candidate.imageJobId, slot: "mascot-pose" },
  });
  resolve(job, candidate.id, "accepted", file);
  return next;
}

export function rejectPoseCandidate(kitId: unknown, jobId: unknown, candidateId: unknown): { success: boolean } {
  const kit = requireKit(kitId);
  const { job, candidate, file } = findCandidate(kit.id, jobId, candidateId);
  resolve(job, candidate.id, "rejected", file);
  return { success: true };
}
