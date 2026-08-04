"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  ImageDown,
  Images,
  KeyRound,
  Maximize2,
  Paperclip,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ModuleConfig } from "@/types/modules";
import { ModuleShell } from "../components/module-shell";
import { ImageViewer, type Shot } from "../components/image-viewer";
import { MODELS, aspectRatioOf, getModelSpec } from "../lib/models";
import {
  PRESETS,
  callModule,
  downloadImage,
  imageUrl,
  readFileAsBase64,
  type HistoryItem,
  type SecretStatus,
} from "../lib/client";

interface GeneratePageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

interface Reference {
  b64: string;
  mimeType: string;
  dataUrl: string;
  name: string;
  size: number;
}

const COUNT_CHOICES = [1, 2, 4] as const;

export default function GeneratePage({ settings }: GeneratePageProps) {
  // ─── Composition ────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(
    settings.default_model || "gpt-image-1"
  );
  const [size, setSize] = useState<string>(settings.default_size || "1024x1024");
  const [quality, setQuality] = useState<string>(
    settings.default_quality || "medium"
  );
  const [count, setCount] = useState<number>(settings.default_count || 1);
  const [notes, setNotes] = useState<string>(settings.notes_preprompt || "");
  const [reference, setReference] = useState<Reference | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Exécution ──────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HistoryItem | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // ─── Contexte ───────────────────────────────────────────────
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [keys, setKeys] = useState<Record<string, SecretStatus> | null>(null);

  const spec = getModelSpec(model) ?? MODELS[0];
  const ratio = aspectRatioOf(size);

  const providerReady = keys
    ? Boolean(keys[spec.provider]?.configured)
    : true; // Tant que l'état des clés n'est pas connu, on n'alarme pas.

  const refreshHistory = useCallback(() => {
    callModule<HistoryItem[]>("getHistory", 12)
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    refreshHistory();
    callModule<Record<string, SecretStatus>>("getSecretsStatus")
      .then(setKeys)
      .catch(() => setKeys(null));
  }, [refreshHistory]);

  // Chaque modèle a ses propres tailles et paliers de qualité : garder une
  // valeur devenue invalide provoquerait un rejet côté API.
  useEffect(() => {
    if (!spec.sizes.includes(size)) setSize(spec.sizes[0]);
    if (spec.qualities && !spec.qualities.some((q) => q.value === quality)) {
      setQuality(spec.qualities[0].value);
    }
  }, [spec, size, quality]);

  // Une référence chargée puis un changement de modèle qui ne la gère pas :
  // on la retire plutôt que de laisser une pièce jointe sans effet.
  useEffect(() => {
    if (reference && !spec.supportsReference) {
      setReference(null);
      toast.info(`${spec.label} ne gère pas l'image de référence, elle a été retirée.`);
    }
  }, [spec, reference]);

  const shots: Shot[] = useMemo(
    () => (result ? result.imageFiles.map((file) => ({ item: result, file })) : []),
    [result]
  );

  // ─── Actions ────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await callModule<{ historyId: string }>(
        "generateImage",
        prompt,
        {
          model,
          size,
          quality: spec.qualities ? quality : undefined,
          n: count,
          notes: notes || undefined,
          referenceImageB64: reference?.b64,
          referenceMimeType: reference?.mimeType,
        }
      );

      // On relit l'historique plutôt que de reconstruire l'objet côté client :
      // le serveur est seul à connaître les copies en galerie et la durée.
      const history = await callModule<HistoryItem[]>("getHistory", 12);
      setRecent(history);
      const fresh = history.find((h) => h.id === response.historyId);
      if (fresh) setResult(fresh);
      toast.success(
        fresh && fresh.count > 1
          ? `${fresh.count} images générées`
          : "Image générée"
      );
    } catch (err: any) {
      setError(err?.message ?? "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, model, size, quality, spec, count, notes, reference]);

  const handleReferencePick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // Permet de resélectionner le même fichier.
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Le fichier doit être une image");
        return;
      }
      try {
        const { b64, mimeType, dataUrl } = await readFileAsBase64(file);
        setReference({ b64, mimeType, dataUrl, name: file.name, size: file.size });
      } catch {
        toast.error("Lecture de l'image impossible");
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    setPrompt("");
    setError(null);
    setResult(null);
    setReference(null);
    setModel(settings.default_model || "gpt-image-1");
    setCount(settings.default_count || 1);
    setNotes(settings.notes_preprompt || "");
  }, [settings]);

  const applyPreset = useCallback((fragment: string) => {
    setPrompt((prev) => {
      if (prev.includes(fragment)) return prev;
      return prev.trim() ? `${prev.trim()}, ${fragment}` : fragment;
    });
  }, []);

  const reuse = useCallback((item: HistoryItem) => {
    setPrompt(item.prompt);
    setModel(item.model);
    setSize(item.size);
    if (item.quality) setQuality(item.quality);
    setResult(item);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const saveShotToGallery = useCallback(
    async (item: HistoryItem, file: string) => {
      try {
        const res = await callModule<{ fileName?: string }>(
          "saveToGallery",
          item.id,
          file
        );
        toast.success(`Ajoutée à la galerie : ${res?.fileName}`);
        refreshHistory();
      } catch (err: any) {
        toast.error(err?.message ?? "Copie impossible");
      }
    },
    [refreshHistory]
  );

  // ─── Rendu ──────────────────────────────────────────────────

  return (
    <ModuleShell
      current=""
      title="Studio"
      description="Décrivez une image, ajustez les réglages, générez."
      actions={
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/m/ai-image-gen/library">
            <Images className="h-4 w-4" />
            Bibliothèque
          </Link>
        </Button>
      }
    >
      {keys && !providerReady && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <KeyRound className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="min-w-0 flex-1 text-sm">
            Aucune clé{" "}
            {spec.provider === "openai" ? "OpenAI" : "Stability"} enregistrée —
            la génération échouera tant qu&apos;elle manque.
          </p>
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <Link href="/m/ai-image-gen/settings">
              Configurer
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ─── Colonne principale ─────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="space-y-3">
            <InputGroup>
              <InputGroupTextarea
                placeholder="Un phare isolé dans la brume au lever du jour, lumière rasante…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                className="min-h-[112px] text-sm"
              />
              <InputGroupAddon align="block-end" className="justify-between">
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <KbdGroup>
                    <Kbd>Ctrl</Kbd>
                    <Kbd>↵</Kbd>
                  </KbdGroup>
                  pour générer
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Réinitialiser
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim()}
                    className="gap-1.5"
                  >
                    {loading ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {loading
                      ? "Génération…"
                      : `Générer${count > 1 ? ` ×${count}` : ""}`}
                  </Button>
                </div>
              </InputGroupAddon>
            </InputGroup>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.fragment)}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-destructive">
                  La génération a échoué
                </p>
                {/* Le message vient tel quel de l'API : c'est lui qui indique
                    s'il s'agit d'un quota, d'un refus de contenu ou d'une clé. */}
                <p className="text-sm break-words text-destructive/90">{error}</p>
              </div>
            </div>
          )}

          {/* Résultats */}
          {loading ? (
            <div
              className={cn(
                "grid gap-3",
                count > 1 ? "grid-cols-2" : "grid-cols-1"
              )}
            >
              {Array.from({ length: count }).map((_, i) => (
                // La place du résultat est réservée au bon ratio dès le départ :
                // la page ne saute pas quand les images arrivent.
                <Skeleton
                  key={i}
                  className="w-full rounded-xl"
                  style={{ aspectRatio: ratio }}
                />
              ))}
            </div>
          ) : shots.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium">Résultat</h2>
                <Badge variant="secondary" className="font-normal">
                  {getModelSpec(result!.model)?.label ?? result!.model}
                </Badge>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {result!.size}
                </Badge>
                {result!.usedReference && (
                  <Badge variant="outline">avec référence</Badge>
                )}
              </div>

              <div
                className={cn(
                  "grid gap-3",
                  shots.length > 1 ? "grid-cols-2" : "grid-cols-1"
                )}
              >
                {shots.map((shot, i) => {
                  const inGallery = Boolean(result!.savedToGallery?.[shot.file]);
                  return (
                    <figure
                      key={shot.file}
                      className="group relative overflow-hidden rounded-xl border bg-muted"
                      style={{ aspectRatio: ratio }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(shot.file)}
                        alt={result!.prompt}
                        className="h-full w-full object-cover"
                      />
                      <figcaption className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <div className="pointer-events-auto flex gap-1">
                          <ShotAction
                            label="Voir en grand"
                            onClick={() => setViewerIndex(i)}
                          >
                            <Maximize2 className="h-4 w-4" />
                          </ShotAction>
                          <ShotAction
                            label="Télécharger"
                            onClick={() =>
                              downloadImage(imageUrl(shot.file), shot.file)
                            }
                          >
                            <Download className="h-4 w-4" />
                          </ShotAction>
                          <ShotAction
                            label={
                              inGallery ? "Déjà en galerie" : "Ajouter à la galerie"
                            }
                            disabled={inGallery}
                            onClick={() => saveShotToGallery(result!, shot.file)}
                          >
                            <ImageDown className="h-4 w-4" />
                          </ShotAction>
                        </div>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>
          ) : (
            <Empty className="flex-none rounded-xl border border-dashed py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Sparkles />
                </EmptyMedia>
                <EmptyTitle>Rien de généré pour l&apos;instant</EmptyTitle>
                <EmptyDescription>
                  Écrivez un prompt ci-dessus. Les réglages à droite décident du
                  modèle, du format et du nombre d&apos;images.
                </EmptyDescription>
              </EmptyHeader>
              {recent.length > 0 && (
                <EmptyContent>
                  <Button variant="outline" size="sm" asChild className="gap-2">
                    <Link href="/m/ai-image-gen/library">
                      <Images className="h-4 w-4" />
                      Voir les {recent.length} dernières générations
                    </Link>
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}

          {/* Reprise rapide */}
          {recent.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Générations récentes</h2>
                <Button variant="link" size="sm" asChild className="h-auto p-0">
                  <Link href="/m/ai-image-gen/library">Tout voir</Link>
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recent.slice(0, 10).map((item) =>
                  item.imageFiles[0] ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => reuse(item)}
                      title={item.prompt}
                      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-colors hover:border-primary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(item.imageFiles[0])}
                        alt={item.prompt}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : null
                )}
              </div>
            </section>
          )}
        </div>

        {/* ─── Réglages ───────────────────────────────────── */}
        <aside className="min-w-0">
          <div className="sticky top-4 rounded-xl border bg-card p-4">
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel>Modèle</FieldLabel>
                <div className="flex flex-col gap-2">
                  {MODELS.map((m) => (
                    <Item
                      key={m.id}
                      asChild
                      variant={model === m.id ? "muted" : "outline"}
                      size="sm"
                      className={cn(
                        "cursor-pointer",
                        model === m.id && "border-primary ring-1 ring-primary/20"
                      )}
                    >
                      <button type="button" onClick={() => setModel(m.id)} className="text-left">
                        <ItemContent>
                          <ItemTitle className="flex items-center gap-2">
                            {m.label}
                            {m.tags[0] === "Recommandé" && (
                              <Badge
                                variant="secondary"
                                className="h-4 px-1.5 text-[10px] font-normal"
                              >
                                Recommandé
                              </Badge>
                            )}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-2">
                            {m.description}
                          </ItemDescription>
                        </ItemContent>
                      </button>
                    </Item>
                  ))}
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="ai-size">Format</FieldLabel>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger id="ai-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {spec.sizes.map((s) => {
                      const r = aspectRatioOf(s);
                      const shape =
                        r > 1.05 ? "paysage" : r < 0.95 ? "portrait" : "carré";
                      return (
                        <SelectItem key={s} value={s}>
                          <span className="font-mono text-xs">{s}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {shape}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>

              {spec.qualities && (
                <Field>
                  <FieldLabel htmlFor="ai-quality">Qualité</FieldLabel>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger id="ai-quality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {spec.qualities.map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Une qualité plus haute coûte davantage par image.
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel>Nombre d&apos;images</FieldLabel>
                <ButtonGroup className="w-full">
                  {COUNT_CHOICES.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={count === value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCount(value)}
                      className="flex-1"
                    >
                      ×{value}
                    </Button>
                  ))}
                </ButtonGroup>
                {count > spec.maxBatch && (
                  // Le contournement est réel mais facturé : le dire évite la
                  // surprise sur la note OpenAI.
                  <FieldDescription>
                    {spec.label} ne rend qu&apos;une image par appel : {count}{" "}
                    appels seront facturés.
                  </FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel>Image de référence</FieldLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReferencePick}
                />
                {reference ? (
                  <Attachment>
                    <AttachmentMedia variant="image">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={reference.dataUrl} alt="" />
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{reference.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {(reference.size / 1024).toFixed(0)} Ko
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions>
                      <AttachmentAction
                        aria-label="Retirer l'image de référence"
                        onClick={() => setReference(null)}
                      >
                        <X />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!spec.supportsReference}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <Paperclip className="h-4 w-4" />
                    Choisir une image…
                  </Button>
                )}
                <FieldDescription>
                  {spec.supportsReference
                    ? "L'image sert de point de départ ; le prompt décrit la transformation."
                    : `${spec.label} génère uniquement à partir de texte.`}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="ai-notes">Notes de style</FieldLabel>
                <Textarea
                  id="ai-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="masterpiece, best quality…"
                  className="resize-none text-xs"
                />
                <FieldDescription>
                  Ajoutées devant chaque prompt de cette session.
                </FieldDescription>
              </Field>

              <Button variant="ghost" size="sm" asChild className="gap-2">
                <Link href="/m/ai-image-gen/settings">
                  <Settings2 className="h-4 w-4" />
                  Réglages par défaut
                </Link>
              </Button>
            </FieldGroup>
          </div>
        </aside>
      </div>

      <ImageViewer
        shots={shots}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onMutate={refreshHistory}
      />
    </ModuleShell>
  );
}

/** Bouton d'action en survol d'une vignette, avec libellé accessible. */
function ShotAction({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="secondary"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="h-8 w-8"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
