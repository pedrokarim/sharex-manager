"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  FileVideo,
  Images,
  LayoutTemplate,
  ListOrdered,
  Loader2,
  Plus,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { appendSequence, createImageItem, createProject } from "../engine/edit";
import {
  SAMPLE_QUIZ,
  SAMPLE_SLIDESHOW,
  SAMPLE_TOP,
  buildFromTemplate,
  type TemplateId,
} from "../engine/templates";
import { ASPECTS, type AspectPreset, type Motion } from "../engine/types";
import { callModule, probeMedia } from "../lib/client";
import type { AssistantJob } from "../lib/assistant";
import { useVoices, VoiceCredit, VoicePicker } from "./voice-picker";
import { MOOD_LABELS } from "./music-panel";

type Mode = "blank" | "template" | "assistant";

const MODES: { id: Mode; label: string; icon: typeof Plus }[] = [
  { id: "assistant", label: "Assistant IA", icon: Sparkles },
  { id: "template", label: "Modèle", icon: LayoutTemplate },
  { id: "blank", label: "Vide", icon: FileVideo },
];

const TEMPLATES: { id: TemplateId; label: string; description: string; icon: typeof Plus }[] = [
  { id: "quiz", label: "Quiz", description: "Questions, choix, compte à rebours, réponse révélée", icon: ListOrdered },
  { id: "top", label: "Top", description: "Un classement révélé du dernier au premier", icon: Trophy },
  { id: "slideshow", label: "Diaporama", description: "Des images légendées qui racontent une histoire", icon: Images },
];

const IDEAS = [
  "Un quiz sur les animaux de la savane",
  "Top 5 des planètes les plus étranges",
  "Un quiz de culture générale sur la France",
  "Top 5 des inventions qui ont changé le monde",
  "Un quiz sur les records du monde animal",
];

const MOTIONS: Motion[] = ["zoom-in", "pan-right", "zoom-out", "pan-left"];

export function CreateDialog({
  request,
  onClose,
  onCreated,
  onAssistantStarted,
}: {
  /** `files` : images venues de la galerie, montées en diaporama. */
  request: { files: string[] } | null;
  onClose: () => void;
  onCreated: (projectId: string) => void;
  onAssistantStarted: () => void;
}) {
  const fromGallery = Boolean(request?.files.length);
  const [mode, setMode] = useState<Mode>("assistant");
  const [name, setName] = useState("");
  const [aspect, setAspect] = useState<AspectPreset>("9:16");
  const [template, setTemplate] = useState<TemplateId>("quiz");
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(5);
  const [withImages, setWithImages] = useState(true);
  const [withVoice, setWithVoice] = useState(true);
  const [voice, setVoice] = useState("siwis");
  const [music, setMusic] = useState<string>("auto");
  const { info: voices, prepare: prepareVoice } = useVoices();
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<AssistantJob | null>(null);

  useEffect(() => {
    if (!request) return;
    setMode(request.files.length ? "blank" : "assistant");
    setName(request.files.length ? `Diaporama du ${new Date().toLocaleDateString("fr-FR")}` : "Nouveau clip");
    setBusy(false);
    setJob(null);
  }, [request]);

  // Suivi de l'assistant tant que la fenêtre est ouverte.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = setInterval(async () => {
      const next = await callModule<AssistantJob | null>("getAssistantJob", job.id).catch(() => null);
      if (!next) return;
      setJob(next);
      if (next.status === "done" && next.projectId) onCreated(next.projectId);
    }, 1500);
    return () => clearInterval(timer);
  }, [job, onCreated]);

  const createBlankOrTemplate = async () => {
    if (!request) return;
    setBusy(true);
    try {
      const title = name.trim() || "Nouveau clip";
      let project;
      if (mode === "template") {
        const data = template === "quiz" ? SAMPLE_QUIZ : template === "top" ? SAMPLE_TOP : SAMPLE_SLIDESHOW;
        project = buildFromTemplate(template, title, aspect, data);
      } else {
        project = createProject(title, aspect);
        if (request.files.length) {
          const sources = await Promise.all(
            request.files.map(async (file) => {
              const url = `/api/files/${encodeURIComponent(file)}`;
              const probe = await probeMedia(url, "image");
              return { url, ref: `upload:${file}`, name: file, kind: "image" as const, ...probe };
            })
          );
          let start = 0;
          const items = sources.map((source, index) => {
            const item = createImageItem(source, start, project!.fps);
            item.motion = MOTIONS[index % MOTIONS.length];
            start += item.duration;
            return item;
          });
          project = appendSequence(project, items);
        }
      }
      await callModule("saveProject", project);
      onCreated(project.id);
    } catch (error: any) {
      toast.error(error?.message ?? "Création impossible");
      setBusy(false);
    }
  };

  const startAssistant = async () => {
    setBusy(true);
    try {
      const started = await callModule<AssistantJob>("startAssistant", {
        brief,
        template,
        aspect,
        count,
        images: withImages,
        voice: withVoice ? voice : undefined,
        music: music === "none" ? undefined : music,
      });
      setJob(started);
      onAssistantStarted();
    } catch (error: any) {
      toast.error(error?.message ?? "L'assistant n'a pas pu démarrer");
    } finally {
      setBusy(false);
    }
  };

  const running = job?.status === "running";

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau clip</DialogTitle>
          <DialogDescription>
            {fromGallery
              ? `${request!.files.length} image(s) de la galerie, montées en diaporama.`
              : "Laissez l'assistant monter un short, partez d'un modèle, ou commencez à vide."}
          </DialogDescription>
        </DialogHeader>

        {job ? (
          <AssistantProgress job={job} onCancel={() => void callModule("cancelAssistant", job.id)} />
        ) : (
          <div className="space-y-5">
            {!fromGallery && (
              <div className="inline-flex rounded-lg bg-muted p-1">
                {MODES.map((entry) => {
                  const Icon = entry.icon;
                  const active = entry.id === mode;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setMode(entry.id)}
                      className={cn("relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {active && <motion.span layoutId="create-mode" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <Icon className={cn("relative h-4 w-4", active && entry.id === "assistant" && "text-primary")} />
                      <span className="relative">{entry.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-5">
                {mode === "assistant" && (
                  <>
                    <div className="space-y-2">
                      <Textarea
                        value={brief}
                        onChange={(event) => setBrief(event.target.value)}
                        placeholder="Décrivez votre short : « un quiz sur les animaux de la savane, ton fun »"
                        rows={3}
                        autoFocus
                        className="resize-none text-[15px]"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {IDEAS.map((idea) => (
                          <button key={idea} type="button" onClick={() => setBrief(idea)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                            {idea}
                          </button>
                        ))}
                      </div>
                    </div>
                    <TemplatePicker value={template} onChange={setTemplate} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="flex items-center justify-between text-sm">
                          <span>{template === "quiz" ? "Questions" : template === "top" ? "Éléments" : "Diapositives"}</span>
                          <span className="font-mono text-xs tabular-nums">{count}</span>
                        </span>
                        <input type="range" min={2} max={10} value={count} onChange={(event) => setCount(Number(event.target.value))} className="w-full accent-primary" />
                      </label>
                      <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <span className="text-sm">
                          Illustrations générées
                          <span className="block text-xs text-muted-foreground">
                            Une image par segment avec AI Image Gen, environ une minute chacune.
                          </span>
                        </span>
                        <Switch checked={withImages} onCheckedChange={setWithImages} />
                      </label>
                    </div>
                    <div className="space-y-3 rounded-lg border p-3">
                      <label className="flex items-start justify-between gap-3">
                        <span className="text-sm">
                          Voix off
                          <span className="block text-xs text-muted-foreground">
                            Chaque segment est lu à voix haute ; sa durée s&apos;adapte à la lecture.
                          </span>
                        </span>
                        <Switch checked={withVoice} onCheckedChange={setWithVoice} />
                      </label>
                      <AnimatePresence initial={false}>
                        {withVoice && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
                            <VoicePicker value={voice} onChange={setVoice} voices={voices} onPrepare={prepareVoice} />
                            <VoiceCredit voice={voices?.voices.find((entry) => entry.id === voice)} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="space-y-2">
                      <span className="text-sm">Musique de fond</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[["none", "Aucune"], ["auto", "Choisie par l'IA"], ...Object.entries(MOOD_LABELS)].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMusic(key)}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition-colors",
                              music === key ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {mode === "template" && (
                  <>
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du clip" />
                    <TemplatePicker value={template} onChange={setTemplate} />
                    <p className="text-xs text-muted-foreground">
                      Le modèle est rempli avec un exemple : remplacez les textes et
                      glissez vos images sur la piste Principale.
                    </p>
                  </>
                )}

                {mode === "blank" && (
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du clip" autoFocus />
                )}
              </motion.div>
            </AnimatePresence>

            <AspectPicker value={aspect} onChange={setAspect} />
          </div>
        )}

        <DialogFooter>
          {job ? (
            <Button variant="ghost" onClick={onClose}>
              {running ? "Continuer en arrière-plan" : "Fermer"}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Annuler
              </Button>
              {mode === "assistant" ? (
                <Button onClick={startAssistant} disabled={busy || brief.trim().length < 3} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Créer avec l&apos;IA
                </Button>
              ) : (
                <Button onClick={createBlankOrTemplate} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePicker({ value, onChange }: { value: TemplateId; onChange: (value: TemplateId) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {TEMPLATES.map((entry) => {
        const Icon = entry.icon;
        const selected = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            className={cn("flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{entry.label}</span>
            <span className="text-xs leading-4 text-muted-foreground">{entry.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function AspectPicker({ value, onChange }: { value: AspectPreset; onChange: (value: AspectPreset) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(Object.keys(ASPECTS) as AspectPreset[]).map((key) => {
        const { width, height, label } = ASPECTS[key];
        const selected = value === key;
        const scale = 40 / Math.max(width, height);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn("flex flex-col items-center gap-1.5 rounded-xl border px-2 pt-3 pb-2 transition-colors", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <span className="flex h-10 items-center justify-center">
              <span className={cn("rounded-[3px] border-2", selected ? "border-primary" : "border-muted-foreground/60")} style={{ width: width * scale, height: height * scale }} />
            </span>
            <span className="text-xs font-medium">{key}</span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
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
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">Demande</p>
        <p className="text-sm">{job.request.brief}</p>
        {job.title && <p className="mt-2 text-lg font-semibold">{job.title}</p>}
      </div>
      <ol className="space-y-2">
        {job.steps.map((step) => (
          <motion.li key={step.id} layout className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              {step.state === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {step.state === "done" && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                  <Check className="h-4 w-4 text-emerald-500" />
                </motion.span>
              )}
              {step.state === "error" && <X className="h-4 w-4 text-destructive" />}
              {(step.state === "pending" || step.state === "skipped") && <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
            </span>
            <span className={cn("flex-1 text-sm", step.state === "skipped" && "text-muted-foreground line-through", step.state === "pending" && "text-muted-foreground")}>
              {step.label}
            </span>
            {step.detail && <span className="truncate text-xs text-muted-foreground">{step.detail}</span>}
          </motion.li>
        ))}
      </ol>
      {job.status === "error" && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{job.error}</p>}
      {job.status === "running" && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          Annuler la création
        </Button>
      )}
    </div>
  );
}
