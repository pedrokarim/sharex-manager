import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, tout est pur.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import { SHORT_SAFE_ZONE, applyBrandTheme, defaultRoleStyles, type BrandTheme, type MascotPose } from "@/modules/clip-studio/engine/brand";
import { DUCK_ATTACK, gainPoints, voiceWindows } from "@/modules/clip-studio/engine/mix";
import { POSE_EMOTION_NEIGHBORS, needsMirror, pickRankedPose, readEmotion, readGesture, type PoseTags } from "@/modules/clip-studio/engine/poses";
import { MAX_BEAT_SOUNDS, MAX_STILL_SECONDS, beatSounds, changeFrames, longestStill, readPace, segmentsOf } from "@/modules/clip-studio/engine/rhythm";
import { SFX_DURATION_MS, SFX_IDS, SFX_VOLUME, encodeWav, synthesizeSfx } from "@/modules/clip-studio/engine/sfx";
import {
  SAMPLE_FREE,
  SAMPLE_QUIZ,
  buildFree,
  buildFromTemplate,
  buildQuiz,
  buildSlideshow,
  buildTop,
  spokenAt,
  type FreeData,
  type QuizData,
  type SlideshowData,
  type TopData,
  type VoiceClip,
} from "@/modules/clip-studio/engine/templates";
import type { AudioItem, ClipProject, ImageItem, MediaSource, TextItem, VisualItem } from "@/modules/clip-studio/engine/types";
import {
  MUSIC_UNDER_VOICE,
  assistantPace,
  emotionLines,
  iconNameOf,
  sanitize,
  scriptPrompt,
  toAssistantBrand,
  type AssistantRequest,
} from "@/modules/clip-studio/lib/assistant";

// ─── Données neutres ─────────────────────────────────────────────

const image = (name: string, width = 1600, height = 1067): MediaSource => ({ url: `/test/${name}.png`, ref: `test:${name}`, name, kind: "image", width, height });

const pose = (id: string, tags: Partial<PoseTags>, width = 700, height = 1500): MascotPose => ({
  id,
  source: image(`pose-${id}`, width, height),
  tags: { emotion: "neutral", gesture: "idle", framing: "full", facing: "front", ...tags },
});

/** Une petite bibliothèque : plusieurs émotions, des poses tournées d'un côté ou de l'autre. */
const LIBRARY: MascotPose[] = [
  pose("hello", { emotion: "excitement", gesture: "pointing", facing: "right" }),
  pose("happy1", { emotion: "joy", gesture: "thumbs-up", facing: "right" }),
  pose("happy2", { emotion: "joy", gesture: "thumbs-up", facing: "left" }),
  pose("wow", { emotion: "surprise", gesture: "hands-on-cheeks", framing: "bust" }, 1000, 1500),
  pose("think", { emotion: "thinking", gesture: "chin-in-hand", framing: "bust", facing: "left" }, 1000, 1500),
  pose("shock", { emotion: "shock", gesture: "recoiling", facing: "left" }),
  pose("proud", { emotion: "pride", gesture: "hands-on-hips" }),
  pose("sly", { emotion: "mischief", gesture: "finger-on-lips", framing: "bust" }, 1000, 1500),
  pose("calm", { emotion: "neutral", gesture: "presenting", facing: "right" }),
];

const BASE_THEME: BrandTheme = {
  kitId: "kit-test01",
  name: "Atelier",
  palette: {
    background: "#f2ede4",
    ink: "#3d5588",
    surface: "#fbf8f2",
    onSurface: "#1c1b22",
    accent: "#ff48b0",
    accentSecondary: "#3d5588",
    onAccent: "#1c1b22",
    extras: ["#3d185e"],
  },
  textStyles: defaultRoleStyles(),
  fonts: [],
  endCard: { seconds: 3, name: "Atelier", tagline: "En couleurs.", callToAction: "Abonne-toi" },
};

const THEME: BrandTheme = {
  ...BASE_THEME,
  pace: "normal",
  mascot: { opening: LIBRARY[0].source, reactions: LIBRARY.map((entry) => entry.source), library: LIBRARY },
};

/** Voix de synthèse factice : un mot toutes les 330 ms. */
function voice(text: string): VoiceClip {
  const words = text.split(/\s+/).map((word, index) => ({ text: word, startMs: 100 + index * 330, endMs: 100 + index * 330 + 300 }));
  const durationMs = 100 + words.length * 330 + 200;
  return { durationMs, source: { url: "/test/voice.wav", ref: "test:voice", name: "voix", kind: "audio", durationMs, words, speech: { text, voice: "test" } } };
}

const FREE: FreeData = {
  title: "Cinq réflexes pour mieux dormir",
  subtitle: "Ce que dit la science",
  outro: "Lequel vas-tu essayer ?",
  outroEmotion: "mischief",
  voice: { intro: voice("Cinq réflexes pour mieux dormir. Ce que dit la science."), outro: voice("Lequel vas-tu essayer ?") },
  scenes: [
    { heading: "Une heure fixe", text: "Se lever à la même heure cale ton horloge interne.", emotion: "thinking" },
    { heading: "Le café de 16 h", text: "La caféine reste six heures dans le sang, même le soir.", emotion: "shock", iconName: "caféine", icon: image("icone", 512, 512) },
    { heading: "Une chambre fraîche", text: "Entre 16 et 19 degrés, le corps s’endort plus vite.", emotion: "joy" },
    { heading: "Pas d’écran au lit", text: "La lumière bleue retarde la mélatonine d’une demi-heure.", emotion: "surprise" },
    { heading: "La sieste éclair", text: "Vingt minutes au plus, sinon tu te réveilles fatigué.", emotion: "pride" },
  ].map((scene, index) => ({ ...scene, image: image(`photo-${index}`), voice: voice(`${scene.heading}. ${scene.text}`) })) as FreeData["scenes"],
};

const QUIZ: QuizData = {
  ...SAMPLE_QUIZ,
  voice: { intro: voice("Quiz animaux"), outro: voice("Combien de bonnes réponses ?") },
  questions: SAMPLE_QUIZ.questions.map((question, index) => ({
    ...question,
    image: image(`quiz-${index}`),
    emotion: (["thinking", "surprise", "mischief"] as const)[index],
    voice: { question: voice(`Question ${index + 1}. ${question.question}`), reveal: voice(`Réponse : ${question.choices[question.answer]}.`) },
  })),
};

const TOP: TopData = {
  title: "Top 4 des animaux les plus rapides",
  voice: { intro: voice("Top 4 des animaux les plus rapides."), outro: voice("Tu les connaissais ?") },
  outro: "Tu les connaissais ?",
  entries: ["Le lévrier", "Le lion", "Le guépard", "Le faucon pèlerin"].map((title, index) => ({
    title,
    detail: "Très rapide",
    image: image(`top-${index}`),
    emotion: (["joy", "excitement", "shock", "pride"] as const)[index],
    voice: voice(`Numéro ${4 - index}. ${title}. Très rapide.`),
    ...(index === 2 ? { icon: image("icone-guepard", 512, 512) } : {}),
  })),
};

const SLIDESHOW: SlideshowData = {
  title: "Cinq lacs à voir",
  outro: "Lequel préfères-tu ?",
  voice: { intro: voice("Cinq lacs à voir."), outro: voice("Lequel préfères-tu ?") },
  slides: ["Le lac Moraine, bleu glacier.", "Le lac de Bled et son île.", "Le lac Baïkal, le plus profond.", "Le lac Titicaca, très haut.", "Le lac d’Annecy, très pur."].map((caption, index) => ({
    caption,
    image: image(`lac-${index}`),
    emotion: (["surprise", "joy", "excitement", "thinking", "pride"] as const)[index],
    voice: voice(caption),
  })),
};

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const mascotItems = (project: ClipProject) =>
  items(project)
    .filter((item): item is ImageItem => item.type === "image" && item.origin === "brand" && (item.label ?? "").startsWith("Mascotte"))
    .sort((a, b) => a.start - b.start);
const libraryPose = (item: ImageItem) => LIBRARY.find((entry) => entry.source.url === item.source.url)!;

function stable(project: ClipProject) {
  return JSON.parse(JSON.stringify({ ...project, id: "", createdAt: 0, updatedAt: 0 }, (key, value) => (key === "id" && typeof value === "string" ? "" : value)));
}

const edges = (item: { transform: { x: number; y: number; width: number; height: number } }) => ({
  left: item.transform.x - item.transform.width / 2,
  right: item.transform.x + item.transform.width / 2,
  top: item.transform.y - item.transform.height / 2,
  bottom: item.transform.y + item.transform.height / 2,
});

// ─── Script : émotion par segment ────────────────────────────────

describe("script de l'assistant : une émotion par segment", () => {
  const REQUEST: AssistantRequest = { brief: "Le sommeil", template: "free", aspect: "9:16", count: 3, images: true };

  it("demande l'émotion dans une liste fermée quand la mascotte est posée au montage", () => {
    const brand = toAssistantBrand({ name: "Atelier", mascot: { identityPrompt: "A round blue robot" } }, THEME);
    const prompt = scriptPrompt(REQUEST, brand);
    expect(prompt).toContain('"emotion"');
    expect(prompt).toContain('"outroEmotion"');
    for (const emotion of ["joy", "surprise", "thinking", "neutral"]) expect(prompt).toContain(`"${emotion}"`);
    expect(emotionLines().join(" ")).toContain('"gesture"');
    // Sans mascotte posée, rien de tout ça.
    expect(scriptPrompt(REQUEST)).not.toContain('"emotion"');
  });

  it("lit l'émotion avec rigueur : hors liste, neutre ; un geste inconnu est écarté", () => {
    const script = sanitize(REQUEST, {
      title: "Dormir",
      outroEmotion: "euphorie",
      scenes: [
        { heading: "Un", imagePrompt: "A", emotion: "surprise", gesture: "facepalm" },
        { heading: "Deux", imagePrompt: "B", emotion: "rage", gesture: "danse" },
        { heading: "Trois", imagePrompt: "C" },
      ],
    });
    const scenes = (script as unknown as FreeData).scenes;
    expect(scenes[0]).toMatchObject({ emotion: "surprise", gesture: "facepalm" });
    expect(scenes[1].emotion).toBe("neutral");
    expect(scenes[1].gesture).toBeUndefined();
    expect(scenes[2].emotion).toBeUndefined();
    expect(script.outroEmotion).toBe("neutral");
    expect(readEmotion(undefined)).toBe("neutral");
    expect(readGesture("pointing")).toBe("pointing");
  });

  it("prend le rythme de la marque, sinon le rythme normal ; nomme le sujet d'une icône", () => {
    expect(assistantPace(null)).toBe("normal");
    expect(assistantPace({ theme: { ...THEME, pace: "lively" } })).toBe("lively");
    expect(iconNameOf("Honkai Star Rail logo")).toBe("Honkai Star Rail");
    expect(iconNameOf("Minecraft app icon")).toBe("Minecraft");
    expect(iconNameOf(undefined)).toBeUndefined();
  });
});

// ─── Choix de la pose et miroir ──────────────────────────────────

describe("choix de la pose", () => {
  const tags = (entry: MascotPose) => entry.tags;
  const id = (entry: MascotPose) => entry.id;

  it("prend l'émotion exacte, puis une voisine, jamais la précédente quand une autre convient", () => {
    expect(pickRankedPose(LIBRARY, tags, id, { emotion: "joy" })?.id).toBe("happy1");
    expect(pickRankedPose(LIBRARY, tags, id, { emotion: "joy", exclude: "happy1" })?.id).toBe("happy2");
    expect(pickRankedPose(LIBRARY, tags, id, { emotion: "joy", side: "left" })?.id).toBe("happy2");
    // Aucune pose de doute : la voisine (réflexion).
    expect(pickRankedPose(LIBRARY, tags, id, { emotion: "doubt" })?.id).toBe("think");
    // Ni tristesse ni voisine : la pose neutre ; sans elle, rien plutôt qu'une émotion contraire.
    expect(pickRankedPose(LIBRARY, tags, id, { emotion: "sadness" })?.id).toBe("calm");
    expect(pickRankedPose(LIBRARY.filter((entry) => entry.id !== "calm"), tags, id, { emotion: "sadness" })).toBeUndefined();
  });

  it("retourne en miroir une pose qui regarderait à l'opposé du contenu, jamais une pose de face", () => {
    expect(needsMirror("left", "right")).toBe(true);
    expect(needsMirror("right", "right")).toBe(false);
    expect(needsMirror("front", "left")).toBe(false);
  });

  it("donne à chaque segment la pose de son émotion : au moins 4 poses différentes sur 5 segments", () => {
    const project = buildFromTemplate("free", "Libre", "9:16", FREE, THEME);
    const placed = mascotItems(project);
    const segments = segmentsOf(project);
    const reactions = placed.filter((item) => item.label === "Mascotte – réaction");
    expect(reactions.length).toBeGreaterThanOrEqual(5);
    expect(new Set(placed.map((item) => item.source.url)).size).toBeGreaterThanOrEqual(4);
    for (const item of reactions) {
      const segment = segments.find((entry) => item.start >= entry.start && item.start < entry.end)!;
      const wanted = readEmotion(segment.cue.emotion);
      const got = libraryPose(item).tags.emotion;
      expect(got === wanted || POSE_EMOTION_NEIGHBORS[wanted].includes(got) || got === "neutral").toBe(true);
    }
    // Jamais deux fois la même pose d'affilée.
    for (let index = 1; index < placed.length; index++) expect(placed[index].source.url).not.toBe(placed[index - 1].source.url);
  });

  it("tourne la pose vers le contenu : miroir quand elle regarderait vers le bord", () => {
    const project = buildFromTemplate("free", "Libre", "9:16", FREE, THEME);
    for (const item of mascotItems(project)) {
      const facing = libraryPose(item).tags.facing;
      const box = edges(item);
      const place = (box.left + box.right) / 2 < 0.5 ? "left" : "right";
      const toward = place === "left" ? "right" : "left";
      expect(Boolean(item.flipX)).toBe(needsMirror(facing, toward));
    }
  });
});

// ─── Place réservée et taille lisible ────────────────────────────

describe("place de la mascotte", () => {
  const projects = () => [
    buildFromTemplate("free", "Libre", "9:16", FREE, THEME),
    buildFromTemplate("quiz", "Quiz", "9:16", QUIZ, THEME),
    buildFromTemplate("top", "Top", "9:16", TOP, THEME),
    buildFromTemplate("slideshow", "Diaporama", "9:16", SLIDESHOW, THEME),
  ];

  it("reste lisible (en pied : au moins 24 % de la hauteur), dans la zone visible d'un short, hors des boutons", () => {
    for (const project of projects()) {
      const placed = mascotItems(project);
      expect(placed.length).toBeGreaterThanOrEqual(4);
      for (const item of placed) {
        const framing = libraryPose(item).tags.framing;
        expect(item.transform.height).toBeGreaterThanOrEqual(framing === "full" ? 0.24 - 1e-9 : 0.19 - 1e-9);
        const box = edges(item);
        expect(box.top).toBeGreaterThanOrEqual(SHORT_SAFE_ZONE.top - 1e-9);
        expect(box.bottom).toBeLessThanOrEqual(SHORT_SAFE_ZONE.bottom + 1e-9);
        expect(box.right > SHORT_SAFE_ZONE.buttonsLeft && box.bottom > SHORT_SAFE_ZONE.buttonsTop).toBe(false);
        // Entrée et sortie animées, avec des préréglages du registre.
        expect(item.animIn.kind).not.toBe("none");
        expect(item.animOut.kind).not.toBe("none");
      }
    }
  });

  it("ne recouvre ni le cadre d'un texte court, ni une icône, ni un cadre de choix", () => {
    for (const project of projects()) {
      for (const item of mascotItems(project)) {
        const box = edges(item);
        const during = items(project).filter(
          (other): other is VisualItem =>
            other.type !== "audio" &&
            other.origin !== "brand" &&
            other.start < item.start + item.duration &&
            other.start + other.duration > item.start &&
            !(other.transform.width >= 0.95 && other.transform.height >= 0.95)
        );
        for (const other of during) {
          if (other.type === "text") {
            // Estimation de la place réelle du texte : sa longueur à sa taille, au plus son cadre.
            const text = other as TextItem;
            const lines = text.karaoke ? 2 : Math.max(1, text.text.split("\n").length);
            const longest = text.karaoke ? 16 : Math.max(...text.text.split("\n").map((line) => line.length));
            const width = Math.min(text.transform.width, (longest * text.style.size * project.height * 0.6) / project.width);
            const height = Math.min(text.transform.height, lines * text.style.size * 1.2);
            const left = text.style.align === "left" ? text.transform.x - text.transform.width / 2 : text.transform.x - width / 2;
            const hit = box.left < left + width && box.right > left && box.top < text.transform.y + height / 2 && box.bottom > text.transform.y - height / 2;
            if (text.text.length <= 40) expect(hit).toBe(false);
          } else {
            const o = edges(other);
            expect(box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top).toBe(false);
          }
        }
      }
    }
  });

  it("garde une place à la mascotte dans le quiz d'un short : les choix se décalent à droite", () => {
    const reserved = buildFromTemplate("quiz", "Quiz", "9:16", QUIZ, THEME);
    const plain = buildQuiz("Quiz", "9:16", QUIZ);
    const choiceX = (project: ClipProject) => items(project).find((item): item is TextItem => item.type === "text" && item.text.startsWith("A. "))!.transform.x;
    expect(choiceX(plain)).toBe(0.5);
    expect(choiceX(reserved)).toBeGreaterThan(0.6);
    const reactions = mascotItems(reserved).filter((item) => item.label === "Mascotte – réaction");
    expect(reactions.length).toBe(QUIZ.questions.length + 1);
  });
});

// ─── Rythme du montage ───────────────────────────────────────────

describe("rythme du montage", () => {
  const all = (theme: BrandTheme | null, pace?: "normal" | "lively" | "calm") => [
    buildFromTemplate("free", "Libre", "9:16", FREE, theme, pace ? { pace } : {}),
    buildFromTemplate("quiz", "Quiz", "9:16", QUIZ, theme, pace ? { pace } : {}),
    buildFromTemplate("top", "Top", "9:16", TOP, theme, pace ? { pace } : {}),
    buildFromTemplate("slideshow", "Diaporama", "9:16", SLIDESHOW, theme, pace ? { pace } : {}),
    buildFromTemplate("free", "Libre", "16:9", FREE, theme, pace ? { pace } : {}),
  ];

  it("change l'image toutes les 2,5 s au plus, carton de fin compris ; 1,5 s en rythme vif", () => {
    for (const project of [...all(THEME), ...all(null, "normal")]) expect(longestStill(project).frames).toBeLessThanOrEqual(MAX_STILL_SECONDS * project.fps);
    for (const project of all(THEME, "lively")) expect(longestStill(project).frames).toBeLessThanOrEqual(1.5 * project.fps);
  });

  it("découpe le fond d'un segment en plans de 1 à 2,5 s, chacun cadré autrement, avec un mouvement existant", () => {
    const project = buildFromTemplate("free", "Libre", "9:16", FREE, THEME);
    const shots = items(project).filter((item): item is ImageItem => item.type === "image" && Boolean(item.cue));
    expect(shots.length).toBeGreaterThan(FREE.scenes.length + 1);
    for (const shot of shots) {
      expect(shot.duration).toBeGreaterThanOrEqual(project.fps);
      expect(shot.duration).toBeLessThanOrEqual(2.5 * project.fps);
      expect(["zoom-in", "zoom-out", "pan-left", "pan-right"]).toContain(shot.motion);
    }
    // Deux plans qui se suivent dans un segment n'ont jamais le même mouvement.
    const sorted = shots.sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index++) {
      if (sorted[index].cue!.index === sorted[index - 1].cue!.index) expect(sorted[index].motion).not.toBe(sorted[index - 1].motion);
    }
  });

  it("pose des sous-titres mot à mot à la place du texte lu, gros, sans fondu, sur la voix", () => {
    const project = buildFromTemplate("free", "Libre", "9:16", FREE, THEME);
    const captions = items(project).filter((item): item is TextItem => item.type === "text" && Boolean(item.karaoke));
    expect(captions).toHaveLength(FREE.scenes.length);
    const voices = items(project).filter((item): item is AudioItem => item.type === "audio" && Boolean(item.source.words));
    for (const caption of captions) {
      expect(caption.animIn.kind).toBe("none");
      expect(caption.animOut.kind).toBe("none");
      expect(caption.style.size).toBeGreaterThanOrEqual(0.04);
      expect(caption.transform.y).toBeCloseTo(0.67, 5);
      // Le mot prononcé ressort, aux couleurs de la marque, distinct du texte.
      expect(caption.karaoke!.highlight).not.toBe(caption.style.color);
      expect(voices.some((voiceItem) => voiceItem.id === caption.karaoke!.voiceId && voiceItem.start === caption.start)).toBe(true);
    }
    // Le texte lu n'est plus affiché en double ; le titre de la séquence reste.
    expect(items(project).some((item) => item.type === "text" && !item.karaoke && item.text === FREE.scenes[0].text)).toBe(false);
    expect(items(project).some((item) => item.type === "text" && item.text === FREE.scenes[0].heading)).toBe(true);
  });

  it("fait arriver l'icône sur le mot qui la nomme", () => {
    const voiceItem = { start: 30, source: voice("Numéro 1. Le guépard. Très rapide.").source };
    expect(spokenAt(voiceItem, "le guépard", 30)).toBe(30 + Math.round(((100 + 3 * 330) / 1000) * 30));
    expect(spokenAt(voiceItem, "guépards", 30)).toBe(30 + Math.round(((100 + 3 * 330) / 1000) * 30));
    expect(spokenAt(voiceItem, "Minecraft", 30)).toBeNull();

    const project = buildFromTemplate("top", "Top", "9:16", TOP, THEME);
    const icon = items(project).find((item): item is ImageItem => item.type === "image" && item.source.ref === "test:icone-guepard")!;
    const entryVoice = items(project).find((item): item is AudioItem => item.type === "audio" && item.source.speech?.text === "Numéro 2. Le guépard. Très rapide.")!;
    expect(icon.start).toBe(spokenAt(entryVoice, "Le guépard", project.fps));
    // Sans rythme (modèle rempli à la main), l'icône arrive comme avant, avec son segment.
    const plain = buildTop("Top", "9:16", TOP);
    const plainIcon = items(plain).find((item): item is ImageItem => item.type === "image" && item.source.ref === "test:icone-guepard")!;
    expect(plainIcon.start).toBeLessThan(icon.start);
  });

  it("pose des bruitages sur les temps forts seulement : accroche, révélation, fin", () => {
    for (const project of all(THEME)) {
      const sounds = beatSounds(project) as AudioItem[];
      expect(sounds.length).toBeGreaterThanOrEqual(2);
      expect(sounds.length).toBeLessThanOrEqual(MAX_BEAT_SOUNDS);
      expect(sounds.every((item) => item.volume === SFX_VOLUME && item.volume < 0.9)).toBe(true);
      expect(sounds[0].start).toBeLessThan(project.fps);
      // Jamais un son par élément : aucun bruitage à l'arrivée d'une icône.
      const icons = items(project).filter((item) => item.type === "image" && item.source.ref.startsWith("test:icone"));
      for (const icon of icons) expect(sounds.some((sound) => sound.start === icon.start)).toBe(false);
    }
    const top = buildFromTemplate("top", "Top", "9:16", TOP, THEME);
    const numberOne = segmentsOf(top).find((segment) => segment.cue.beat === "reveal")!;
    expect((beatSounds(top) as AudioItem[]).some((sound) => sound.start === numberOne.start && sound.label === "Bruitage – révélation")).toBe(true);
    const quiz = buildFromTemplate("quiz", "Quiz", "9:16", QUIZ, THEME);
    expect(beatSounds(quiz)).toHaveLength(3);
  });

  it("se règle par la marque : « calm » n'ajoute rien, un rythme inconnu n'existe pas", () => {
    expect(readPace("lively")).toBe("lively");
    expect(readPace("rapide")).toBeUndefined();
    const calm = buildFromTemplate("free", "Libre", "9:16", FREE, { ...THEME, pace: "calm" });
    expect(beatSounds(calm)).toHaveLength(0);
    expect(items(calm).some((item) => item.type === "text" && item.karaoke)).toBe(false);
    expect(items(calm).some((item) => (item.label ?? "").startsWith("Plan "))).toBe(false);
    // Le montage calme garde la mascotte et ses émotions (D2).
    expect(new Set(mascotItems(calm).map((item) => item.source.url)).size).toBeGreaterThanOrEqual(4);
  });

  it("ne change rien sans marque ni assistant, ni pour un thème d'avant", () => {
    for (const [built, plain] of [
      [buildFromTemplate("free", "Libre", "9:16", FREE), buildFree("Libre", "9:16", FREE)],
      [buildFromTemplate("quiz", "Quiz", "9:16", QUIZ), buildQuiz("Quiz", "9:16", QUIZ)],
      [buildFromTemplate("slideshow", "Diaporama", "9:16", SLIDESHOW), buildSlideshow("Diaporama", "9:16", SLIDESHOW)],
    ] as const) {
      expect(stable(built)).toEqual(stable(plain));
      expect(items(built).some((item) => item.cue || item.type === "audio" && item.duck !== undefined)).toBe(false);
      expect(built.tracks.some((track) => track.name === "Bruitages" || track.name.startsWith("Sous-titres") || track.effects?.length)).toBe(false);
    }
    // Un thème sans rythme (fait à la main, d'avant D3) : le montage d'avant, habillé.
    const legacy = buildFromTemplate("free", "Libre", "9:16", SAMPLE_FREE, BASE_THEME);
    expect(stable(legacy)).toEqual(stable(applyBrandTheme(buildFree("Libre", "9:16", SAMPLE_FREE), BASE_THEME)));
    // Un projet existant reçoit la marque sans plans découpés ni bruitages.
    const opened = applyBrandTheme(buildFree("Libre", "9:16", FREE), THEME);
    expect(beatSounds(opened)).toHaveLength(0);
    expect(items(opened).some((item) => (item.label ?? "").startsWith("Plan "))).toBe(false);
  });

  it("compte les coupes et les apparitions, pas les mots des sous-titres", () => {
    const project = buildFromTemplate("free", "Libre", "9:16", FREE, THEME);
    const captions = items(project).filter((item) => item.type === "text" && item.karaoke);
    const frames = changeFrames(project);
    for (const caption of captions) {
      const others = items(project).filter((item) => item !== caption && item.type !== "audio" && item.start === caption.start);
      if (others.length === 0) expect(frames).not.toContain(caption.start);
    }
  });
});

// ─── Bruitages et mixage ─────────────────────────────────────────

describe("banque de bruitages synthétisés", () => {
  it("rend chaque son à sa durée, sans saturer, en WAV lisible", () => {
    for (const id of SFX_IDS) {
      const samples = synthesizeSfx(id);
      expect(samples.length).toBe(Math.round((SFX_DURATION_MS[id] / 1000) * 44100));
      const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      expect(peak).toBeGreaterThan(0.6);
      expect(peak).toBeLessThanOrEqual(0.71);
      // Fin adoucie : pas de claquement à la coupure.
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.01);
      const wav = encodeWav(samples);
      expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
      expect(wav.length).toBe(44 + samples.length * 2);
    }
    // Recette fixe : le même son à chaque fois.
    expect(synthesizeSfx("impact")).toEqual(synthesizeSfx("impact"));
  });
});

describe("musique sous la voix", () => {
  it("s'efface pendant que la voix parle, environ 12 dB sous elle, et remonte entre les répliques", () => {
    const project = buildFromTemplate("free", "Libre", "9:16", FREE, THEME);
    const windows = voiceWindows(project);
    expect(windows.length).toBeGreaterThan(1);
    const end = (project.tracks.flatMap((track) => track.items).reduce((max, item) => Math.max(max, item.start + item.duration), 0)) / project.fps;
    const music: AudioItem = { id: "a-music", type: "audio", start: 0, duration: Math.round(end * project.fps), source: { url: "/m.mp3", ref: "test:music", name: "m", kind: "audio" }, trimStart: 0, volume: MUSIC_UNDER_VOICE.volume, duck: MUSIC_UNDER_VOICE.duck, fadeIn: 15, fadeOut: 45 };
    const points = gainPoints(music, project.fps, windows);
    const at = (t: number) => {
      const index = points.findIndex(([time]) => time >= t);
      if (index <= 0) return points[Math.max(0, index)][1];
      const [t0, g0] = points[index - 1];
      const [t1, g1] = points[index];
      return g0 + ((g1 - g0) * (t - t0)) / (t1 - t0);
    };
    const [from, to] = windows[1];
    const under = at((from + to) / 2);
    expect(under).toBeCloseTo(MUSIC_UNDER_VOICE.volume * MUSIC_UNDER_VOICE.duck, 5);
    expect(at(from - DUCK_ATTACK - 0.01)).toBeGreaterThan(under);
    // Musique de la banque vers −11 LUFS, voix de synthèse vers −16,5 LUFS à 0,9 : l'écart sous la voix.
    const gap = -16.5 + 20 * Math.log10(0.9) - (-11 + 20 * Math.log10(under));
    expect(gap).toBeGreaterThan(10.5);
    expect(gap).toBeLessThan(13.5);
    // Un son sans `duck` garde son volume.
    expect(gainPoints({ ...music, duck: undefined }, project.fps, windows).every(([t, gain]) => t < 0.5 || t > end - 1.5 || gain === music.volume)).toBe(true);
  });
});
