/**
 * Textes de publication d'un export (dossier 01 ter, § 4) : résolution par
 * service, valeurs des champs d'un connecteur, règle des hashtags, contrôle
 * des limites et jeu tiré de l'image de marque.
 *
 * Fonctions pures, les mêmes dans le navigateur (fiche d'un export, écran
 * Publier) et sur le serveur (`publishExport`, assistant) : ce que l'écran
 * montre est ce qui part.
 */

import type { PublishField, TextCount } from "@/lib/connections/types";
import { countText } from "@/lib/connections/limits";
import {
  byteLength,
  creditsBlock,
  creditsRequiringAttribution,
  appendCredits,
  hashtagWord,
  renderTemplate,
  usesVariable,
  type TemplateLink,
  type TemplateVariables,
} from "@/lib/connections/templates";
import type { ClipProject } from "../engine/types";
import {
  HASHTAG_RULES,
  POST_TEXT_FIELDS,
  POST_TEXT_KINDS,
  emptyPostTexts,
  type ExportPost,
  type HashtagRule,
  type PostTextField,
  type PostTexts,
} from "./post-types";

// ─── Rôles des champs ────────────────────────────────────────────

/**
 * Rôles lus ici. Le cœur ajoute `caption`, `firstComment`, `hashtags`,
 * `cover` et `subtitles` à `PublishFieldRole` (dossier 01 ter, § 6) : la
 * comparaison se fait sur la chaîne, pour rester juste avant comme après.
 */
type FieldRole = NonNullable<PublishField["role"]> | "caption" | "firstComment" | "hashtags" | "cover" | "subtitles";

const roleOf = (field: PublishField): FieldRole | undefined => field.role as FieldRole | undefined;

// ─── Règles des services ─────────────────────────────────────────

/** Ce qu'un service impose aux textes, au-delà des longueurs de ses champs. */
export interface ServiceTextRules {
  /** Hashtags au plus dans le texte publié, ceux ajoutés compris. */
  maxHashtags?: number;
  /** Ce qui arrive au-delà : refus de la publication, ou hashtags tous ignorés. */
  hashtagOverflow?: "refused" | "ignored";
  /** Mentions (@compte) au plus. */
  maxMentions?: number;
  /** Mesure des textes (voir `TextCount`) ; absente : en caractères. */
  count?: TextCount;
  /** Caractères refusés dans le sujet. */
  topicForbidden?: RegExp;
  /** Mesure des tags cachés : YouTube compte les guillemets d'un tag qui contient une espace. */
  quotedTags?: boolean;
}

/**
 * Règles documentées par les services (dossiers 07 à 07c) :
 * - YouTube : au-delà de 15 hashtags, YouTube les ignore tous ;
 * - Instagram : 30 hashtags et 20 mentions par légende ;
 * - Threads : un seul sujet, sans « . » ni « & », un émoji comptant pour ses octets.
 */
export const SERVICE_TEXT_RULES: Record<string, ServiceTextRules> = {
  youtube: { maxHashtags: 15, hashtagOverflow: "ignored", quotedTags: true },
  instagram: { maxHashtags: 30, hashtagOverflow: "refused", maxMentions: 20 },
  threads: { count: "emoji-bytes", maxHashtags: 1, hashtagOverflow: "ignored", topicForbidden: /[.&]/ },
};

/** Règle des hashtags d'un service, d'après ses champs. */
export function defaultHashtagRule(fields: PublishField[]): HashtagRule {
  const roles = new Set(fields.map(roleOf));
  if (roles.has("hashtags")) return "field";
  if (roles.has("topic")) return "topic";
  if (roles.has("caption")) return "caption";
  if (roles.has("description")) return "description";
  return "none";
}

export const isHashtagRule = (value: unknown): value is HashtagRule => HASHTAG_RULES.includes(value as HashtagRule);

export const HASHTAG_RULE_LABELS: Record<HashtagRule, string> = {
  description: "À la fin de la description",
  caption: "À la fin de la légende",
  firstComment: "Dans le premier commentaire",
  field: "Dans leur champ",
  topic: "Le premier comme sujet",
  none: "Aucun",
};

/** Règles retenues pour publier sur un service. */
export interface PostRules {
  /** Où vont les hashtags ; absente : la règle déduite des champs du service. */
  hashtagRule?: HashtagRule;
  /** Hashtags au plus dans le texte qui les reçoit. */
  maxHashtags?: number;
  /** L'export a une couverture : le champ « couverture » la choisit. */
  hasCover?: boolean;
  /** L'export a des sous-titres : le champ « sous-titres » les joint. */
  hasSubtitles?: boolean;
}

/** Règles d'un service : celles de la marque d'abord, puis celles du service. */
export function postRulesFor(connectorId: string, fields: PublishField[], brandRule?: HashtagRule | null, extra: Pick<PostRules, "hasCover" | "hasSubtitles"> = {}): PostRules {
  const service = SERVICE_TEXT_RULES[connectorId] ?? {};
  return {
    hashtagRule: brandRule && isHashtagRule(brandRule) ? brandRule : defaultHashtagRule(fields),
    maxHashtags: service.maxHashtags,
    ...extra,
  };
}

// ─── Résolution ──────────────────────────────────────────────────

/** Copie bornée d'un jeu de textes, sans rien partager avec l'original. */
function copyTexts(texts: PostTexts): PostTexts {
  return { ...texts, hashtags: [...texts.hashtags], tags: [...texts.tags] };
}

/** Textes d'un service : sa variante, sinon le texte commun, sorte par sorte. */
export function resolvePostTexts(post: ExportPost | null | undefined, connectorId: string): PostTexts {
  const base = copyTexts({ ...emptyPostTexts(), ...(post?.base ?? {}) });
  const variant = post?.variants?.[connectorId];
  if (!variant) return base;
  const resolved = { ...base } as PostTexts;
  for (const field of POST_TEXT_FIELDS) {
    const value = variant[field];
    if (value === undefined) continue;
    (resolved as unknown as Record<PostTextField, unknown>)[field] = Array.isArray(value) ? [...value] : value;
  }
  return resolved;
}

// ─── Hashtags ────────────────────────────────────────────────────

const HASHTAG = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]+)/gu;
const MENTION = /(?:^|[^\p{L}\p{N}_])@[A-Za-z0-9._]+/gu;

/** Hashtags écrits dans un texte, sans « # », en minuscules. */
export function hashtagsIn(text: string): string[] {
  return Array.from(String(text ?? "").matchAll(HASHTAG), (match) => match[1].toLowerCase());
}

export const countHashtags = (text: string) => hashtagsIn(text).length;
export const countMentions = (text: string) => (String(text ?? "").match(MENTION) ?? []).length;

/** Mots-dièse nettoyés : sans « # », sans espace, sans doublon. */
export function cleanHashtags(list: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== "string") continue;
    const word = hashtagWord(raw).replace(/[^\p{L}\p{N}_]/gu, "");
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

/**
 * Ajoute en fin de texte, après une ligne blanche, les hashtags qui n'y sont
 * pas déjà, sans dépasser `max` hashtags au total dans le texte.
 */
export function appendHashtags(text: string, list: string[], max = Infinity): string {
  const body = String(text ?? "").trimEnd();
  const present = new Set(hashtagsIn(body));
  let room = Math.max(0, max - present.size);
  const added: string[] = [];
  for (const word of cleanHashtags(list)) {
    if (room <= 0) break;
    if (present.has(word.toLowerCase())) continue;
    present.add(word.toLowerCase());
    added.push(`#${word}`);
    room--;
  }
  if (added.length === 0) return body;
  return body ? `${body}\n\n${added.join(" ")}` : added.join(" ");
}

/** Sujet Threads : le premier hashtag, sans « . » ni « & », 50 caractères au plus. */
export function topicFrom(list: string[]): string {
  const first = cleanHashtags(list)[0] ?? "";
  return Array.from(first.replace(/[.&]/g, "")).slice(0, 50).join("");
}

// ─── Valeurs des champs ──────────────────────────────────────────

/**
 * Valeurs des champs de texte d'un connecteur, par rôle : titre,
 * description, légende, premier commentaire, hashtags, tags, sujet ; puis
 * couverture et sous-titres quand l'export en a. Les autres champs
 * (catégorie, visibilité…) ne sont pas touchés : ils viennent de la marque
 * ou de l'écran.
 */
export function fieldValuesFor(fields: PublishField[], texts: PostTexts, rules: PostRules = {}): Record<string, unknown> {
  const rule = rules.hashtagRule ?? defaultHashtagRule(fields);
  const max = rules.maxHashtags ?? Infinity;
  const roles = new Set(fields.map(roleOf));
  const hashtags = cleanHashtags(texts.hashtags);
  // Sans champ de légende, la légende vit dans la description, et inversement.
  const hashtagsInDescription = rule === "description" || (rule === "caption" && !roles.has("caption"));
  const hashtagsInCaption = rule === "caption" || (rule === "description" && !roles.has("description"));

  const values: Record<string, unknown> = {};
  for (const field of fields) {
    switch (roleOf(field)) {
      case "title":
        values[field.key] = texts.title;
        break;
      case "description": {
        const text = texts.description || (roles.has("caption") ? "" : texts.caption);
        values[field.key] = hashtagsInDescription ? appendHashtags(text, hashtags, max) : text;
        break;
      }
      case "caption": {
        const text = texts.caption || (roles.has("description") ? "" : texts.description);
        values[field.key] = hashtagsInCaption ? appendHashtags(text, hashtags, max) : text;
        break;
      }
      case "firstComment":
        values[field.key] = rule === "firstComment" ? appendHashtags(texts.firstComment, hashtags, max) : texts.firstComment;
        break;
      case "hashtags":
        values[field.key] = rule === "field" ? hashtags.slice(0, Number.isFinite(max) ? max : undefined) : [];
        break;
      case "tags":
        values[field.key] = [...texts.tags];
        break;
      case "topic":
        values[field.key] = rule === "topic" ? topicFrom(hashtags) : "";
        break;
      case "cover":
        if (rules.hasCover && field.kind === "select" && field.choices.some((choice) => choice.value === "custom")) values[field.key] = "custom";
        if (field.kind === "toggle") values[field.key] = rules.hasCover === true;
        break;
      case "subtitles":
        if (field.kind === "toggle") values[field.key] = rules.hasSubtitles === true;
        break;
    }
  }
  return values;
}

/** Le premier commentaire d'un service, hashtags compris quand ils y vont. */
export function firstCommentFor(texts: PostTexts, rules: PostRules = {}): string {
  const text = rules.hashtagRule === "firstComment" ? appendHashtags(texts.firstComment, texts.hashtags, rules.maxHashtags) : texts.firstComment;
  return text.trim();
}

// ─── Limites ─────────────────────────────────────────────────────

export interface PostTextProblem {
  /** Clé du champ concerné. */
  field: string;
  /** Phrase complète, prête à afficher. */
  message: string;
}

const numberFormat = new Intl.NumberFormat("fr-FR");
const formatNumber = (value: number) => numberFormat.format(value);

/** Longueur totale des tags cachés, comme le service la compte. */
export function measureTags(tags: string[], quoted = false): number {
  return tags.reduce((total, tag, index) => total + Array.from(tag).length + (quoted && /\s/.test(tag) ? 2 : 0) + (index > 0 ? 1 : 0), 0);
}

/**
 * Dépassements des limites d'un service, en lignes lisibles : longueur en
 * caractères (comptés comme le service les compte) ou en octets, champ
 * obligatoire vide, nombre de hashtags et de mentions, sujet invalide.
 */
export function checkPostTexts(
  fields: PublishField[],
  values: Record<string, unknown>,
  options: { connectorId?: string; count?: TextCount } = {}
): PostTextProblem[] {
  const service = (options.connectorId ? SERVICE_TEXT_RULES[options.connectorId] : undefined) ?? {};
  const count = options.count ?? service.count ?? "characters";
  const problems: PostTextProblem[] = [];
  const push = (field: PublishField, message: string) => problems.push({ field: field.key, message: `${field.label} : ${message}` });

  for (const field of fields) {
    const value = values[field.key];
    if (field.kind === "text" || field.kind === "textarea") {
      const text = typeof value === "string" ? value : "";
      if (field.kind === "text" && field.required && !text.trim()) push(field, "à remplir.");
      const used = countText(text, count);
      if (used > field.maxLength && !(field.maxBytes && field.maxBytes === field.maxLength)) {
        const unit = count === "characters" ? "caractères" : "caractères comptés comme le service les compte";
        push(field, `${formatNumber(used)} ${unit}, ${formatNumber(field.maxLength)} au plus.`);
      }
      if (field.maxBytes) {
        const bytes = byteLength(text);
        if (bytes > field.maxBytes) push(field, `${formatNumber(bytes)} octets, ${formatNumber(field.maxBytes)} au plus (un accent ou un émoji en compte plusieurs).`);
      }
      if (roleOf(field) === "topic" && text && service.topicForbidden?.test(text)) push(field, "ni « . » ni « & ».");
    } else if (field.kind === "tags" && Array.isArray(value)) {
      const list = value.filter((entry): entry is string => typeof entry === "string");
      const total = measureTags(list, service.quotedTags);
      if (total > field.maxTotal) push(field, `${formatNumber(total)} caractères au total, ${formatNumber(field.maxTotal)} au plus.`);
    }
  }

  // Hashtags et mentions : comptés sur le texte tel qu'il sera publié, ajouts compris.
  if (service.maxHashtags !== undefined || service.maxMentions !== undefined) {
    const textFields = fields.filter((field) => {
      const role = roleOf(field);
      return (field.kind === "text" || field.kind === "textarea") && (role === "title" || role === "description" || role === "caption");
    });
    const hashtagField = fields.find((field) => roleOf(field) === "hashtags");
    const extra = hashtagField && Array.isArray(values[hashtagField.key]) ? cleanHashtags(values[hashtagField.key]) : [];
    const target = textFields.find((field) => roleOf(field) === "caption") ?? textFields.find((field) => roleOf(field) === "description") ?? textFields[0];
    if (target) {
      const texts = textFields.map((field) => (typeof values[field.key] === "string" ? (values[field.key] as string) : ""));
      const tags = new Set([...texts.flatMap(hashtagsIn), ...extra.map((word) => word.toLowerCase())]);
      if (service.maxHashtags !== undefined && tags.size > service.maxHashtags) {
        push(
          target,
          service.hashtagOverflow === "ignored"
            ? `${formatNumber(tags.size)} hashtags ; au-delà de ${formatNumber(service.maxHashtags)}, le service les ignore.`
            : `${formatNumber(tags.size)} hashtags, ${formatNumber(service.maxHashtags)} au plus (hashtags ajoutés compris).`
        );
      }
      const mentions = texts.reduce((sum, text) => sum + countMentions(text), 0);
      if (service.maxMentions !== undefined && mentions > service.maxMentions) {
        push(target, `${formatNumber(mentions)} mentions, ${formatNumber(service.maxMentions)} au plus.`);
      }
    }
  }
  return problems;
}

/**
 * Coupe un texte pour qu'il tienne en `max` (mesuré comme le service), de
 * préférence à la fin d'une phrase, sinon d'un mot, avec « … ».
 */
export function fitText(text: string, max: number, count: TextCount = "characters"): string {
  const value = String(text ?? "").trim();
  if (countText(value, count) <= max) return value;
  const chars = Array.from(value);
  let low = 0;
  let high = chars.length;
  // Plus long préfixe qui tient avec « … » : la mesure n'est pas forcément linéaire (émojis).
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (countText(`${chars.slice(0, middle).join("").trimEnd()}…`, count) <= max) low = middle;
    else high = middle - 1;
  }
  const prefix = chars.slice(0, low).join("");
  const sentence = prefix.search(/[.!?…](?=[^.!?…]*$)/);
  if (sentence > prefix.length * 0.5) return prefix.slice(0, sentence + 1).trimEnd();
  const space = prefix.lastIndexOf(" ");
  const cut = space > prefix.length * 0.5 ? prefix.slice(0, space) : prefix;
  return `${cut.replace(/[\s,;:–-]+$/u, "")}…`;
}

// ─── Jeu tiré de l'image de marque ───────────────────────────────

/** Modèles d'un service : seulement ce qui diffère des modèles communs. */
export interface ServicePostTemplates {
  titleTemplate?: string;
  descriptionTemplate?: string;
  captionTemplate?: string;
  firstCommentTemplate?: string;
  hashtagRule?: HashtagRule;
}

/** Ce que l'image de marque apporte aux textes (`BrandPublishing`). */
export interface BrandPostSettings {
  titleTemplate: string;
  descriptionTemplate: string;
  captionTemplate?: string;
  firstCommentTemplate?: string;
  serviceTemplates?: Record<string, ServicePostTemplates>;
  hashtags?: string[];
  tags: string[];
  links?: TemplateLink[];
}

const TEMPLATE_OF: Record<(typeof POST_TEXT_KINDS)[number], keyof ServicePostTemplates & keyof BrandPostSettings> = {
  title: "titleTemplate",
  description: "descriptionTemplate",
  caption: "captionTemplate",
  firstComment: "firstCommentTemplate",
};

/**
 * Une description : le modèle rempli, puis les crédits qui exigent
 * l'attribution quand le modèle ne cite pas `{credits}` (une licence CC BY
 * ne se négocie pas).
 */
function renderDescription(template: string, variables: TemplateVariables): string {
  const text = renderTemplate(template, variables);
  if (usesVariable(template, "credits")) return text;
  return appendCredits(text, creditsRequiringAttribution(variables.credits ?? []));
}

function renderKind(kind: (typeof POST_TEXT_KINDS)[number], template: string, variables: TemplateVariables): string {
  if (kind === "description") return renderDescription(template, variables);
  if (kind === "title") return renderTemplate(template || "{title}", variables) || (variables.title ?? "");
  return renderTemplate(template, variables);
}

/**
 * Jeu de textes tiré de la marque : modèles communs, puis variantes des
 * services dont la marque a des modèles propres (seulement ce qui diffère).
 * Sans marque : le nom du projet en titre et en légende, les crédits en
 * description.
 */
export function postFromBrand(settings: BrandPostSettings | null | undefined, variables: TemplateVariables, now = Date.now()): ExportPost {
  if (!settings) {
    const credits = creditsBlock(variables.credits, variables.language);
    return {
      base: { ...emptyPostTexts(), title: variables.title ?? "", caption: variables.title ?? "", description: credits },
      variants: {},
      updatedAt: now,
    };
  }
  const hashtags = cleanHashtags(settings.hashtags ?? settings.tags);
  const filled: TemplateVariables = { ...variables, hashtags, tags: settings.tags, links: settings.links ?? variables.links };
  const base: PostTexts = {
    title: renderKind("title", settings.titleTemplate, filled),
    description: renderKind("description", settings.descriptionTemplate, filled),
    caption: renderKind("caption", settings.captionTemplate ?? "", filled),
    firstComment: renderKind("firstComment", settings.firstCommentTemplate ?? "", filled),
    hashtags,
    tags: [...settings.tags],
  };
  const variants: Record<string, Partial<PostTexts>> = {};
  for (const [connectorId, templates] of Object.entries(settings.serviceTemplates ?? {})) {
    const variant: Partial<PostTexts> = {};
    for (const kind of POST_TEXT_KINDS) {
      const template = templates?.[TEMPLATE_OF[kind]];
      if (typeof template !== "string") continue;
      const value = renderKind(kind, template, filled);
      if (value !== base[kind]) variant[kind] = value;
    }
    if (Object.keys(variant).length > 0) variants[connectorId] = variant;
  }
  return { base, variants, updatedAt: now };
}

/** Règles des hashtags choisies par la marque, par service. */
export function hashtagRulesOf(settings: BrandPostSettings | null | undefined): Record<string, HashtagRule> {
  const rules: Record<string, HashtagRule> = {};
  for (const [connectorId, templates] of Object.entries(settings?.serviceTemplates ?? {})) {
    if (isHashtagRule(templates?.hashtagRule)) rules[connectorId] = templates.hashtagRule;
  }
  return rules;
}

// ─── Variables tirées du projet ──────────────────────────────────

const SUMMARY_MAX = 300;

/**
 * Résumé du clip pour `{summary}` : le script de l'assistant, sinon les
 * textes posés dans le clip, dans l'ordre d'apparition, coupés à la fin
 * d'une phrase vers 300 caractères.
 */
export function projectSummary(project: Pick<ClipProject, "brief" | "tracks"> | null | undefined): string {
  if (!project) return "";
  let lines = (project.brief?.script ?? []).map((line) => String(line ?? "").trim()).filter(Boolean);
  if (lines.length === 0) {
    const texts = project.tracks
      .flatMap((track) => track.items)
      .filter((item) => item.type === "text" && !item.karaoke && item.origin !== "brand")
      .sort((a, b) => a.start - b.start)
      .map((item) => (item.type === "text" ? item.text.replace(/\s+/g, " ").trim() : ""))
      .filter(Boolean);
    lines = [...new Set(texts)];
  }
  // Une ligne sans ponctuation finale est fermée, pour que le résumé se lise d'une traite.
  const joined = lines.map((line) => (/[.!?…:]$/.test(line) ? line : `${line}.`)).join(" ");
  return fitText(joined, SUMMARY_MAX);
}

// ─── Validation d'un jeu reçu du navigateur ──────────────────────

/** Bornes d'un jeu de textes : larges, les limites de chaque service sont contrôlées à part. */
export const POST_LIMITS = {
  title: 500,
  description: 20_000,
  caption: 5000,
  firstComment: 5000,
  hashtags: 60,
  hashtag: 100,
  tags: 100,
  tag: 100,
  variants: 20,
  unreviewed: 200,
} as const;

/** Texte affichable : sans caractère de contrôle autre que le saut de ligne et la tabulation. */
function cleanPostText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\s+$/u, "")
    .slice(0, max);
}

function cleanTags(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (typeof raw !== "string") continue;
    const tag = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, POST_LIMITS.tag);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= POST_LIMITS.tags) break;
  }
  return out;
}

function cleanField(field: PostTextField, value: unknown): string | string[] {
  if (field === "hashtags") return cleanHashtags(value).map((word) => word.slice(0, POST_LIMITS.hashtag)).slice(0, POST_LIMITS.hashtags);
  if (field === "tags") return cleanTags(value);
  return cleanPostText(value, POST_LIMITS[field]);
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Jeu de textes reçu du navigateur, borné : longueurs, nombre de variantes,
 * services connus seulement, champs « à relire » de forme connue. Une
 * variante ne garde que ce qui diffère du texte commun.
 */
export function sanitizeExportPost(input: unknown, knownConnectors: readonly string[], now = Date.now()): ExportPost {
  if (!input || typeof input !== "object") throw new Error("Textes de publication invalides.");
  const raw = input as Record<string, unknown>;
  const rawBase = (raw.base && typeof raw.base === "object" ? raw.base : {}) as Record<string, unknown>;
  const base = emptyPostTexts();
  for (const field of POST_TEXT_FIELDS) (base as unknown as Record<string, unknown>)[field] = cleanField(field, rawBase[field]);

  const known = new Set(knownConnectors);
  const variants: Record<string, Partial<PostTexts>> = {};
  const rawVariants = raw.variants && typeof raw.variants === "object" && !Array.isArray(raw.variants) ? (raw.variants as Record<string, unknown>) : {};
  const entries = Object.entries(rawVariants);
  if (entries.length > POST_LIMITS.variants) throw new Error(`${POST_LIMITS.variants} variantes au plus.`);
  for (const [connectorId, value] of entries) {
    if (!known.has(connectorId)) throw new Error(`Service inconnu : ${connectorId.slice(0, 40)}.`);
    if (!value || typeof value !== "object") continue;
    const variant: Partial<PostTexts> = {};
    for (const field of POST_TEXT_FIELDS) {
      const fieldValue = (value as Record<string, unknown>)[field];
      if (fieldValue === undefined || fieldValue === null) continue;
      const clean = cleanField(field, fieldValue);
      if (!sameValue(clean, base[field])) (variant as Record<string, unknown>)[field] = clean;
    }
    if (Object.keys(variant).length > 0) variants[connectorId] = variant;
  }

  const unreviewedPattern = new RegExp(`^(base|${[...known].map((id) => id.replace(/[^a-z0-9-]/gi, "")).join("|") || "base"})\\.(${POST_TEXT_FIELDS.join("|")})$`);
  const unreviewed = [...new Set((Array.isArray(raw.unreviewed) ? raw.unreviewed : []).filter((entry): entry is string => typeof entry === "string" && unreviewedPattern.test(entry)))].slice(
    0,
    POST_LIMITS.unreviewed
  );

  return { base, variants, ...(unreviewed.length ? { unreviewed } : {}), updatedAt: now };
}

