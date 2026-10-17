"use client";

/**
 * Bibliothèque de poses de la mascotte (dossier 07 sexies, D2) : la grille
 * des poses avec leurs étiquettes (émotion, geste, cadrage, côté), des
 * filtres, l'ajout par import (détouré par le serveur) et la génération des
 * poses manquantes, chacune acceptée ou rejetée à la main.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, Sparkles, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api, errorMessage, pendingPoseUrl, type PoseCandidate, type PoseJob } from "../lib/client";
import {
  POSE_EMOTION_LABELS,
  POSE_FACING_LABELS,
  POSE_FRAMING_LABELS,
  POSE_GESTURE_LABELS,
  SUGGESTED_GESTURE,
  mascotPoses,
  poseCoverage,
  poseTags,
} from "../lib/mascot";
import {
  KIT_LIMITS,
  POSE_EMOTIONS,
  POSE_FACINGS,
  POSE_FRAMINGS,
  POSE_GESTURES,
  type BrandAsset,
  type BrandKit,
  type PoseEmotion,
  type PoseGesture,
  type PoseTags,
} from "../lib/types";
import { CHECKERBOARD } from "./asset-chooser";
import { AssetGallery } from "./asset-gallery";
import type { FileSectionProps } from "./sections/types";

const POLL = 3000;

/** Résumé court d'une pose : « Joie · pouce levé ». */
const tagSummary = (tags: PoseTags) => `${POSE_EMOTION_LABELS[tags.emotion]} · ${POSE_GESTURE_LABELS[tags.gesture].toLocaleLowerCase("fr")}`;
const tagDetails = (tags: PoseTags) => `${tagSummary(tags)} · ${POSE_FRAMING_LABELS[tags.framing].toLocaleLowerCase("fr")} · ${POSE_FACING_LABELS[tags.facing].toLocaleLowerCase("fr")}`;

// ─── Étiquettes ──────────────────────────────────────────────────

const FIELDS = [
  { key: "emotion", label: "Émotion", values: POSE_EMOTIONS, labels: POSE_EMOTION_LABELS },
  { key: "gesture", label: "Geste", values: POSE_GESTURES, labels: POSE_GESTURE_LABELS },
  { key: "framing", label: "Cadrage", values: POSE_FRAMINGS, labels: POSE_FRAMING_LABELS },
  { key: "facing", label: "Regarde", values: POSE_FACINGS, labels: POSE_FACING_LABELS },
] as const;

/** Les quatre listes d'une pose, en grille. */
function TagFields({ tags, onChange, idPrefix, compact = false }: { tags: PoseTags; onChange: (tags: PoseTags) => void; idPrefix: string; compact?: boolean }) {
  return (
    <div className={cn("grid min-w-0 gap-2", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
      {FIELDS.map((field) => (
        <div key={field.key} className="grid min-w-0 gap-1">
          <Label htmlFor={`${idPrefix}-${field.key}`} className={cn("text-xs text-muted-foreground", compact && "sr-only")}>
            {field.label}
          </Label>
          <Select value={tags[field.key]} onValueChange={(value) => onChange({ ...tags, [field.key]: value } as PoseTags)}>
            <SelectTrigger id={`${idPrefix}-${field.key}`} size="sm" className="w-full min-w-0" aria-label={field.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.values.map((value) => (
                <SelectItem key={value} value={value}>
                  {(field.labels as Record<string, string>)[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

/** Le résumé des étiquettes, qui ouvre leur réglage. */
function TagsButton({ tags, onChange, id }: { tags: PoseTags; onChange: (tags: PoseTags) => void; id: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${tagDetails(tags)} : modifier les étiquettes`}
          className="mt-1 flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Tags aria-hidden className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{tagSummary(tags)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)]">
        <p className="mb-3 text-sm font-medium">Étiquettes de la pose</p>
        <TagFields tags={tags} onChange={onChange} idPrefix={id} />
        <p className="mt-3 text-xs text-muted-foreground">Les vidéos choisissent la pose d’après l’émotion de chaque segment, puis le geste, le cadrage et le côté où se trouve le contenu.</p>
      </PopoverContent>
    </Popover>
  );
}

// ─── Travaux de génération ───────────────────────────────────────

/** Travaux de génération d'une marque : sondés tant que l'un d'eux tourne. */
function usePoseJobs(kitId: string) {
  const [jobs, setJobs] = useState<PoseJob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    let list: PoseJob[];
    try {
      list = await api.listPoseJobs(kitId);
    } catch {
      return;
    }
    setJobs(list);
    if (list.some((job) => job.status === "running")) timer.current = setTimeout(() => void poll(), POLL);
  }, [kitId]);

  useEffect(() => {
    void poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return { jobs, refresh: poll };
}

// ─── Bibliothèque ────────────────────────────────────────────────

export function PoseLibrary(props: FileSectionProps) {
  const { kit, update, runOperation } = props;
  const [emotion, setEmotion] = useState<PoseEmotion | "all">("all");
  const [gesture, setGesture] = useState<PoseGesture | "all">("all");
  const [generating, setGenerating] = useState(false);
  const { jobs, refresh } = usePoseJobs(kit.id);

  const poses = mascotPoses(kit);
  const coverage = useMemo(() => poseCoverage(kit), [kit]);
  const gestures = useMemo(() => {
    const counts = new Map<PoseGesture, number>();
    for (const pose of poses) counts.set(poseTags(pose).gesture, (counts.get(poseTags(pose).gesture) ?? 0) + 1);
    return counts;
  }, [poses]);
  const missing = POSE_EMOTIONS.filter((entry) => coverage[entry] === 0);

  const setTags = (asset: BrandAsset, tags: PoseTags) =>
    update((draft: BrandKit) => ({ ...draft, assets: draft.assets.map((entry) => (entry.id === asset.id ? { ...entry, pose: tags } : entry)) }));

  const filter = (asset: BrandAsset) => {
    const tags = poseTags(asset);
    return (emotion === "all" || tags.emotion === emotion) && (gesture === "all" || tags.gesture === gesture);
  };

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {poses.length === 0 ? "Aucune pose." : `${poses.length} pose${poses.length > 1 ? "s" : ""}`}
          {poses.length > 0 && missing.length > 0 && ` · ${missing.length} émotion${missing.length > 1 ? "s" : ""} sans pose`}
        </p>
        <Select value={gesture} onValueChange={(value) => setGesture(value as PoseGesture | "all")}>
          <SelectTrigger size="sm" className="w-44 max-w-full min-w-0" aria-label="Filtrer par geste">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les gestes</SelectItem>
            {POSE_GESTURES.filter((entry) => gestures.has(entry)).map((entry) => (
              <SelectItem key={entry} value={entry}>
                {POSE_GESTURE_LABELS[entry]} ({gestures.get(entry)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setGenerating(true)}>
          <Sparkles aria-hidden />
          Générer des poses
        </Button>
      </div>

      {/* Couverture par émotion, qui sert aussi de filtre. */}
      <div role="group" aria-label="Filtrer par émotion" className="flex min-w-0 flex-wrap gap-1.5">
        <EmotionChip label="Toutes" count={poses.length} active={emotion === "all"} onClick={() => setEmotion("all")} />
        {POSE_EMOTIONS.map((entry) => (
          <EmotionChip key={entry} label={POSE_EMOTION_LABELS[entry]} count={coverage[entry]} active={emotion === entry} onClick={() => setEmotion(emotion === entry ? "all" : entry)} />
        ))}
      </div>

      <AssetGallery
        {...props}
        kinds={["mascot-pose"]}
        addKind="mascot-pose"
        roles={["end-pose"]}
        emptyText="Aucune pose : importez-en ou générez-les d’après la feuille de modèle."
        filteredEmptyText="Aucune pose pour ce filtre."
        pickerTitle="Pose de la mascotte"
        filter={filter}
        renderExtra={(asset) => <TagsButton id={`pose-${asset.id}`} tags={poseTags(asset)} onChange={(tags) => setTags(asset, tags)} />}
      />

      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <motion.div key={job.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="min-w-0">
            <PoseJobPanel kit={kit} job={job} runOperation={runOperation} onChanged={() => void refresh()} />
          </motion.div>
        ))}
      </AnimatePresence>

      <GeneratePosesDialog
        kit={kit}
        open={generating}
        onOpenChange={setGenerating}
        missing={missing}
        onStarted={() => {
          setGenerating(false);
          void refresh();
        }}
      />
    </div>
  );
}

function EmotionChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={count === 0 ? `${label} : aucune pose` : `${label} : ${count} pose${count > 1 ? "s" : ""}`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
        !active && count === 0 && "border-dashed text-muted-foreground"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

// ─── Suivi d'une génération ──────────────────────────────────────

function PoseJobPanel({ kit, job, runOperation, onChanged }: { kit: BrandKit; job: PoseJob; runOperation: FileSectionProps["runOperation"]; onChanged: () => void }) {
  const [canceling, setCanceling] = useState(false);
  const total = job.candidates.length;
  const finished = job.candidates.filter((candidate) => candidate.state !== "pending" && candidate.state !== "running").length;
  const waiting = job.candidates.filter((candidate) => candidate.state === "ready").length;
  const visible = job.candidates.filter((candidate) => candidate.state !== "accepted" && candidate.state !== "rejected");
  const running = job.status === "running";

  const cancel = async () => {
    setCanceling(true);
    try {
      await api.cancelPoseJob(job.id);
    } catch (error) {
      toast.error(errorMessage(error, "Annulation impossible."));
    } finally {
      setCanceling(false);
      onChanged();
    }
  };

  return (
    <section aria-label="Poses générées" className="grid min-w-0 gap-3 border-t pt-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="text-sm font-medium">
            {running ? `Génération des poses : ${finished} sur ${total}` : job.status === "canceled" ? "Génération annulée" : job.status === "error" ? "Génération interrompue" : "Poses générées"}
          </p>
          <p className="text-xs text-muted-foreground">
            {running
              ? "Une à deux minutes par pose. Vous pouvez quitter la page : la génération continue."
              : waiting > 0
                ? `${waiting} pose${waiting > 1 ? "s" : ""} à accepter ou rejeter. Rien n’entre dans la marque sans votre accord.`
                : (job.error ?? "Tout est réglé.")}
          </p>
          {running && <Progress value={total ? (finished / total) * 100 : 0} className="h-1.5" aria-label="Avancement de la génération" />}
        </div>
        {running && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={canceling} onClick={() => void cancel()}>
            {canceling ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
            Arrêter
          </Button>
        )}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
        <AnimatePresence initial={false}>
          {visible.map((candidate) => (
            <motion.li key={candidate.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.16 }} className="min-w-0">
              <CandidateTile kit={kit} job={job} candidate={candidate} runOperation={runOperation} onChanged={onChanged} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function CandidateTile({
  kit,
  job,
  candidate,
  runOperation,
  onChanged,
}: {
  kit: BrandKit;
  job: PoseJob;
  candidate: PoseCandidate;
  runOperation: FileSectionProps["runOperation"];
  onChanged: () => void;
}) {
  const [tags, setTags] = useState<PoseTags>(candidate.tags);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const ready = candidate.state === "ready" && candidate.file;

  const decide = async (choice: "accept" | "reject") => {
    setBusy(choice);
    try {
      if (choice === "accept") {
        await runOperation(() => api.acceptPoseCandidate(kit.id, job.id, candidate.id, tags));
        toast.success(`« ${tagSummary(tags)} » ajoutée à la bibliothèque`);
      } else {
        await api.rejectPoseCandidate(kit.id, job.id, candidate.id);
      }
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, choice === "accept" ? "La pose n’a pas pu être ajoutée." : "La pose n’a pas pu être rejetée."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-2 rounded-xl border bg-card p-2">
      <div className="relative flex aspect-[2/3] min-w-0 items-center justify-center overflow-hidden rounded-lg bg-muted" style={ready ? { background: CHECKERBOARD } : undefined}>
        {ready ? (
          // eslint-disable-next-line @next/next/no-img-element -- pose générée, servie par le module
          <img src={pendingPoseUrl(kit.id, candidate.file!)} alt={tagSummary(tags)} className="h-full w-full object-contain p-1.5" />
        ) : candidate.state === "error" ? (
          <p className="px-2 text-center text-xs break-words text-destructive">{candidate.error ?? "Échec"}</p>
        ) : (
          <div className="flex flex-col items-center gap-2 px-2 text-center text-xs text-muted-foreground">
            {candidate.state === "running" ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <span aria-hidden className="size-5 rounded-full border-2 border-dashed" />}
            {candidate.state === "running" ? "Génération…" : "En attente"}
          </div>
        )}
      </div>
      {ready ? (
        <>
          <TagsButton id={`candidate-${job.id}-${candidate.id}`} tags={tags} onChange={setTags} />
          {candidate.notCutOut && <p className="text-[11px] text-amber-700 dark:text-amber-400">Fond non reconnu : image non détourée.</p>}
          <div className="mt-auto grid grid-cols-2 gap-1.5">
            <Button type="button" variant="outline" size="xs" className="min-w-0" disabled={busy !== null} onClick={() => void decide("reject")}>
              {busy === "reject" ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
              Rejeter
            </Button>
            <Button type="button" size="xs" className="min-w-0" disabled={busy !== null} onClick={() => void decide("accept")}>
              {busy === "accept" ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
              Accepter
            </Button>
          </div>
        </>
      ) : (
        <p className="truncate px-1 text-[11px] text-muted-foreground" title={tagDetails(candidate.tags)}>
          {tagSummary(candidate.tags)}
        </p>
      )}
    </div>
  );
}

// ─── Fenêtre « Générer des poses » ───────────────────────────────

interface Row extends PoseTags {
  key: number;
}

const rowFor = (emotion: PoseEmotion, key: number): Row => ({ key, emotion, gesture: SUGGESTED_GESTURE[emotion], framing: "full", facing: "front" });

function GeneratePosesDialog({
  kit,
  open,
  onOpenChange,
  missing,
  onStarted,
}: {
  kit: BrandKit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: PoseEmotion[];
  onStarted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {/* Le contenu est démonté à la fermeture : chaque ouverture repart des émotions sans pose. */}
        <GeneratePosesForm kit={kit} missing={missing} onCancel={() => onOpenChange(false)} onStarted={onStarted} />
      </DialogContent>
    </Dialog>
  );
}

function GeneratePosesForm({ kit, missing, onCancel, onStarted }: { kit: BrandKit; missing: PoseEmotion[]; onCancel: () => void; onStarted: () => void }) {
  const room = Math.max(0, KIT_LIMITS.poses - (kit.mascot?.poseAssetIds.length ?? 0));
  const max = Math.min(KIT_LIMITS.poseRequests, room);
  const ready = Boolean(kit.mascot && (kit.mascot.identityPrompt.trim() || kit.mascot.sheetAssetIds.length > 0));
  const nextKey = useRef(0);
  // Une ligne par émotion encore sans pose, avec son geste proposé.
  const [rows, setRows] = useState<Row[]>(() =>
    (missing.length > 0 ? missing : (["joy"] as PoseEmotion[])).slice(0, Math.max(1, max)).map((emotion, index) => rowFor(emotion, index))
  );
  const [starting, setStarting] = useState(false);
  const newKey = () => {
    nextKey.current += 1;
    return 1000 + nextKey.current;
  };

  const addMissing = () =>
    setRows((current) => {
      const present = new Set(current.map((row) => row.emotion));
      const added = missing.filter((emotion) => !present.has(emotion)).map((emotion) => rowFor(emotion, newKey()));
      return [...current, ...added].slice(0, max);
    });

  const start = async () => {
    setStarting(true);
    try {
      await api.startPoseGeneration(
        kit.id,
        rows.map((row) => ({ emotion: row.emotion, gesture: row.gesture, framing: row.framing, facing: row.facing }))
      );
      toast.success("Génération lancée : les poses arrivent sous la bibliothèque.");
      onStarted();
    } catch (error) {
      toast.error(errorMessage(error, "La génération n’a pas pu démarrer."));
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Générer des poses</DialogTitle>
        <DialogDescription>
          Chaque pose est dessinée d’après la feuille de modèle et l’identité de la mascotte, sur fond vert, puis détourée. Vous acceptez ou rejetez chaque résultat.
        </DialogDescription>
      </DialogHeader>
      {!ready ? (
        <p className="text-sm text-muted-foreground">Décrivez d’abord la mascotte (identité) ou ajoutez sa feuille de modèle : la génération en a besoin.</p>
      ) : max === 0 ? (
        <p className="text-sm text-muted-foreground">La mascotte a déjà {KIT_LIMITS.poses} poses : retirez-en avant d’en générer.</p>
      ) : (
        <div className="grid min-w-0 gap-3">
          <div className="hidden grid-cols-4 gap-2 pr-10 text-xs text-muted-foreground sm:grid">
            {FIELDS.map((field) => (
              <span key={field.key}>{field.label}</span>
            ))}
          </div>
          <ul className="grid min-w-0 gap-2">
            <AnimatePresence initial={false}>
              {rows.map((row, index) => (
                <motion.li
                  key={row.key}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex min-w-0 items-start gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <TagFields
                      compact
                      idPrefix={`generate-${row.key}`}
                      tags={row}
                      onChange={(tags) => setRows((current) => current.map((entry) => (entry.key === row.key ? { ...tags, key: entry.key } : entry)))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`Retirer la pose ${index + 1}`}
                    title="Retirer"
                    onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                  >
                    <X />
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={rows.length >= max} onClick={() => setRows((current) => [...current, rowFor("neutral", newKey())])}>
              <Plus aria-hidden />
              Ajouter une pose
            </Button>
            {missing.some((emotion) => !rows.some((row) => row.emotion === emotion)) && (
              <Button type="button" variant="ghost" size="sm" disabled={rows.length >= max} onClick={addMissing}>
                Ajouter les émotions sans pose
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {max} pose{max > 1 ? "s" : ""} au plus par génération. Comptez une à deux minutes par pose ; la génération continue si vous fermez la fenêtre.
          </p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="button" className="gap-2" disabled={!ready || rows.length === 0 || max === 0 || starting} onClick={() => void start()}>
          {starting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
          {rows.length > 1 ? `Générer ${rows.length} poses` : "Générer la pose"}
        </Button>
      </DialogFooter>
    </>
  );
}
