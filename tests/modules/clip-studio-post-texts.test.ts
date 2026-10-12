import { describe, expect, it } from "vitest";
import type { PublishField } from "@/lib/connections/types";
import { renderTemplate } from "@/lib/connections/templates";
import {
  appendHashtags,
  checkPostTexts,
  defaultHashtagRule,
  fieldValuesFor,
  firstCommentFor,
  fitText,
  postFromBrand,
  postRulesFor,
  projectSummary,
  resolvePostTexts,
  sanitizeExportPost,
  topicFrom,
} from "@/modules/clip-studio/lib/post-texts";
import { emptyPostTexts, type ExportPost, type PostTexts } from "@/modules/clip-studio/lib/post-types";
import { countText } from "@/lib/connections/limits";
import { projectCreditList, projectCredits, sanitizeCredits, unverifiedSources } from "@/modules/clip-studio/lib/credits";
import { groupCues, projectToSrt, srtTimestamp, validateSrt } from "@/modules/clip-studio/lib/subtitles";
import type { AudioItem, ClipProject, ImageItem, MediaSource, TextItem } from "@/modules/clip-studio/engine/types";

// Champs tels que les connecteurs les déclarent (dossiers 07 à 07c), rôles du dossier 01 ter, § 6.
const YOUTUBE: PublishField[] = [
  { key: "title", kind: "text", label: "Titre", role: "title", maxLength: 100, required: true },
  { key: "description", kind: "textarea", label: "Description", role: "description", maxLength: 5000, maxBytes: 5000 },
  { key: "tags", kind: "tags", label: "Tags", role: "tags", maxTotal: 500 },
  { key: "privacy", kind: "select", label: "Visibilité", role: "privacy", choices: [{ value: "private", label: "Privée" }] },
];
const INSTAGRAM: PublishField[] = [
  { key: "caption", kind: "textarea", label: "Légende", role: "caption", maxLength: 2200 },
  { key: "hashtags", kind: "tags", label: "Hashtags", role: "hashtags", maxTotal: 600 },
  {
    key: "cover",
    kind: "select",
    label: "Couverture",
    role: "cover",
    choices: [
      { value: "start", label: "Première image" },
      { value: "custom", label: "Couverture du clip" },
    ],
  },
];
const THREADS: PublishField[] = [
  { key: "text", kind: "textarea", label: "Texte", role: "caption", maxLength: 500 },
  { key: "topicTag", kind: "text", label: "Sujet", role: "topic", maxLength: 50 },
];
const FACEBOOK: PublishField[] = [
  { key: "title", kind: "text", label: "Titre", role: "title", maxLength: 255 },
  { key: "description", kind: "textarea", label: "Description", role: "description", maxLength: 63_206 },
];

const texts = (patch: Partial<PostTexts> = {}): PostTexts => ({
  ...emptyPostTexts(),
  title: "Cinq jeux à surveiller",
  description: "Les sorties qui comptent cette semaine.",
  caption: "Cinq jeux, cinq surprises.",
  firstComment: "Lequel attendez-vous ?",
  hashtags: ["jeuxvideo", "gaming"],
  tags: ["jeux vidéo", "sorties"],
  ...patch,
});

describe("textes de publication : résolution", () => {
  const post: ExportPost = {
    base: texts(),
    variants: { threads: { caption: "Version courte pour Threads." }, youtube: { hashtags: ["shorts"], firstComment: "" } },
    updatedAt: 1,
  };

  it("prend la variante du service, sinon le texte commun", () => {
    expect(resolvePostTexts(post, "threads").caption).toBe("Version courte pour Threads.");
    expect(resolvePostTexts(post, "threads").title).toBe("Cinq jeux à surveiller");
    expect(resolvePostTexts(post, "instagram")).toEqual(post.base);
    // Une chaîne vide est un choix : pas de premier commentaire sur YouTube.
    expect(resolvePostTexts(post, "youtube").firstComment).toBe("");
    expect(resolvePostTexts(post, "youtube").hashtags).toEqual(["shorts"]);
  });

  it("ne partage rien avec le jeu d'origine", () => {
    const resolved = resolvePostTexts(post, "instagram");
    resolved.hashtags.push("x");
    expect(post.base.hashtags).toEqual(["jeuxvideo", "gaming"]);
    expect(resolvePostTexts(null, "youtube")).toEqual(emptyPostTexts());
  });
});

describe("textes de publication : hashtags par service", () => {
  it("déduit la règle des champs du service", () => {
    expect(defaultHashtagRule(YOUTUBE)).toBe("description");
    expect(defaultHashtagRule(INSTAGRAM)).toBe("field");
    expect(defaultHashtagRule(THREADS)).toBe("topic");
    expect(defaultHashtagRule(FACEBOOK)).toBe("description");
    expect(defaultHashtagRule([])).toBe("none");
  });

  it("YouTube : hashtags en fin de description, tags cachés à part, titre tel quel", () => {
    const values = fieldValuesFor(YOUTUBE, texts(), postRulesFor("youtube", YOUTUBE));
    expect(values).toEqual({
      title: "Cinq jeux à surveiller",
      description: "Les sorties qui comptent cette semaine.\n\n#jeuxvideo #gaming",
      tags: ["jeux vidéo", "sorties"],
    });
    // Les champs sans rôle de texte (visibilité) ne sont pas touchés.
    expect(values).not.toHaveProperty("privacy");
  });

  it("Instagram : légende sans hashtags, hashtags dans leur champ, couverture du clip choisie", () => {
    const values = fieldValuesFor(INSTAGRAM, texts(), postRulesFor("instagram", INSTAGRAM, undefined, { hasCover: true }));
    expect(values).toEqual({ caption: "Cinq jeux, cinq surprises.", hashtags: ["jeuxvideo", "gaming"], cover: "custom" });
    expect(fieldValuesFor(INSTAGRAM, texts(), postRulesFor("instagram", INSTAGRAM)).cover).toBeUndefined();
  });

  it("Threads : un seul sujet, tiré du premier hashtag, sans « . » ni « & »", () => {
    const values = fieldValuesFor(THREADS, texts({ hashtags: ["Jeux&Co.", "autre"] }), postRulesFor("threads", THREADS));
    expect(values).toEqual({ text: "Cinq jeux, cinq surprises.", topicTag: "JeuxCo" });
    expect(topicFrom([])).toBe("");
  });

  it("la marque peut choisir une autre règle : légende, premier commentaire, aucun", () => {
    expect(fieldValuesFor(INSTAGRAM, texts(), postRulesFor("instagram", INSTAGRAM, "caption"))).toMatchObject({
      caption: "Cinq jeux, cinq surprises.\n\n#jeuxvideo #gaming",
      hashtags: [],
    });
    const rules = postRulesFor("instagram", INSTAGRAM, "firstComment");
    expect(firstCommentFor(texts(), rules)).toBe("Lequel attendez-vous ?\n\n#jeuxvideo #gaming");
    expect(fieldValuesFor(YOUTUBE, texts(), postRulesFor("youtube", YOUTUBE, "none")).description).toBe("Les sorties qui comptent cette semaine.");
    // Une règle inconnue reprend celle du service.
    expect(postRulesFor("threads", THREADS, "partout" as never).hashtagRule).toBe("topic");
  });

  it("n'ajoute pas un hashtag déjà écrit, et respecte le plafond du service", () => {
    expect(appendHashtags("Déjà #Gaming ici", ["gaming", "rpg"])).toBe("Déjà #Gaming ici\n\n#rpg");
    const many = Array.from({ length: 20 }, (_, index) => `tag${index}`);
    const description = fieldValuesFor(YOUTUBE, texts({ hashtags: many }), postRulesFor("youtube", YOUTUBE)).description as string;
    expect(description.match(/#/g)).toHaveLength(15);
    expect(appendHashtags("", ["#a b", "a", ""])).toBe("#ab #a");
  });

  it("sans champ de légende, la légende vit dans la description (et inversement)", () => {
    const values = fieldValuesFor(FACEBOOK, texts({ description: "" }), postRulesFor("facebook", FACEBOOK));
    expect(values.description).toBe("Cinq jeux, cinq surprises.\n\n#jeuxvideo #gaming");
  });
});

describe("textes de publication : limites", () => {
  it("compte les caractères, les octets, et signale un titre vide", () => {
    const problems = checkPostTexts(YOUTUBE, { title: "", description: "é".repeat(2600), tags: ["a"] }, { connectorId: "youtube" });
    expect(problems.map((problem) => problem.message)).toEqual([
      "Titre : à remplir.",
      "Description : 5 200 octets, 5 000 au plus (un accent ou un émoji en compte plusieurs).",
    ]);
  });

  it("Threads compte un émoji pour ses octets", () => {
    const text = `${"a".repeat(490)}😀😀😀`;
    expect(countText(text, "emoji-bytes")).toBe(502);
    const problems = checkPostTexts(THREADS, { text, topicTag: "" }, { connectorId: "threads" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ field: "text" });
    expect(problems[0].message).toContain("502");
    expect(checkPostTexts(THREADS, { text: "court", topicTag: "a.b" }, { connectorId: "threads" })[0].message).toBe("Sujet : ni « . » ni « & ».");
  });

  it("Instagram : 30 hashtags et 20 mentions, hashtags du champ compris", () => {
    const caption = `${Array.from({ length: 25 }, (_, index) => `#t${index}`).join(" ")} ${Array.from({ length: 21 }, (_, index) => `@m${index}`).join(" ")}`;
    const problems = checkPostTexts(INSTAGRAM, { caption, hashtags: ["x1", "x2", "x3", "x4", "x5", "x6"] }, { connectorId: "instagram" });
    expect(problems.map((problem) => problem.message)).toEqual([
      "Légende : 31 hashtags, 30 au plus (hashtags ajoutés compris).",
      "Légende : 21 mentions, 20 au plus.",
    ]);
    expect(checkPostTexts(INSTAGRAM, { caption: "#a #b", hashtags: ["a", "c"] }, { connectorId: "instagram" })).toEqual([]);
  });

  it("YouTube : au-delà de 15 hashtags, ils sont tous ignorés", () => {
    const description = Array.from({ length: 16 }, (_, index) => `#h${index}`).join(" ");
    const [problem] = checkPostTexts(YOUTUBE, { title: "T", description }, { connectorId: "youtube" });
    expect(problem.message).toBe("Description : 16 hashtags ; au-delà de 15, le service les ignore.");
  });

  it("tags cachés : total mesuré comme YouTube (guillemets d'un tag à espace)", () => {
    const tags = Array.from({ length: 50 }, (_, index) => `mot clé ${index}`);
    const problems = checkPostTexts(YOUTUBE, { title: "T", description: "", tags }, { connectorId: "youtube" });
    expect(problems[0].message).toMatch(/^Tags : .* caractères au total, 500 au plus\.$/);
  });

  it("recoupe un texte trop long à la fin d'une phrase", () => {
    const text = `${"Une phrase courte. ".repeat(40)}`;
    const fitted = fitText(text, 100);
    expect(fitted.length).toBeLessThanOrEqual(100);
    expect(fitted.endsWith(".")).toBe(true);
    const emoji = fitText("😀".repeat(200), 500, "emoji-bytes");
    expect(countText(emoji, "emoji-bytes")).toBeLessThanOrEqual(500);
    expect(fitText("court", 10)).toBe("court");
  });
});

describe("modèles : variables", () => {
  it("une variable vide emporte la ligne qu'elle laisserait vide", () => {
    const template = "{summary}\n\n{links}\n\nRegarde aussi : {cta}\n{credits}\n\n{hashtags}";
    expect(renderTemplate(template, { summary: "Résumé.", hashtags: ["a"] })).toBe("Résumé.\n\nRegarde aussi :\n\n#a");
    expect(
      renderTemplate(template, {
        summary: "Résumé.",
        cta: "Abonne-toi",
        links: [{ label: "Site", url: "https://exemple.fr" }, { url: "https://x.com/marque" }],
        credits: ["« A » par B, CC BY 4.0"],
      })
    ).toBe("Résumé.\n\nSite : https://exemple.fr\nhttps://x.com/marque\n\nRegarde aussi : Abonne-toi\nCrédits :\n– « A » par B, CC BY 4.0");
  });

  it("garde le comportement d'avant pour {tags} et les variables inconnues", () => {
    expect(renderTemplate("{brand} – {title} {inconnue}\n{tags}", { brand: "Riso", title: "Top 5", tags: ["anime", "jeu vidéo"] })).toBe("Riso – Top 5 {inconnue}\n#anime #jeuvidéo");
    expect(renderTemplate("{links}", { links: [{ label: "Site", url: "https://a.fr" }], language: "en" })).toBe("Site: https://a.fr");
  });
});

describe("jeu de textes tiré de la marque", () => {
  const settings = {
    titleTemplate: "{title} | {brand}",
    descriptionTemplate: "{summary}\n\n{links}",
    captionTemplate: "{title}\n\n{cta}",
    firstCommentTemplate: "",
    serviceTemplates: { threads: { captionTemplate: "{title}" }, youtube: { titleTemplate: "{title} | {brand}" } },
    hashtags: ["anime"],
    tags: ["anime", "jeu vidéo"],
    links: [{ label: "Site", url: "https://exemple.fr" }],
  };

  it("remplit les modèles communs, et ne garde des services que ce qui diffère", () => {
    const post = postFromBrand(settings, { title: "Top 5", summary: "Cinq sorties.", cta: "Abonne-toi", brand: "Riso", credits: ["« A » par B, CC BY 4.0", "Voix X"] }, 42);
    expect(post.base).toEqual({
      title: "Top 5 | Riso",
      // Le modèle ne cite pas {credits} : les crédits CC BY sont ajoutés quand même.
      description: "Cinq sorties.\n\nSite : https://exemple.fr\n\nCrédits :\n– « A » par B, CC BY 4.0",
      caption: "Top 5\n\nAbonne-toi",
      firstComment: "",
      hashtags: ["anime"],
      tags: ["anime", "jeu vidéo"],
    });
    expect(post.variants).toEqual({ threads: { caption: "Top 5" } });
    expect(post.updatedAt).toBe(42);
  });

  it("sans marque : le nom du projet et les crédits", () => {
    const post = postFromBrand(null, { title: "Mon clip", credits: ["Voix X"] }, 1);
    expect(post.base).toMatchObject({ title: "Mon clip", caption: "Mon clip", description: "Crédits :\n– Voix X", hashtags: [] });
  });
});

describe("jeu de textes reçu du navigateur", () => {
  const known = ["youtube", "instagram", "threads"];

  it("borne les textes, nettoie les listes et ne garde des variantes que ce qui diffère", () => {
    const post = sanitizeExportPost(
      {
        base: { title: "T".repeat(900), description: "a\u0000b\r\nc", caption: 3, hashtags: ["#Un", "un", "deux mots", 5], tags: ["  a  ", "A", ""] },
        variants: { threads: { caption: "court", title: "T".repeat(500) }, instagram: {} },
        unreviewed: ["base.title", "threads.caption", "x.title", "base.inconnu"],
        evil: true,
      },
      known,
      7
    );
    expect(post.base.title).toHaveLength(500);
    expect(post.base.description).toBe("ab\nc");
    expect(post.base.caption).toBe("3");
    expect(post.base.hashtags).toEqual(["Un", "deuxmots"]);
    expect(post.base.tags).toEqual(["a"]);
    expect(post.variants).toEqual({ threads: { caption: "court" } });
    expect(post.unreviewed).toEqual(["base.title", "threads.caption"]);
    expect(post.updatedAt).toBe(7);
    expect(post).not.toHaveProperty("evil");
  });

  it("refuse un service inconnu, trop de variantes et un jeu qui n'en est pas un", () => {
    expect(() => sanitizeExportPost({ base: {}, variants: { myspace: { title: "x" } } }, known)).toThrow("Service inconnu");
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`s${index}`, {}]));
    expect(() => sanitizeExportPost({ base: {}, variants: many }, Object.keys(many))).toThrow("20 variantes au plus");
    expect(() => sanitizeExportPost(null, known)).toThrow("invalides");
  });
});

// ─── Projet d'exemple : crédits, sous-titres, résumé ─────────────

const source = (name: string, extra: Partial<MediaSource> = {}): MediaSource => ({ url: `/api/modules/clip-studio/data/assets/${name}`, ref: `module:clip-studio/assets/${name}`, name, kind: "image", ...extra });
const base = { transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 }, animIn: { kind: "none" }, animOut: { kind: "none" } } as unknown as Omit<ImageItem, "id" | "type" | "start" | "duration" | "source" | "fit" | "motion" | "radius">;
const image = (id: string, start: number, src: MediaSource): ImageItem => ({ ...base, id, type: "image", start, duration: 30, source: src, fit: "cover", motion: { kind: "none" } as never, radius: 0 });
const audio = (id: string, start: number, src: MediaSource, trimStart = 0, duration = 300): AudioItem => ({ id, type: "audio", start, duration, source: src, trimStart, volume: 1, fadeIn: 0, fadeOut: 0 });
const text = (id: string, start: number, value: string, extra: Partial<TextItem> = {}): TextItem => ({ ...(base as object), id, type: "text", start, duration: 30, text: value, style: {} as never, ...extra }) as TextItem;

function project(tracks: ClipProject["tracks"], extra: Partial<ClipProject> = {}): ClipProject {
  return { version: 1, id: "clip-test", name: "Test", aspect: "9:16", width: 1080, height: 1920, fps: 30, background: "#000", tracks, createdAt: 1, updatedAt: 2, ...extra } as ClipProject;
}

const WORDS = [
  { text: "Bonjour", startMs: 0, endMs: 400 },
  { text: "à", startMs: 450, endMs: 500 },
  { text: "tous.", startMs: 520, endMs: 900 },
  { text: "Voici", startMs: 2000, endMs: 2300 },
  { text: "la", startMs: 2320, endMs: 2400 },
  { text: "suite", startMs: 2420, endMs: 2800 },
];

describe("crédits du projet", () => {
  it("relève musiques, voix, images trouvées et images générées, sans doublon", () => {
    const clip = project([
      {
        id: "v",
        kind: "visual",
        name: "Images",
        items: [
          image("i1", 0, source("found.jpg", { credit: "« Zelda » par Nintendo, droits à vérifier", rights: "unverified" })),
          image("i2", 30, source("gen.png", { ref: "module:ai-image-gen/images/gen.png" })),
          image("i3", 60, source("gen2.png", { url: "/api/modules/ai-image-gen/data/images/gen2.png" })),
          image("i4", 90, source("found.jpg", { credit: "« Zelda » par Nintendo, droits à vérifier", rights: "unverified" })),
        ],
      },
      {
        id: "a",
        kind: "audio",
        name: "Sons",
        items: [
          audio("a1", 0, source("voice.wav", { kind: "audio", credit: "Voix Siwis : SIWIS, CC BY 4.0", words: WORDS })),
          audio("a2", 0, source("music.mp3", { kind: "audio", credit: "« Sunrise » par Artiste, CC BY 4.0" })),
        ],
      },
    ]);
    expect(projectCreditList(clip)).toEqual([
      { text: "« Zelda » par Nintendo, droits à vérifier", kind: "image", unverified: true },
      { text: "Voix Siwis : SIWIS, CC BY 4.0", kind: "voice" },
      { text: "« Sunrise » par Artiste, CC BY 4.0", kind: "music" },
      { text: "Illustrations générées par IA", kind: "generated" },
    ]);
    expect(projectCredits(clip, "en").at(-1)).toBe("AI-generated illustrations");
    expect(unverifiedSources(clip)).toEqual(["found.jpg"]);
    expect(projectCredits(null)).toEqual([]);
    expect(sanitizeCredits(["a\nb", "a b", 3, ""])).toEqual(["a b"]);
  });
});

describe("sous-titres SubRip", () => {
  it("écrit les horodatages avec la virgule des millisecondes", () => {
    expect(srtTimestamp(0)).toBe("00:00:00,000");
    expect(srtTimestamp(3_723_045)).toBe("01:02:03,045");
    expect(srtTimestamp(-5)).toBe("00:00:00,000");
  });

  it("tire les lignes des mots de la voix off, coupées à la ponctuation et aux silences", () => {
    // La voix commence à 1 s dans le projet, rognée de 15 images (0,5 s) : « Bonjour » est coupé.
    const clip = project([{ id: "a", kind: "audio", name: "Voix", items: [audio("a1", 30, source("v.wav", { kind: "audio", words: WORDS }), 15)] }]);
    expect(projectToSrt(clip)).toBe("1\n00:00:01,020 --> 00:00:01,720\ntous.\n\n2\n00:00:02,500 --> 00:00:03,300\nVoici la suite\n");
  });

  it("préfère les sous-titres animés du projet, et suit la plage exportée", () => {
    const caption = text("t1", 60, "", { karaoke: { words: WORDS, offset: 0, highlight: "#fff", groupSize: 3 }, duration: 120 });
    const clip = project([
      { id: "v", kind: "visual", name: "Textes", items: [caption] },
      { id: "a", kind: "audio", name: "Voix", items: [audio("a1", 0, source("v.wav", { kind: "audio", words: [{ text: "Ignoré", startMs: 0, endMs: 100 }] }))] },
    ]);
    const srt = projectToSrt(clip);
    expect(srt).toBe("1\n00:00:02,000 --> 00:00:02,900\nBonjour à tous.\n\n2\n00:00:04,000 --> 00:00:04,800\nVoici la suite\n");
    expect(projectToSrt(clip, { range: { fromMs: 2500, toMs: 4500 } })).toBe("1\n00:00:00,000 --> 00:00:00,400\nBonjour à tous.\n\n2\n00:00:01,500 --> 00:00:02,000\nVoici la suite\n");
    expect(validateSrt(srt)).toBe(srt);
  });

  it("coupe une longue phrase en lignes courtes, sans chevauchement", () => {
    const words = Array.from({ length: 20 }, (_, index) => ({ text: `mot${index}`, startMs: index * 100, endMs: index * 100 + 90 }));
    const cues = groupCues(words);
    expect(cues.length).toBeGreaterThan(2);
    for (const cue of cues) expect(cue.text.length).toBeLessThanOrEqual(42);
    for (let index = 1; index < cues.length; index++) expect(cues[index].startMs).toBeGreaterThanOrEqual(cues[index - 1].endMs);
  });

  it("sans mot minuté : aucun fichier", () => {
    expect(projectToSrt(project([]))).toBe("");
  });

  it("refuse un fichier mal formé ou trop lourd", () => {
    expect(() => validateSrt("pas un srt")).toThrow("bloc mal formé");
    expect(() => validateSrt("1\n00:00:01.000 --> 00:00:02,000\nx")).toThrow("bloc mal formé");
    expect(() => validateSrt("1\n00:00:01,000 --> 00:00:02,000\n<script>x</script>")).toThrow("balise refusée");
    expect(() => validateSrt("x".repeat(600 * 1024))).toThrow("trop lourds");
    expect(validateSrt("﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nSalut\r\n")).toBe("1\n00:00:01,000 --> 00:00:02,000\nSalut\n");
  });
});

describe("résumé du clip", () => {
  it("prend le script de l'assistant, sinon les textes du clip", () => {
    expect(projectSummary(project([], { brief: { prompt: "p", script: ["Premier point", "Second point !"] } }))).toBe("Premier point. Second point !");
    const clip = project([{ id: "v", kind: "visual", name: "Textes", items: [text("t2", 30, "Deux"), text("t1", 0, "Un"), text("t3", 60, "Un"), text("t4", 90, "Marque", { origin: "brand" })] }]);
    expect(projectSummary(clip)).toBe("Un. Deux.");
    expect(projectSummary(null)).toBe("");
  });
});
