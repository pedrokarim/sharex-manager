"use client";

/**
 * Pièces de la page « Nouveau clip » : choix du modèle, du format, de la
 * marque, du montage d'une sélection, réglages gardés dans ce navigateur, et
 * suivi d'une création de l'assistant (repris par l'accueil).
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, Images, ListOrdered, PenLine, Plus, SquareSplitHorizontal, Trophy, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Orb } from "@/components/loading";
import { AssistantAvatar } from "@/components/motion/assistant-avatar";
import type { Brand } from "@/components/brand-logo";
import { isVideoFile } from "@/lib/media-kind";
import { cn } from "@/lib/utils";
import { SAMPLE_BEFORE_AFTER, SAMPLE_FREE, SAMPLE_QUIZ, SAMPLE_SLIDESHOW, SAMPLE_TOP, type TemplateId } from "../engine/templates";
import { ASPECTS, type AspectPreset, type MediaSource } from "../engine/types";
import { probeMedia, type BrandKitChoice, type VideoProviderId } from "../lib/client";
import type { AssistantJob } from "../lib/assistant";
import { IMAGE_SOURCE_MODES, type ImageSourceMode } from "../lib/image-search-types";
import { cleanSpeed, isToneId } from "../lib/voice-settings";
import { BrandKitMark } from "./inspector";

/** Banques de vidéos de l'assistant, avec leur logo officiel. */
export const VIDEO_PROVIDER_BRANDS: Record<VideoProviderId, { label: string; brand: Brand }> = {
  pixabay: { label: "Pixabay", brand: "pixabay" },
  pexels: { label: "Pexels", brand: "pexels" },
  wikimedia: { label: "Wikimedia Commons", brand: "wikimediacommons" },
};

export const TEMPLATES: { id: TemplateId; label: string; description: string; icon: typeof Plus }[] = [
  { id: "free", label: "Libre", description: "Aucune forme imposée : des séquences, titre et texte", icon: PenLine },
  { id: "quiz", label: "Quiz", description: "Questions, choix, compte à rebours, réponse révélée", icon: ListOrdered },
  { id: "top", label: "Top", description: "Un classement révélé du dernier au premier", icon: Trophy },
  { id: "slideshow", label: "Diaporama", description: "Des images légendées qui racontent une histoire", icon: Images },
  { id: "before-after", label: "Avant / Après", description: "Des paires d’images, l’une balayée par l’autre", icon: SquareSplitHorizontal },
];

/** L'assistant illustre lui-même ses clips : l'Avant / Après demande des images fournies. */
export const ASSISTANT_TEMPLATE_IDS: TemplateId[] = ["free", "quiz", "top", "slideshow"];

export const SAMPLES = {
  free: SAMPLE_FREE,
  quiz: SAMPLE_QUIZ,
  top: SAMPLE_TOP,
  slideshow: SAMPLE_SLIDESHOW,
  "before-after": SAMPLE_BEFORE_AFTER,
} as const;

/** Nom de ce que compte le réglage « Séquences », selon le modèle. */
export const COUNT_LABELS: Partial<Record<TemplateId, { label: string; many: string }>> = {
  free: { label: "Séquences", many: "séquences" },
  quiz: { label: "Questions", many: "questions" },
  top: { label: "Éléments", many: "éléments" },
  slideshow: { label: "Diapositives", many: "diapositives" },
};

/** Montage d'une sélection de la galerie. */
export type Recipe = "slideshow" | "rhythm" | "before-after";

/** Exemples de demandes, proposés sous le champ de l'assistant. */
export const BRIEF_SUGGESTIONS = [
  "L’histoire de la tour Eiffel en quelques étapes",
  "Trois astuces pour mieux dormir",
  "Un quiz sur les animaux de la savane",
  "Top 5 des planètes les plus étranges",
  "Les secrets de fabrication des sabres japonais et pourquoi ils coupent si bien",
  "Top 5 des inventions qui ont changé le monde",
];

export const IMAGE_SOURCE_LABELS: Record<ImageSourceMode, string> = {
  "find-then-generate": "Trouver, sinon créer",
  find: "Trouver seulement",
  generate: "Créer seulement",
  none: "Aucune",
};

export const IMAGE_SOURCE_HELP: Record<ImageSourceMode, string> = {
  "find-then-generate": "Une vraie image du sujet quand elle existe (banques libres, puis le web), sinon créée avec AI Image Gen.",
  find: "Seulement des images existantes ; un segment sans image trouvée garde un aplat.",
  generate: "Toutes créées avec AI Image Gen, environ une minute chacune.",
  none: "Aucune illustration : textes et aplats de couleur.",
};

const IMAGE_PREFS_KEY = "clip-studio:assistant-images";

/** Dernier choix d'illustrations, gardé dans ce navigateur. Par défaut : trouver d'abord, web compris. */
export function readImagePrefs(): { source: ImageSourceMode; web: boolean } {
  try {
    const stored = JSON.parse(localStorage.getItem(IMAGE_PREFS_KEY) ?? "null");
    if (stored && IMAGE_SOURCE_MODES.includes(stored.source)) return { source: stored.source, web: stored.web !== false };
  } catch {
    // Stockage indisponible ou valeur illisible : réglage par défaut.
  }
  return { source: "find-then-generate", web: true };
}

export function writeImagePrefs(prefs: { source: ImageSourceMode; web: boolean }) {
  try {
    localStorage.setItem(IMAGE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Rien à faire : le choix vaut pour cette visite seulement.
  }
}

const VOICE_PREFS_KEY = "clip-studio:assistant-voice";

/** Dernier débit et dernière intonation choisis pour l'assistant, gardés dans ce navigateur. */
export function readVoicePrefs(): { speed: number; tone: string } {
  try {
    const stored = JSON.parse(localStorage.getItem(VOICE_PREFS_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      return { speed: cleanSpeed(stored.speed), tone: isToneId(stored.tone) ? stored.tone : "balanced" };
    }
  } catch {
    // Stockage indisponible ou valeur illisible : réglages par défaut.
  }
  return { speed: 1, tone: "balanced" };
}

export function writeVoicePrefs(prefs: { speed: number; tone: string }) {
  try {
    localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Rien à faire : le choix vaut pour cette visite seulement.
  }
}

/** Préfixe des images venues d'une série d'AI Image Gen. */
export const GENERATED_PREFIX = "ai-image-gen:";

/**
 * Image ou vidéo de la sélection, prête à poser sur la timeline : un fichier
 * de la galerie, ou une image d'AI Image Gen (`ai-image-gen:<fichier>`).
 */
export async function gallerySource(file: string): Promise<MediaSource> {
  if (file.startsWith(GENERATED_PREFIX)) {
    const name = file.slice(GENERATED_PREFIX.length);
    const url = `/api/modules/ai-image-gen/data/images/${encodeURIComponent(name)}`;
    const probe = await probeMedia(url, "image");
    return { url, ref: `module:ai-image-gen/images/${name}`, name, kind: "image", ...probe };
  }
  const url = `/api/files/${encodeURIComponent(file)}`;
  const kind = isVideoFile(file) ? "video" : "image";
  const probe = await probeMedia(url, kind);
  return { url, ref: `upload:${file}`, name: file, kind, ...probe };
}

const chipClass = (selected: boolean) =>
  cn(
    "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
    selected ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
  );

/** Puce de choix, partagée par les réglages. */
export function ChoiceChip({ selected, onClick, children, title }: { selected: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} className={chipClass(selected)} aria-pressed={selected} title={title}>
      {children}
    </button>
  );
}

/** Image de marque du clip : couleurs, polices, filigrane et carton de fin, et pour l'assistant le ton et le style des images. */
export function BrandPicker({ kits, value, onChange }: { kits: BrandKitChoice[]; value: string | null; onChange: (value: string | null) => void }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Image de marque">
      <ChoiceChip selected={value === null} onClick={() => onChange(null)}>
        Aucune
      </ChoiceChip>
      {kits.map((kit) => (
        <ChoiceChip key={kit.id} selected={value === kit.id} onClick={() => onChange(kit.id)}>
          <BrandKitMark kit={kit} />
          <span className="min-w-0 truncate" title={kit.tagline ? `${kit.name} – ${kit.tagline}` : kit.name}>
            {kit.name}
          </span>
        </ChoiceChip>
      ))}
    </div>
  );
}

export function RecipePicker({ value, onChange, files }: { value: Recipe; onChange: (value: Recipe) => void; files: string[] }) {
  // Seules les images vont par paires ; une vidéo n'a pas de sens en avant / après.
  const count = files.filter((file) => !isVideoFile(file)).length;
  const pairs = Math.floor(count / 2);
  const options: { id: Recipe; label: string; description: string; icon: typeof Plus }[] = [
    { id: "slideshow", label: "Diaporama", description: "3 s par image, mouvement de caméra lent, fondus enchaînés", icon: Images },
    { id: "rhythm", label: "Rythmé", description: "1,2 s par image, coupes franches et zooms courts", icon: Zap },
    {
      id: "before-after",
      label: "Avant / Après",
      description:
        count < 2
          ? "Sélectionnez au moins deux images"
          : `${pairs} paire${pairs > 1 ? "s" : ""}, dans l’ordre de la sélection${count % 2 ? " ; la dernière image, seule, est écartée" : ""}`,
      icon: SquareSplitHorizontal,
    },
  ];
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
      {options.map((entry) => {
        const Icon = entry.icon;
        const selected = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            aria-pressed={selected}
            className={cn("flex min-w-0 flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{entry.label}</span>
            <span className={cn("text-xs leading-4 break-words", selected ? "text-foreground/70" : "text-muted-foreground")}>{entry.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Formes que l'assistant sait écrire : grandes cartes, une ligne d'explication. */
export function TemplatePicker({ value, onChange, only }: { value: TemplateId; onChange: (value: TemplateId) => void; only?: TemplateId[] }) {
  const templates = only ? TEMPLATES.filter((entry) => only.includes(entry.id)) : TEMPLATES;
  return (
    <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]" role="group" aria-label="Forme du clip">
      {templates.map((entry) => {
        const Icon = entry.icon;
        const selected = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            aria-pressed={selected}
            className={cn("flex min-w-0 flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{entry.label}</span>
            <span className={cn("text-xs leading-4 break-words", selected ? "text-foreground/70" : "text-muted-foreground")}>{entry.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Format du clip : un cadre dessiné à la proportion de chaque format. */
export function AspectPicker({ value, onChange }: { value: AspectPreset; onChange: (value: AspectPreset) => void }) {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(4,minmax(0,1fr))] gap-2" role="group" aria-label="Format du clip">
      {(Object.keys(ASPECTS) as AspectPreset[]).map((key) => {
        const { width, height, label } = ASPECTS[key];
        const selected = value === key;
        const scale = 34 / Math.max(width, height);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={selected}
            title={label}
            className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 pt-2.5 pb-1.5 transition-colors", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <span className="flex h-9 items-center justify-center">
              <span className={cn("rounded-[3px] border-2", selected ? "border-primary" : "border-muted-foreground/60")} style={{ width: width * scale, height: height * scale }} />
            </span>
            <span className="text-xs font-medium tabular-nums">{key}</span>
            <span className={cn("w-full truncate text-center text-[10px]", selected ? "text-foreground/70" : "text-muted-foreground")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Suivi de l'assistant ────────────────────────────────────────

export function AssistantProgress({ job, onCancel }: { job: AssistantJob; onCancel?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex min-w-0 items-start gap-3 rounded-xl bg-muted/40 p-4">
        <AssistantAvatar persona="clip" busy={job.steps.some((step) => step.state === "running")} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Demande</p>
          <p className="text-sm break-words">{job.request.brief}</p>
          {job.title && <p className="mt-2 text-lg font-semibold break-words">{job.title}</p>}
        </div>
      </div>
      <ol className="space-y-2">
        {job.steps.map((step) => (
          <motion.li key={step.id} layout className="flex min-w-0 items-start gap-3 rounded-lg border px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              {step.state === "running" && <Orb size="xs" state="composing" className="text-primary" />}
              {step.state === "done" && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                  <Check className="h-4 w-4 text-emerald-500" />
                </motion.span>
              )}
              {step.state === "error" && <X className="h-4 w-4 text-destructive" />}
              {(step.state === "pending" || step.state === "skipped") && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
            </span>
            {/* Le détail passe sous l'intitulé et se lit en entier : le bilan de la vérification des faits peut être long. */}
            <span className="min-w-0 flex-1 pt-0.5">
              <span className={cn("block text-sm", step.state === "skipped" && "text-muted-foreground line-through", step.state === "pending" && "text-muted-foreground")}>
                {step.label}
              </span>
              {step.detail && <span className="mt-0.5 block text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{step.detail}</span>}
            </span>
          </motion.li>
        ))}
      </ol>
      {job.status === "error" && <p className="rounded-lg bg-destructive/10 p-3 text-sm break-words text-destructive">{job.error}</p>}
      {job.status === "running" && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          Annuler la création
        </Button>
      )}
    </div>
  );
}
