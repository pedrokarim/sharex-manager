"use client";

/**
 * Page « Nouveau clip » : l'espace de création, en pleine largeur.
 *
 * - À gauche, le point de départ (Assistant IA, Depuis une idée, Monter
 *   par-dessus une vidéo, Modèle, Vide, Sous-titrer un clip, Découper une
 *   vidéo, et la sélection de la galerie quand il y en a une), puis ce que le
 *   mode demande : le sujet, l'idée, la vidéo, le modèle.
 * - À droite, « Réglages » : format, marque, durée visée, découpage
 *   (« Auto » par défaut), voix, musique, illustrations ; le résumé de ce qui
 *   sera créé et « Créer », toujours visibles au pied de la colonne.
 * - Une fois lancée, la création de l'assistant se suit sur place
 *   (`?job=`), puis « Ouvrir le projet ».
 *
 * L'adresse porte le mode (`?mode=`), une idée préremplie
 * (`readCreatePrefill`) et la sélection de la galerie (`?files=`).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  ChevronDown,
  Clapperboard,
  FileVideo,
  Film,
  Images,
  LayoutTemplate,
  Lightbulb,
  Mic,
  Music,
  Plus,
  RotateCcw,
  Scissors,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BrandLogo } from "@/components/brand-logo";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { isVideoFile, mediaCountLabel } from "@/lib/media-kind";
import { cn } from "@/lib/utils";
import { createProject } from "../engine/edit";
import { buildBeforeAfter, buildFromTemplate, buildSequence, type TemplateId } from "../engine/templates";
import { applyBrandTheme, type BrandTheme } from "../engine/brand";
import type { AspectPreset, MediaSource } from "../engine/types";
import { callModule, fetchBrandTheme, getVideoSearchStatus, useBrandKits, type VideoProviderId } from "../lib/client";
import type { AssistantJob } from "../lib/assistant";
import { IMAGE_SOURCE_MODES, type ImageSourceMode } from "../lib/image-search-types";
import { MIN_TARGET_SECONDS, brandVoicePrefill, defaultTargetSeconds, maxTargetSeconds, voiceSourceOf } from "../lib/voice-settings";
import { CHOSEN_SEGMENTS, suggestedSegments } from "../lib/segment-count";
import { createHref, prefillFromIdea, readCreatePrefill, type CreatePrefill } from "../lib/idea-prefill";
import { ASSISTANT_MODES, modeHref, readFiles, readMode, type CreateMode } from "../lib/create-mode";
import type { Idea } from "../lib/idea-types";
import { ScreenHeader } from "../components/screen-header";
import { BrandKitMark } from "../components/inspector";
import { SourceVideoField } from "../components/source-video-field";
import { ClipModePanel } from "../components/clip-modes";
import { IdeaStarter } from "../components/idea-starter";
import { TemplatePreview } from "../components/template-preview";
import { MOOD_LABELS } from "../components/music-panel";
import { lastPickedVoice, SpeedControl, ToneControl, useVoices, VoiceCredit, VoicePicker } from "../components/voice-picker";
import {
  ASSISTANT_TEMPLATE_IDS,
  AspectPicker,
  AssistantProgress,
  BRIEF_SUGGESTIONS,
  BrandPicker,
  ChoiceChip,
  COUNT_LABELS,
  GENERATED_PREFIX,
  IMAGE_SOURCE_HELP,
  IMAGE_SOURCE_LABELS,
  RecipePicker,
  SAMPLES,
  TEMPLATES,
  TemplatePicker,
  VIDEO_PROVIDER_BRANDS,
  gallerySource,
  readImagePrefs,
  readVoicePrefs,
  writeImagePrefs,
  writeVoicePrefs,
  type Recipe,
} from "../components/create-options";

const HUB_HREF = "/m/clip-studio";

const MODES: { id: CreateMode; label: string; description: string; icon: LucideIcon }[] = [
  { id: "assistant", label: "Assistant IA", description: "Décrivez le sujet : l’IA écrit, illustre, lit et monte.", icon: Sparkles },
  { id: "idea", label: "Depuis une idée", description: "Lancez une phrase : des idées prêtes à créer.", icon: Lightbulb },
  { id: "overlay", label: "Monter sur une vidéo", description: "L’assistant commente une vidéo et en cite des extraits.", icon: Film },
  { id: "template", label: "Modèle", description: "Une forme toute prête, remplie d’un exemple.", icon: LayoutTemplate },
  { id: "blank", label: "Vide", description: "Une timeline vide, à monter à la main.", icon: FileVideo },
  { id: "subtitle", label: "Sous-titrer un clip", description: "Les paroles d’une vidéo en sous-titres animés.", icon: Captions },
  { id: "clipping", label: "Découper une vidéo", description: "Les passages forts d’une longue vidéo, en clips.", icon: Scissors },
];

const MUSIC_CHOICES: [string, string][] = [["none", "Aucune"], ["auto", "Choisie par l’IA"], ...Object.entries(MOOD_LABELS)];

export default function CreatePage() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const mode = readMode(params);
  const files = useMemo(() => readFiles(new URLSearchParams(query)), [query]);
  const fromGallery = files.length > 0;
  const jobId = params.get("job");

  const setMode = useCallback((next: CreateMode) => router.replace(modeHref(query, next), { scroll: false }), [router, query]);

  // ─── Réglages ─────────────────────────────────────────────────
  const [name, setName] = useState("Nouveau clip");
  const [aspect, setAspect] = useState<AspectPreset>("9:16");
  const [template, setTemplate] = useState<TemplateId>("free");
  const [recipe, setRecipe] = useState<Recipe>("slideshow");
  const [brief, setBrief] = useState("");
  // `null` : « Auto », le script découpe lui-même.
  const [count, setCount] = useState<number | null>(null);
  const [lastCount, setLastCount] = useState(5);
  const [targetChoice, setTargetChoice] = useState<number | null>(null);
  const [imageSource, setImageSource] = useState<ImageSourceMode>("find-then-generate");
  const [webSearch, setWebSearch] = useState(true);
  const [sourceVideo, setSourceVideo] = useState<MediaSource | null>(null);
  const [stockVideos, setStockVideos] = useState(true);
  const [videoProviders, setVideoProviders] = useState<VideoProviderId[]>(["wikimedia"]);
  const [withVoice, setWithVoice] = useState(true);
  const [voice, setVoice] = useState("siwis");
  const [speed, setSpeed] = useState(1);
  const [tone, setTone] = useState("balanced");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [music, setMusic] = useState("auto");
  const [ideaId, setIdeaId] = useState<string | undefined>(undefined);
  const [videoHint, setVideoHint] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { info: voices, prepare: prepareVoice } = useVoices();

  // Réglages gardés dans ce navigateur : lus après le montage.
  useEffect(() => {
    const images = readImagePrefs();
    setImageSource(images.source);
    setWebSearch(images.web);
    const prefs = readVoicePrefs();
    setSpeed(prefs.speed);
    setTone(prefs.tone);
    setVoice(lastPickedVoice() ?? "siwis");
    getVideoSearchStatus()
      .then((status) => Array.isArray(status.providers) && status.providers.length > 0 && setVideoProviders(status.providers))
      .catch(() => undefined);
  }, []);

  const chooseImageSource = (next: ImageSourceMode) => {
    setImageSource(next);
    writeImagePrefs({ source: next, web: webSearch });
  };
  const chooseWebSearch = (next: boolean) => {
    setWebSearch(next);
    writeImagePrefs({ source: imageSource, web: next });
  };
  const chooseSpeed = (next: number) => {
    setSpeed(next);
    writeVoicePrefs({ speed: next, tone });
  };
  const chooseTone = (next: string) => {
    setTone(next);
    writeVoicePrefs({ speed, tone: next });
  };

  // Une voix retenue mais plus proposée (clé retirée, source coupée) : retour à la voix locale.
  useEffect(() => {
    if (voices && !voices.voices.some((entry) => entry.id === voice)) setVoice("siwis");
  }, [voices, voice]);

  // ─── Marque ───────────────────────────────────────────────────
  const brandKits = useBrandKits();
  const defaultKitId = brandKits?.find((kit) => kit.isDefault)?.id ?? null;
  // `undefined` : pas encore choisie, la marque par défaut s'applique.
  const [brandChoice, setBrandChoice] = useState<string | null | undefined>(undefined);
  const brandKitId = brandChoice === undefined ? defaultKitId : brandChoice;
  const brandable = mode !== "blank";
  const showBrands = brandable && Boolean(brandKits?.length);
  const chosenKitId = showBrands && brandKitId && brandKits?.some((kit) => kit.id === brandKitId) ? brandKitId : null;
  const chosenKit = chosenKitId ? brandKits?.find((kit) => kit.id === chosenKitId) : undefined;
  const brandVoice = chosenKit?.voice;
  const brandVoiceKey = brandVoice ? `${chosenKitId}|${brandVoice.voice}|${brandVoice.speed}|${brandVoice.tone ?? ""}` : "";

  // Voix de la marque choisie, sinon la dernière choisie sur ce navigateur.
  useEffect(() => {
    if (!brandVoice) return;
    setVoice(brandVoice.voice);
    setSpeed(brandVoice.speed);
    setTone(brandVoice.tone ?? "balanced");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clé résume la voix de la marque
  }, [brandVoiceKey]);

  const localVoice = voiceSourceOf(voice) === "piper";
  const brandPrefill = brandVoice ? brandVoicePrefill(brandVoice, voices ? voices.voices.map((entry) => entry.id) : null) : null;
  const brandVoiceState = !brandVoice
    ? null
    : brandPrefill?.unavailable
      ? "unavailable"
      : voice === brandVoice.voice && speed === brandVoice.speed && (!localVoice || tone === (brandVoice.tone ?? "balanced"))
        ? "same"
        : "changed";
  const restoreBrandVoice = () => {
    if (!brandVoice) return;
    setVoice(brandVoice.voice);
    setSpeed(brandVoice.speed);
    setTone(brandVoice.tone ?? "balanced");
  };

  // Thème de la marque pour l'aperçu des modèles.
  const [theme, setTheme] = useState<BrandTheme | null>(null);
  useEffect(() => {
    if (mode !== "template" || !chosenKitId) {
      setTheme(null);
      return;
    }
    let alive = true;
    fetchBrandTheme(chosenKitId)
      .then((next) => alive && setTheme(next))
      .catch(() => alive && setTheme(null));
    return () => {
      alive = false;
    };
  }, [mode, chosenKitId]);

  // ─── Préremplissage (idée, galerie) ───────────────────────────
  const prefill = useMemo(() => readCreatePrefill(new URLSearchParams(query)), [query]);
  const appliedPrefill = useRef<string | null>(null);
  useEffect(() => {
    if (!prefill) return;
    const key = JSON.stringify(prefill);
    if (appliedPrefill.current === key) return;
    appliedPrefill.current = key;
    applyPrefill(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appliqué une fois par préremplissage
  }, [prefill]);

  function applyPrefill(next: CreatePrefill) {
    setBrief(next.brief);
    setTemplate(next.template);
    setCount(next.count ?? null);
    if (next.count !== undefined) setLastCount(next.count);
    setAspect(next.aspect);
    setTargetChoice(next.targetSeconds);
    if (next.brandKitId !== undefined) setBrandChoice(next.brandKitId);
    setIdeaId(next.ideaId);
    setVideoHint(next.sourceVideoHint);
  }

  useEffect(() => {
    if (!fromGallery) return;
    setName(`Diaporama du ${new Date().toLocaleDateString("fr-FR")}`);
  }, [fromGallery]);

  // L'assistant n'écrit pas d'Avant / Après : retour à « Libre ».
  const assistantMode = ASSISTANT_MODES.includes(mode);
  useEffect(() => {
    if (assistantMode && !ASSISTANT_TEMPLATE_IDS.includes(template)) setTemplate("free");
  }, [assistantMode, template]);

  const pickIdea = (idea: Idea) => router.replace(createHref(prefillFromIdea(idea)), { scroll: false });

  // ─── Durée et découpage ───────────────────────────────────────
  const maxTarget = maxTargetSeconds(aspect);
  const targetSeconds = Math.min(maxTarget, Math.max(MIN_TARGET_SECONDS, targetChoice ?? defaultTargetSeconds(template, aspect)));
  const countLabel = COUNT_LABELS[template] ?? COUNT_LABELS.free!;
  const estimate = suggestedSegments(template, targetSeconds);

  // ─── Création ─────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const clipMode = mode === "subtitle" || mode === "clipping";
  const [clipActive, setClipActive] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);

  const createBlankOrTemplate = async () => {
    setBusy(true);
    feedback.clear();
    try {
      const title = name.trim() || "Nouveau clip";
      const brandTheme = chosenKitId ? await fetchBrandTheme(chosenKitId) : null;
      let project;
      if (mode === "template") {
        project = buildFromTemplate(template, title, aspect, SAMPLES[template], brandTheme);
      } else if (mode === "gallery" && recipe === "before-after") {
        // Images prises deux par deux, dans l'ordre de la sélection.
        const sources = await Promise.all(files.filter((file) => !isVideoFile(file)).map((file) => gallerySource(file)));
        const pairs = [];
        for (let index = 0; index + 1 < sources.length; index += 2) pairs.push({ before: sources[index], after: sources[index + 1] });
        const built = buildBeforeAfter(title, aspect, { pairs });
        project = brandTheme ? applyBrandTheme(built, brandTheme) : built;
      } else if (mode === "gallery") {
        const sources = await Promise.all(files.map((file) => gallerySource(file)));
        project = buildSequence(title, aspect, sources, recipe === "rhythm" ? "rhythm" : "slideshow", brandTheme);
      } else {
        project = createProject(title, aspect);
      }
      // Origine relevée pour le filtre de la liste des projets.
      project = { ...project, origin: mode === "template" ? "template" : mode === "gallery" ? "gallery" : "blank" };
      await callModule("saveProject", project);
      router.push(`/m/clip-studio/edit?id=${encodeURIComponent(project.id)}`);
    } catch (error) {
      feedback.error(errorMessage(error, "Le projet n’a pas pu être créé. Réessayez."));
      setBusy(false);
    }
  };

  const startAssistant = async () => {
    setBusy(true);
    feedback.clear();
    try {
      const started = await callModule<AssistantJob>("startAssistant", {
        brief,
        template,
        aspect,
        // Absent : « Auto », le script choisit le nombre de segments.
        ...(count !== null ? { count } : {}),
        images: imageSource !== "none",
        imageSource,
        webSearch,
        narration: withVoice,
        voice: withVoice ? voice : undefined,
        voiceSpeed: withVoice ? speed : undefined,
        voiceTone: withVoice && localVoice ? tone : undefined,
        targetSeconds,
        music: music === "none" ? undefined : music,
        brandKitId: chosenKitId ?? undefined,
        ...(videoProviders.length > 0 && stockVideos && (imageSource === "find" || imageSource === "find-then-generate") ? { videos: true } : {}),
        ...(mode === "overlay" && sourceVideo ? { sourceVideo: { ref: sourceVideo.ref } } : {}),
        ...(ideaId ? { ideaId } : {}),
      });
      const next = new URLSearchParams(query);
      next.set("job", started.id);
      router.replace(`/m/clip-studio/new?${next.toString()}`, { scroll: false });
    } catch (error) {
      feedback.error(errorMessage(error, "L’assistant n’a pas pu démarrer. Réessayez."));
    } finally {
      setBusy(false);
    }
  };

  // ─── Résumé et bouton ─────────────────────────────────────────
  const beforeAfterShort = mode === "gallery" && recipe === "before-after" && files.filter((file) => !isVideoFile(file)).length < 2;
  const missing =
    mode === "idea"
      ? "Choisissez une idée pour préremplir l’assistant."
      : assistantMode && brief.trim().length < 3
        ? "Décrivez le sujet du clip (3 caractères au moins)."
        : mode === "overlay" && !sourceVideo
          ? "Choisissez la vidéo source."
          : beforeAfterShort
            ? "Sélectionnez au moins deux images pour un avant / après."
            : null;

  const summary = summaryLines({
    mode,
    aspect,
    template,
    count,
    estimate,
    targetSeconds,
    withVoice,
    voiceLabel: voices?.voices.find((entry) => entry.id === voice)?.label ?? voice,
    music,
    imageSource,
    kitName: chosenKit?.name ?? null,
    showBrands,
    files,
    recipe,
    sourceVideo,
  });

  if (jobId) {
    return <JobView jobId={jobId} onRestart={() => router.replace(modeHref(query, mode), { scroll: false })} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full shrink-0 flex-col gap-6">
        <ScreenHeader
          back={{ href: HUB_HREF, label: "Accueil de Clip Studio" }}
          icon={Clapperboard}
          title="Nouveau clip"
          description={
            fromGallery
              ? `${mediaCountLabel(files)} ${files.every((file) => file.startsWith(GENERATED_PREFIX)) ? "d’AI Image Gen" : "de la galerie"}, à monter en diaporama, en clip rythmé ou en avant / après.`
              : prefill?.ideaId
                ? "Préremplie depuis une idée : relisez, ajustez, puis lancez l’assistant."
                : "Choisissez un point de départ, ajustez les réglages, puis créez."
          }
        />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="flex min-w-0 flex-col gap-6">
            {!clipActive ? <ModeChooser mode={mode} onChange={setMode} galleryCount={files.length} /> : null}

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="flex min-w-0 flex-col gap-6">
                {mode === "idea" ? <IdeaStarter kitId={chosenKitId} aspect={aspect} onPick={pickIdea} /> : null}

                {assistantMode ? (
                  <>
                    {mode === "overlay" ? (
                      <Panel>
                        <PanelHeader icon={Film} title="Vidéo source" description="Le script s’appuie sur ce qui s’y dit, et en cite ou en montre des extraits." />
                        <PanelBody className="flex min-w-0 flex-col gap-3">
                          {videoHint ? (
                            <p className="flex min-w-0 items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                              <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                              <span className="min-w-0 [overflow-wrap:anywhere]">
                                <span className="text-muted-foreground">L’idée demande&nbsp;: </span>
                                {videoHint}
                              </span>
                            </p>
                          ) : null}
                          <SourceVideoField value={sourceVideo} onChange={setSourceVideo} embedded />
                        </PanelBody>
                      </Panel>
                    ) : null}
                    <Panel>
                      <PanelHeader icon={Sparkles} title="Sujet" description="Une phrase suffit : le sujet, l’angle, le ton. L’assistant écrit le script, cherche ou crée les images, enregistre la voix et monte le clip." />
                      <PanelBody className="flex min-w-0 flex-col gap-3">
                        <Textarea
                          value={brief}
                          onChange={(event) => setBrief(event.target.value.slice(0, 600))}
                          placeholder="Par exemple : l’histoire du chocolat, ton fun ; un quiz sur la savane ; les secrets des sabres japonais"
                          rows={4}
                          maxLength={600}
                          autoFocus={!prefill}
                          aria-label="Sujet du clip"
                          className="resize-none text-[15px]"
                        />
                        <div className={cn("flex min-w-0 flex-wrap gap-1.5", brief.trim() && "hidden")}>
                          {BRIEF_SUGGESTIONS.map((idea) => (
                            <button
                              key={idea}
                              type="button"
                              onClick={() => setBrief(idea)}
                              className="max-w-full rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                            >
                              {idea}
                            </button>
                          ))}
                        </div>
                      </PanelBody>
                    </Panel>
                    <Panel>
                      <PanelHeader icon={LayoutTemplate} title="Forme" description="Ce que l’assistant écrit : des séquences libres, un quiz, un classement ou un diaporama." />
                      <PanelBody>
                        <TemplatePicker value={template} onChange={setTemplate} only={ASSISTANT_TEMPLATE_IDS} />
                      </PanelBody>
                    </Panel>
                  </>
                ) : null}

                {mode === "template" ? (
                  <Panel>
                    <PanelHeader icon={LayoutTemplate} title="Modèle" description="Rempli d’un exemple : remplacez les textes et glissez vos images sur la piste Principale." />
                    <PanelBody className="flex min-w-0 flex-col gap-4">
                      <label className="grid min-w-0 gap-1.5 sm:max-w-md">
                        <span className="text-sm font-medium">Nom du clip</span>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du clip" maxLength={120} />
                      </label>
                      <TemplateGallery value={template} onChange={setTemplate} aspect={aspect} theme={theme} themeKey={chosenKitId ?? "none"} />
                    </PanelBody>
                  </Panel>
                ) : null}

                {mode === "blank" ? (
                  <Panel>
                    <PanelHeader icon={FileVideo} title="Projet vide" description="Une timeline vide au format choisi : importez vos médias, posez textes et sons à la main." />
                    <PanelBody>
                      <label className="grid min-w-0 gap-1.5 sm:max-w-md">
                        <span className="text-sm font-medium">Nom du clip</span>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du clip" maxLength={120} autoFocus />
                      </label>
                    </PanelBody>
                  </Panel>
                ) : null}

                {mode === "gallery" ? (
                  <Panel>
                    <PanelHeader icon={Images} title="Montage de la sélection" description={`${mediaCountLabel(files)}, dans l’ordre de la sélection.`} />
                    <PanelBody className="flex min-w-0 flex-col gap-4">
                      <label className="grid min-w-0 gap-1.5 sm:max-w-md">
                        <span className="text-sm font-medium">Nom du clip</span>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du clip" maxLength={120} />
                      </label>
                      <RecipePicker
                        value={recipe}
                        onChange={(next) => {
                          setRecipe(next);
                          const date = new Date().toLocaleDateString("fr-FR");
                          setName(`${next === "before-after" ? "Avant / Après" : next === "rhythm" ? "Clip rythmé" : "Diaporama"} du ${date}`);
                        }}
                        files={files}
                      />
                    </PanelBody>
                  </Panel>
                ) : null}

                {clipMode ? (
                  <Panel>
                    <PanelHeader
                      icon={mode === "subtitle" ? Captions : Scissors}
                      title={mode === "subtitle" ? "Sous-titrer un clip" : "Découper une vidéo"}
                      description={
                        clipActive
                          ? undefined
                          : mode === "subtitle"
                          ? "La vidéo garde son son ; ses paroles deviennent des sous-titres animés à la marque, avec le filigrane et le carton de fin. 20 minutes au plus."
                          : "Une longue vidéo (2 heures au plus) est transcrite, puis Codex y repère les passages forts de 15 à 60 secondes. Vous gardez ceux qui vous plaisent : chacun devient un clip sous-titré."
                      }
                    />
                    <PanelBody>
                      <ClipModePanel
                        key={mode}
                        kind={mode}
                        aspect={aspect}
                        brandKitId={chosenKitId}
                        onCreated={(id) => router.push(`/m/clip-studio/edit?id=${encodeURIComponent(id)}`)}
                        onClose={() => router.push(HUB_HREF)}
                        onActiveChange={setClipActive}
                        actionsTarget={actionsTarget}
                      />
                    </PanelBody>
                  </Panel>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Réglages">
            <Panel className="lg:max-h-[calc(100dvh-12rem)]">
              <PanelHeader
                icon={Settings2}
                title="Réglages"
                description={clipActive ? "Le travail est lancé : ses réglages ne changent plus." : "Ce que vous créez, et comment."}
                actions={
                  <Button variant="ghost" size="sm" className="gap-1 lg:hidden" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
                    {settingsOpen ? "Masquer" : "Afficher"}
                    <ChevronDown className={cn("size-4 transition-transform", settingsOpen && "rotate-180")} />
                  </Button>
                }
              />
              {!clipActive ? (
                <div className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain", !settingsOpen && "max-lg:hidden")}>
                  <SettingsSection title="Format">
                    <AspectPicker value={aspect} onChange={setAspect} />
                  </SettingsSection>

                  {showBrands ? (
                    <SettingsSection title="Image de marque" help={assistantMode || mode === "idea" ? "Ton, style des images, couleurs, polices, filigrane et carton de fin." : "Couleurs, polices, filigrane et carton de fin."}>
                      <BrandPicker kits={brandKits!} value={chosenKitId} onChange={(next) => setBrandChoice(next)} />
                    </SettingsSection>
                  ) : null}

                  {assistantMode ? (
                    <>
                      <SettingsSection title="Durée visée" value={`${targetSeconds} s`}>
                        <input
                          type="range"
                          min={MIN_TARGET_SECONDS}
                          max={maxTarget}
                          step={5}
                          value={targetSeconds}
                          onChange={(event) => setTargetChoice(Number(event.target.value))}
                          aria-label="Durée parlée visée, en secondes"
                          className="w-full accent-primary"
                        />
                        <p className="text-xs text-muted-foreground">
                          {aspect === "9:16" ? "60 s au plus pour un short. " : ""}
                          Voix trop longue&nbsp;: accélérée de 10&nbsp;% au plus, sinon script raccourci.
                        </p>
                      </SettingsSection>

                      <SettingsSection
                        title={countLabel.label}
                        aside={
                          <ToggleGroup
                            type="single"
                            variant="outline"
                            size="sm"
                            value={count === null ? "auto" : "pick"}
                            onValueChange={(value) => {
                              if (value === "auto") setCount(null);
                              else if (value === "pick") setCount(lastCount);
                            }}
                            aria-label={`Nombre de ${countLabel.many}`}
                          >
                            <ToggleGroupItem value="auto" className="px-2.5 text-xs">
                              Auto
                            </ToggleGroupItem>
                            <ToggleGroupItem value="pick" className="px-2.5 text-xs">
                              Choisir
                            </ToggleGroupItem>
                          </ToggleGroup>
                        }
                      >
                        {count === null ? (
                          <p className="text-xs text-pretty text-muted-foreground">
                            Le script découpe lui-même selon le sujet et la durée&nbsp;: environ {estimate}&nbsp;{countLabel.many} pour {targetSeconds}&nbsp;s.
                          </p>
                        ) : (
                          <label className="block min-w-0 space-y-1.5">
                            <span className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Nombre de {countLabel.many}</span>
                              <span className="font-mono text-foreground tabular-nums">{count}</span>
                            </span>
                            <input
                              type="range"
                              min={CHOSEN_SEGMENTS.min}
                              max={CHOSEN_SEGMENTS.max}
                              value={count}
                              onChange={(event) => {
                                setCount(Number(event.target.value));
                                setLastCount(Number(event.target.value));
                              }}
                              aria-label={`Nombre de ${countLabel.many}`}
                              className="w-full accent-primary"
                            />
                          </label>
                        )}
                      </SettingsSection>

                      <SettingsSection title="Voix off" aside={<Switch checked={withVoice} onCheckedChange={setWithVoice} aria-label="Voix off" />}>
                        {withVoice ? (
                          <div className="flex min-w-0 flex-col gap-2">
                            {brandVoiceState && chosenKit ? (
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-live="polite">
                                {brandVoiceState === "unavailable" ? (
                                  <span className="flex min-w-0 items-start gap-1.5 text-amber-700 dark:text-amber-400">
                                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                                    <span className="min-w-0 break-words">{brandPrefill?.unavailable}</span>
                                  </span>
                                ) : (
                                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                    <BrandKitMark kit={chosenKit} />
                                    <span className="min-w-0 truncate" title={chosenKit.name}>
                                      {brandVoiceState === "same" ? `Voix de la marque « ${chosenKit.name} »` : "Voix changée pour ce clip"}
                                    </span>
                                  </span>
                                )}
                                {brandVoiceState === "changed" ? (
                                  <button type="button" onClick={restoreBrandVoice} className="inline-flex items-center gap-1 text-primary hover:underline">
                                    <RotateCcw className="h-3 w-3" />
                                    Reprendre la voix de la marque
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="flex min-w-0 items-center gap-2">
                              <Mic className="size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-sm" title={summary.voice}>
                                {summary.voice}
                              </span>
                              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setVoiceOpen(true)}>
                                Changer
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Clip muet&nbsp;: les textes s’affichent sans être lus.</p>
                        )}
                      </SettingsSection>

                      <SettingsSection title="Musique de fond">
                        <div className="flex min-w-0 flex-wrap gap-1.5">
                          {MUSIC_CHOICES.map(([key, label]) => (
                            <ChoiceChip key={key} selected={music === key} onClick={() => setMusic(key)}>
                              {label}
                            </ChoiceChip>
                          ))}
                        </div>
                      </SettingsSection>

                      <SettingsSection title="Illustrations" help={IMAGE_SOURCE_HELP[imageSource]}>
                        <div className="flex min-w-0 flex-wrap gap-1.5">
                          {IMAGE_SOURCE_MODES.map((key) => (
                            <ChoiceChip key={key} selected={imageSource === key} onClick={() => chooseImageSource(key)}>
                              {IMAGE_SOURCE_LABELS[key]}
                            </ChoiceChip>
                          ))}
                        </div>
                        <label className="flex min-w-0 items-start justify-between gap-3 pt-1">
                          <span className="min-w-0 text-sm">
                            Chercher sur le web
                            <span className="block text-xs text-muted-foreground">
                              {imageSource === "find-then-generate" || imageSource === "find"
                                ? "Faits du script vérifiés avec leurs sources, visuels officiels et logos. Droits des images à vérifier avant de publier."
                                : "Faits du script vérifiés avec leurs sources : dates, noms, chiffres, bonnes réponses."}
                            </span>
                          </span>
                          <Switch checked={webSearch} onCheckedChange={chooseWebSearch} />
                        </label>
                        {videoProviders.length > 0 && (imageSource === "find" || imageSource === "find-then-generate") ? (
                          <label className="flex min-w-0 items-start justify-between gap-3 pt-1">
                            <span className="min-w-0 text-sm">
                              Illustrer aussi en vidéo
                              <span className="block text-xs text-muted-foreground">Segment par segment, une image ou un plan filmé, sans son. Auteur et licence cités.</span>
                              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                                {videoProviders.map((provider) => (
                                  <span key={provider} className="inline-flex min-w-0 items-center gap-1">
                                    <BrandLogo brand={VIDEO_PROVIDER_BRANDS[provider].brand} className="size-3.5" />
                                    <span className="truncate">{VIDEO_PROVIDER_BRANDS[provider].label}</span>
                                  </span>
                                ))}
                              </span>
                            </span>
                            <Switch checked={stockVideos} onCheckedChange={setStockVideos} />
                          </label>
                        ) : null}
                      </SettingsSection>
                    </>
                  ) : null}
                </div>
              ) : null}

              <footer className="flex min-w-0 shrink-0 flex-col gap-3 border-t bg-muted/30 px-4 py-3">
                {!clipActive ? (
                  <ul className="grid min-w-0 gap-1 text-xs text-muted-foreground" aria-label="Ce qui sera créé">
                    {summary.lines.map((line) => (
                      <li key={line} className="min-w-0 [overflow-wrap:anywhere]">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {clipMode ? (
                  <div ref={setActionsTarget} className="min-w-0" />
                ) : (
                  <>
                    {missing ? <p className="text-xs text-muted-foreground">{missing}</p> : null}
                    <Button
                      className="w-full gap-2"
                      size="lg"
                      onClick={() => void (assistantMode ? startAssistant() : createBlankOrTemplate())}
                      loading={busy}
                      disabled={Boolean(missing)}
                    >
                      {assistantMode || mode === "idea" ? <Sparkles className="size-4" /> : <Plus className="size-4" />}
                      {assistantMode || mode === "idea" ? "Créer avec l’assistant" : "Créer le projet"}
                    </Button>
                  </>
                )}
                <FormStatus state={feedback.state} />
              </footer>
            </Panel>
          </aside>
        </div>
      </div>

      <Sheet open={voiceOpen} onOpenChange={setVoiceOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b p-4 pr-12">
            <SheetTitle className="flex items-center gap-2">
              <Mic className="size-4" />
              Voix off
            </SheetTitle>
            <SheetDescription>Chaque segment est lu à voix haute&nbsp;; sa durée s’adapte à la lecture.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
            <div className="flex min-w-0 flex-col gap-4">
              <VoicePicker value={voice} onChange={setVoice} voices={voices} onPrepare={prepareVoice} speed={speed} tone={tone} />
              <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Débit</span>
                  <SpeedControl value={speed} onChange={chooseSpeed} />
                </div>
                {localVoice ? (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">Intonation</span>
                    <ToneControl value={tone} onChange={chooseTone} />
                  </div>
                ) : null}
              </div>
              <VoiceCredit voice={voices?.voices.find((entry) => entry.id === voice)} />
            </div>
          </div>
          <SheetFooter className="border-t p-4">
            <Button onClick={() => setVoiceOpen(false)}>Garder cette voix</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </MotionConfig>
  );
}

// ─── Point de départ ─────────────────────────────────────────────

function ModeChooser({ mode, onChange, galleryCount }: { mode: CreateMode; onChange: (mode: CreateMode) => void; galleryCount: number }) {
  const byId = new Map(MODES.map((entry) => [entry.id, entry]));
  const gallery = galleryCount
    ? { id: "gallery" as const, label: "Sélection de la galerie", description: `${galleryCount}\u00a0média${galleryCount > 1 ? "s" : ""} à monter en diaporama ou en avant / après.`, icon: Images }
    : null;
  const groups = [
    { label: "Avec l’assistant", modes: [byId.get("assistant")!, byId.get("idea")!, byId.get("overlay")!] },
    { label: "À la main", modes: [...(gallery ? [gallery] : []), byId.get("template")!, byId.get("blank")!] },
    { label: "Depuis une vidéo", modes: [byId.get("subtitle")!, byId.get("clipping")!] },
  ];
  return (
    <nav aria-label="Point de départ" className="flex min-w-0 flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label} className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 md:grid-cols-[repeat(3,minmax(0,1fr))]">
            {group.modes.map((entry) => {
              const Icon = entry.icon;
              const active = entry.id === mode;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onChange(entry.id)}
                  aria-pressed={active}
                  className={cn("group flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors", active ? "border-primary bg-primary/10" : "bg-card hover:bg-muted")}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm leading-5 font-medium [overflow-wrap:anywhere]">{entry.label}</span>
                    <span className={cn("hidden text-xs leading-4 text-pretty sm:line-clamp-2", active ? "text-foreground/70" : "text-muted-foreground group-hover:text-foreground/70")} title={entry.description}>
                      {entry.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Galerie des modèles : chacun montré par une image de son exemple, au format et à la marque choisis. */
function TemplateGallery({
  value,
  onChange,
  aspect,
  theme,
  themeKey,
}: {
  value: TemplateId;
  onChange: (value: TemplateId) => void;
  aspect: AspectPreset;
  theme: BrandTheme | null;
  themeKey: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))] 2xl:grid-cols-[repeat(5,minmax(0,1fr))]" role="group" aria-label="Modèles">
      {TEMPLATES.map((entry) => {
        const selected = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            aria-pressed={selected}
            className={cn("flex min-w-0 flex-col gap-2 rounded-xl border p-2 text-left transition-colors", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <TemplatePreview template={entry.id} aspect={aspect} theme={theme} themeKey={themeKey} />
            <span className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
              <span className="text-sm font-medium">{entry.label}</span>
              <span className={cn("text-xs leading-4 break-words", selected ? "text-foreground/70" : "text-muted-foreground")}>{entry.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Section de la colonne des réglages : un titre, une valeur ou un geste à droite, puis le contenu. */
function SettingsSection({ title, value, aside, help, children }: { title: string; value?: string; aside?: ReactNode; help?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="min-w-0 text-sm font-medium">{title}</h4>
        {value ? <span className="shrink-0 text-sm tabular-nums">{value}</span> : null}
        {aside ? <span className="flex shrink-0 items-center">{aside}</span> : null}
      </div>
      {help ? <p className="-mt-1 text-xs text-pretty text-muted-foreground">{help}</p> : null}
      {children}
    </section>
  );
}

// ─── Résumé ──────────────────────────────────────────────────────

const ASPECT_WORDS: Record<AspectPreset, string> = { "9:16": "Short vertical 9:16", "16:9": "Vidéo paysage 16:9", "1:1": "Clip carré 1:1", "4:5": "Clip portrait 4:5" };
const TEMPLATE_WORDS: Record<TemplateId, string> = { free: "séquences libres", quiz: "quiz", top: "classement", slideshow: "diaporama", "before-after": "avant / après" };

function summaryLines(input: {
  mode: CreateMode;
  aspect: AspectPreset;
  template: TemplateId;
  count: number | null;
  estimate: number;
  targetSeconds: number;
  withVoice: boolean;
  voiceLabel: string;
  music: string;
  imageSource: ImageSourceMode;
  kitName: string | null;
  showBrands: boolean;
  files: string[];
  recipe: Recipe;
  sourceVideo: MediaSource | null;
}): { lines: string[]; voice: string } {
  const unit = COUNT_LABELS[input.template]?.many ?? "séquences";
  const brand = input.showBrands ? (input.kitName ? `Marque « ${input.kitName} »` : "Sans marque") : null;
  const voice = input.withVoice ? input.voiceLabel : "Sans voix";
  const lines: string[] = [];
  if (ASSISTANT_MODES.includes(input.mode) || input.mode === "idea") {
    lines.push(`${ASPECT_WORDS[input.aspect]}, environ ${input.targetSeconds} s, ${TEMPLATE_WORDS[input.template]}`);
    lines.push(input.count === null ? `Découpage auto (environ ${input.estimate} ${unit})` : `${input.count} ${unit}`);
    lines.push(`Voix : ${voice} · Musique : ${input.music === "none" ? "aucune" : input.music === "auto" ? "choisie par l’IA" : (MOOD_LABELS[input.music] ?? input.music).toLowerCase()}`);
    lines.push(`Illustrations : ${IMAGE_SOURCE_LABELS[input.imageSource].toLowerCase()}`);
    if (input.mode === "overlay") lines.push(input.sourceVideo ? `Sur « ${input.sourceVideo.name} »` : "Vidéo source à choisir");
  } else if (input.mode === "template") {
    lines.push(`${ASPECT_WORDS[input.aspect]}, modèle «\u00a0${TEMPLATES.find((entry) => entry.id === input.template)?.label ?? input.template}\u00a0» rempli d’un exemple`);
  } else if (input.mode === "gallery") {
    lines.push(`${ASPECT_WORDS[input.aspect]}, ${mediaCountLabel(input.files)} en ${input.recipe === "rhythm" ? "clip rythmé" : TEMPLATE_WORDS[input.recipe]}`);
  } else if (input.mode === "blank") {
    lines.push(`${ASPECT_WORDS[input.aspect]}, timeline vide`);
  } else {
    lines.push(`${ASPECT_WORDS[input.aspect]}, ${input.mode === "subtitle" ? "un clip sous-titré" : "un clip par passage gardé"}`);
  }
  if (brand) lines.push(brand);
  return { lines, voice };
}

// ─── Suivi d'une création ────────────────────────────────────────

function JobView({ jobId, onRestart }: { jobId: string; onRestart: () => void }) {
  const [job, setJob] = useState<AssistantJob | null | undefined>(undefined);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await callModule<AssistantJob | null>("getAssistantJob", jobId).catch(() => undefined);
      if (!alive) return;
      if (next !== undefined) setJob(next);
      if (next === undefined || next?.status === "running") timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  const cancel = async () => {
    setCanceling(true);
    try {
      await callModule("cancelAssistant", jobId);
    } finally {
      setCanceling(false);
    }
  };

  const running = job?.status === "running";
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full shrink-0 flex-col gap-6">
        <ScreenHeader
          back={{ href: HUB_HREF, label: "Accueil de Clip Studio" }}
          icon={Sparkles}
          title={job?.title ?? "Création en cours"}
          fullTitle={job?.title}
          description={running ? "L’assistant monte le clip. Vous pouvez quitter la page : la création continue." : job?.status === "done" ? "Le clip est prêt." : "Création de l’assistant."}
        />
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <Panel>
            <PanelHeader icon={Sparkles} title="Étapes" description="Script, vérification des faits, illustrations, voix, montage." />
            <PanelBody>
              {job === undefined ? (
                <div className="flex h-48 items-center justify-center" aria-live="polite">
                  <span className="text-sm text-muted-foreground">Lecture de la création…</span>
                </div>
              ) : job === null ? (
                <p className="text-sm text-muted-foreground">Cette création est introuvable&nbsp;: elle a peut-être été effacée.</p>
              ) : (
                <AssistantProgress job={job} />
              )}
            </PanelBody>
          </Panel>
          <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Suite">
            <Panel>
              <PanelHeader icon={Settings2} title="Suite" />
              <PanelBody className="flex min-w-0 flex-col gap-2">
                {job?.status === "done" && job.projectId ? (
                  <Button asChild size="lg" className="w-full gap-2">
                    <Link href={`/m/clip-studio/edit?id=${encodeURIComponent(job.projectId)}`}>
                      <Clapperboard className="size-4" />
                      Ouvrir le projet
                    </Link>
                  </Button>
                ) : null}
                {running ? (
                  <>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={HUB_HREF}>Continuer en arrière-plan</Link>
                    </Button>
                    <Button variant="ghost" className="w-full" loading={canceling} onClick={() => void cancel()}>
                      Annuler la création
                    </Button>
                  </>
                ) : null}
                {job !== undefined && !running ? (
                  <Button variant={job?.status === "done" ? "ghost" : "outline"} className="w-full gap-2" onClick={onRestart}>
                    <ArrowLeft className="size-4" />
                    {job?.status === "done" ? "Créer un autre clip" : "Revenir aux réglages"}
                  </Button>
                ) : null}
              </PanelBody>
            </Panel>
          </aside>
        </div>
      </div>
    </MotionConfig>
  );
}
