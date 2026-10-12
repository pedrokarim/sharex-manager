/**
 * Contrôle d'une fiche reçue du navigateur (ou d'une archive importée).
 *
 * Les fichiers (logos, polices) ne se modifient jamais par ici : la liste des
 * fichiers vient toujours de la fiche enregistrée, seuls leurs libellés
 * changent. Le reste est borné champ par champ ; une valeur invalide reprend
 * celle de la fiche enregistrée, jamais une valeur inventée.
 */

import { isCatalogFamily } from "@/modules/clip-studio/lib/font-catalog";
import { TEXT_ROLES } from "@/modules/clip-studio/engine/brand";
import { HASHTAG_RULES } from "@/modules/clip-studio/lib/post-types";
import { DEFAULT_PALETTE, defaultTextStyles, upgradePublishing } from "./defaults";
import {
  FORMAT_IDS,
  KIT_LIMITS,
  MASCOT_FORMAT_IDS,
  type BrandAsset,
  type BrandKit,
  type BrandLink,
  type BrandServiceTemplates,
  type HashtagRule,
  type BrandPalette,
  type BrandWatermark,
  type BrandMascot,
  type FormatId,
  type Privacy,
  type TextStyle,
  type WatermarkAnchor,
} from "./types";

const HEX = /^#[0-9a-f]{6}$/i;
const CSS_COLOR = /^(#[0-9a-f]{6}([0-9a-f]{2})?|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const ANCHORS: WatermarkAnchor[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const PRIVACIES: Privacy[] = ["private", "unlisted", "public"];

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+$/g, "").slice(0, max) : "");
const line = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const optional = (value: unknown, max: number): string | undefined => line(value, max) || undefined;

function number(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function hex(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

function list(value: unknown, max: number, itemMax: number): string[] {
  return (Array.isArray(value) ? value : []).map((entry) => line(entry, itemMax)).filter(Boolean).slice(0, max);
}

export function sanitizePalette(input: unknown, fallback: BrandPalette = DEFAULT_PALETTE): BrandPalette {
  const palette = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const secondary = palette.accentSecondary;
  return {
    background: hex(palette.background, fallback.background),
    ink: hex(palette.ink, fallback.ink),
    surface: hex(palette.surface, fallback.surface),
    onSurface: hex(palette.onSurface, fallback.onSurface),
    accent: hex(palette.accent, fallback.accent),
    accentSecondary: secondary === undefined || secondary === null || secondary === "" ? undefined : hex(secondary, fallback.accentSecondary ?? fallback.accent),
    onAccent: hex(palette.onAccent, fallback.onAccent),
    extras: (Array.isArray(palette.extras) ? palette.extras : []).filter(isHexColor).map((color) => color.toLowerCase()).slice(0, KIT_LIMITS.extras),
  };
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && CSS_COLOR.test(value.trim()) ? value.trim() : fallback;
}

/** Style de texte borné ; la police doit être du catalogue ou une police importée de la marque. */
export function sanitizeTextStyle(input: unknown, fallback: TextStyle, families: ReadonlySet<string>): TextStyle {
  const style = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const font = typeof style.font === "string" && (isCatalogFamily(style.font) || families.has(style.font)) ? style.font : fallback.font;
  const stroke = style.stroke === null ? null : style.stroke && typeof style.stroke === "object"
    ? { color: color(style.stroke.color, "#000000"), width: number(style.stroke.width, 0, 0.4, 0.08) }
    : fallback.stroke;
  const shadow = style.shadow === null ? null : style.shadow && typeof style.shadow === "object"
    ? { color: color(style.shadow.color, "rgba(0,0,0,0.55)"), blur: number(style.shadow.blur, 0, 2, 0.25), offsetY: number(style.shadow.offsetY, -1, 1, 0.06) }
    : fallback.shadow;
  const background = style.background === null ? null : style.background && typeof style.background === "object"
    ? { color: color(style.background.color, "#ffffff"), padding: number(style.background.padding, 0, 2, 0.35), radius: number(style.background.radius, 0, 1, 0.3) }
    : fallback.background;
  return {
    font,
    weight: Math.round(number(style.weight, 100, 900, fallback.weight) / 100) * 100,
    size: number(style.size, 0.005, 0.3, fallback.size),
    color: color(style.color, fallback.color),
    align: style.align === "left" || style.align === "right" || style.align === "center" ? style.align : fallback.align,
    lineHeight: number(style.lineHeight, 0.7, 2.5, fallback.lineHeight),
    uppercase: typeof style.uppercase === "boolean" ? style.uppercase : fallback.uppercase,
    letterSpacing: number(style.letterSpacing, -0.1, 0.5, fallback.letterSpacing),
    stroke,
    shadow,
    background,
  };
}

function sanitizeWatermark(input: unknown, assets: BrandAsset[], fallback?: BrandWatermark): BrandWatermark | undefined {
  if (!input || typeof input !== "object") return undefined;
  const mark = input as Record<string, unknown>;
  const assetId = assets.some((asset) => asset.id === mark.assetId) ? (mark.assetId as string) : fallback?.assetId;
  if (!assetId) return undefined;
  return {
    assetId,
    anchor: ANCHORS.includes(mark.anchor as WatermarkAnchor) ? (mark.anchor as WatermarkAnchor) : fallback?.anchor ?? "bottom-right",
    size: number(mark.size, 0.04, 0.4, fallback?.size ?? 0.14),
    opacity: number(mark.opacity, 0.1, 1, fallback?.opacity ?? 0.85),
    margin: number(mark.margin, 0, 0.15, fallback?.margin ?? 0.035),
    startSeconds: number(mark.startSeconds, 0, 600, fallback?.startSeconds ?? 0),
  };
}

// ─── Publication ─────────────────────────────────────────────────

/** Identifiant de connecteur (`youtube`, `instagram`…) : la liste des services connus est côté serveur. */
const CONNECTOR_ID = /^[a-z][a-z0-9-]{1,30}$/;

/** Mots-dièse sans « # » ni espace, sans doublon (casse ignorée), bornés. */
export function sanitizeHashtags(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (typeof entry !== "string") continue;
    const word = entry.replace(/^#+/, "").replace(/[\s#]+/g, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, KIT_LIMITS.tag);
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= KIT_LIMITS.hashtags) break;
  }
  return out;
}

/** Adresse web absolue en http(s), sans identifiants ; `null` sinon. */
export function cleanLinkUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > KIT_LIMITS.linkUrl || /\s/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Liens de la marque : adresses http(s) seulement, libellés sur une ligne, bornés. */
export function sanitizeLinks(value: unknown): BrandLink[] {
  const out: BrandLink[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (!entry || typeof entry !== "object") continue;
    const url = cleanLinkUrl((entry as Record<string, unknown>).url);
    if (!url) continue;
    out.push({ label: line((entry as Record<string, unknown>).label, KIT_LIMITS.linkLabel), url });
    if (out.length >= KIT_LIMITS.links) break;
  }
  return out;
}

/** Modèles par service : seulement ce qui est rempli, pour des services au nom plausible. */
export function sanitizeServiceTemplates(value: unknown): Record<string, BrandServiceTemplates> {
  const out: Record<string, BrandServiceTemplates> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [connector, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= KIT_LIMITS.serviceTemplates) break;
    if (!CONNECTOR_ID.test(connector) || !raw || typeof raw !== "object") continue;
    const input = raw as Record<string, unknown>;
    const entry: BrandServiceTemplates = {};
    // Une chaîne vide est un choix (« pas de premier commentaire pour ce service ») : elle est gardée.
    if (typeof input.titleTemplate === "string") entry.titleTemplate = line(input.titleTemplate, KIT_LIMITS.titleTemplate);
    if (typeof input.descriptionTemplate === "string") entry.descriptionTemplate = text(input.descriptionTemplate, KIT_LIMITS.descriptionTemplate);
    if (typeof input.captionTemplate === "string") entry.captionTemplate = text(input.captionTemplate, KIT_LIMITS.captionTemplate);
    if (typeof input.firstCommentTemplate === "string") entry.firstCommentTemplate = text(input.firstCommentTemplate, KIT_LIMITS.firstCommentTemplate);
    if (HASHTAG_RULES.includes(input.hashtagRule as HashtagRule)) entry.hashtagRule = input.hashtagRule as HashtagRule;
    if (Object.keys(entry).length > 0) out[connector] = entry;
  }
  return out;
}

// ─── Mascotte et formats ─────────────────────────────────────────

/**
 * Pose de chaque format : une pose de la mascotte, ou `null` (« sans
 * mascotte »). Un format inconnu, ou une pose qui n'en est plus une, est
 * oublié : le format reprend la proposition par défaut.
 */
export function sanitizeFormatPoses(value: unknown, poseIds: readonly string[]): BrandMascot["formatPoses"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: NonNullable<BrandMascot["formatPoses"]> = {};
  for (const id of MASCOT_FORMAT_IDS) {
    const entry = (value as Record<string, unknown>)[id];
    if (entry === null) out[id] = null;
    else if (typeof entry === "string" && poseIds.includes(entry)) out[id] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Présence de la mascotte dans les vidéos : deux interrupteurs et la pose de l'ouverture. */
export function sanitizePresence(value: unknown, poseIds: readonly string[]): BrandMascot["presence"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const openingPoseId = typeof input.openingPoseId === "string" && poseIds.includes(input.openingPoseId) ? input.openingPoseId : undefined;
  return { opening: input.opening === true, reactions: input.reactions === true, ...(openingPoseId ? { openingPoseId } : {}) };
}

/**
 * Images finies des formats : comme les autres fichiers, elles ne viennent
 * jamais du navigateur. Celles de la fiche enregistrée qui existent encore.
 */
function keepFormatImages(stored: BrandKit["formatImages"], assets: BrandAsset[]): BrandKit["formatImages"] {
  if (!stored) return undefined;
  const out: Partial<Record<FormatId, string>> = {};
  for (const id of FORMAT_IDS) {
    const assetId = stored[id];
    if (assetId && assets.some((asset) => asset.id === assetId && asset.kind === "format")) out[id] = assetId;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const assetIdOrUndefined = (value: unknown, assets: BrandAsset[]) =>
  typeof value === "string" && assets.some((asset) => asset.id === value) ? value : undefined;

/**
 * Fiche complète à partir de ce que le navigateur envoie et de la fiche
 * enregistrée. Identifiant, dates, fichiers et état « par défaut » viennent
 * toujours de la fiche enregistrée.
 */
export function sanitizeKit(input: unknown, stored: BrandKit): BrandKit {
  const kit = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const palette = sanitizePalette(kit.palette, stored.palette);

  // Fichiers : ceux de la fiche enregistrée, libellés modifiables.
  const incomingAssets = new Map<string, Record<string, unknown>>(
    (Array.isArray(kit.assets) ? kit.assets : []).filter((entry: any) => entry && typeof entry.id === "string").map((entry: any) => [entry.id, entry])
  );
  const assets: BrandAsset[] = stored.assets.map((asset) => {
    const incoming = incomingAssets.get(asset.id);
    if (!incoming) return asset;
    return { ...asset, label: line(incoming.label, KIT_LIMITS.label) || asset.label, note: optional(incoming.note, KIT_LIMITS.note) };
  });
  const incomingFonts = new Map<string, Record<string, unknown>>(
    (Array.isArray(kit.fonts) ? kit.fonts : []).filter((entry: any) => entry && typeof entry.id === "string").map((entry: any) => [entry.id, entry])
  );
  const fonts = stored.fonts.map((font) => ({ ...font, name: line(incomingFonts.get(font.id)?.name, KIT_LIMITS.name) || font.name }));
  const families = new Set(fonts.map((font) => font.family));

  const fallbackStyles = stored.textStyles ?? defaultTextStyles(palette);
  const styles = (kit.textStyles && typeof kit.textStyles === "object" ? kit.textStyles : {}) as Record<string, unknown>;
  const textStyles = Object.fromEntries(
    TEXT_ROLES.map((role) => [role, sanitizeTextStyle(styles[role], fallbackStyles[role], families)])
  ) as BrandKit["textStyles"];

  const mascotInput = kit.mascot && typeof kit.mascot === "object" ? kit.mascot : null;
  const keepAssets = (value: unknown, kind: BrandAsset["kind"]) =>
    (Array.isArray(value) ? value : []).filter((id) => assets.some((asset) => asset.id === id && asset.kind === kind)).slice(0, 20) as string[];
  const poseAssetIds = mascotInput ? keepAssets(mascotInput.poseAssetIds, "mascot-pose") : [];
  const formatPoses = mascotInput ? sanitizeFormatPoses(mascotInput.formatPoses, poseAssetIds) : undefined;
  const presence = mascotInput ? sanitizePresence(mascotInput.presence, poseAssetIds) : undefined;
  const mascot = mascotInput
    ? {
        name: optional(mascotInput.name, KIT_LIMITS.name),
        identityPrompt: text(mascotInput.identityPrompt, KIT_LIMITS.identityPrompt),
        sheetAssetIds: keepAssets(mascotInput.sheetAssetIds, "mascot-sheet"),
        poseAssetIds,
        ...(formatPoses ? { formatPoses } : {}),
        ...(presence ? { presence } : {}),
      }
    : undefined;
  const formatImages = keepFormatImages(stored.formatImages, assets);

  const endCard = kit.endCard && typeof kit.endCard === "object" ? kit.endCard : stored.endCard;
  const ai = kit.ai && typeof kit.ai === "object" ? kit.ai : stored.ai;
  // Une fiche d'avant les textes de publication (archive importée) est d'abord complétée.
  const publishing = upgradePublishing(kit.publishing && typeof kit.publishing === "object" ? kit.publishing : stored.publishing);
  const rules = kit.rules && typeof kit.rules === "object" ? kit.rules : stored.rules;

  return {
    version: 1,
    id: stored.id,
    name: line(kit.name, KIT_LIMITS.name) || stored.name,
    tagline: optional(kit.tagline, KIT_LIMITS.tagline),
    language: typeof kit.language === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(kit.language) ? kit.language : stored.language,
    tone: text(kit.tone, KIT_LIMITS.tone),
    rules: { always: list(rules.always, KIT_LIMITS.rules, KIT_LIMITS.rule), never: list(rules.never, KIT_LIMITS.rules, KIT_LIMITS.rule) },
    palette,
    fonts,
    textStyles,
    assets,
    logoAssetId: assetIdOrUndefined(kit.logoAssetId, assets),
    markAssetId: assetIdOrUndefined(kit.markAssetId, assets),
    mascot,
    watermark: sanitizeWatermark(kit.watermark, assets, stored.watermark),
    endCard: {
      enabled: typeof endCard.enabled === "boolean" ? endCard.enabled : stored.endCard.enabled,
      seconds: number(endCard.seconds, 1.5, 8, stored.endCard.seconds),
      callToAction: optional(endCard.callToAction, KIT_LIMITS.callToAction),
      poseAssetId: assetIdOrUndefined(endCard.poseAssetId, assets),
    },
    ...(formatImages ? { formatImages } : {}),
    ...(typeof kit.registrationMarks === "boolean" ? { registrationMarks: kit.registrationMarks } : stored.registrationMarks !== undefined ? { registrationMarks: stored.registrationMarks } : {}),
    ai: {
      styleNotes: text(ai.styleNotes, KIT_LIMITS.styleNotes),
      collectionId: typeof ai.collectionId === "string" && /^col-[A-Za-z0-9-]{1,60}$/.test(ai.collectionId) ? ai.collectionId : undefined,
      scriptTone: text(ai.scriptTone, KIT_LIMITS.scriptTone),
    },
    publishing: {
      accountIds: (Array.isArray(publishing.accountIds) ? publishing.accountIds : [])
        .filter((id: unknown) => typeof id === "string" && /^acc-[a-z0-9]{4,40}$/.test(id))
        .slice(0, 20),
      titleTemplate: line(publishing.titleTemplate, KIT_LIMITS.titleTemplate) || "{title}",
      descriptionTemplate: text(publishing.descriptionTemplate, KIT_LIMITS.descriptionTemplate),
      captionTemplate: text(publishing.captionTemplate, KIT_LIMITS.captionTemplate),
      firstCommentTemplate: text(publishing.firstCommentTemplate, KIT_LIMITS.firstCommentTemplate),
      serviceTemplates: sanitizeServiceTemplates(publishing.serviceTemplates),
      hashtags: sanitizeHashtags(publishing.hashtags),
      tags: list(publishing.tags, KIT_LIMITS.tags, KIT_LIMITS.tag),
      links: sanitizeLinks(publishing.links),
      categoryId: typeof publishing.categoryId === "string" && /^\d{1,3}$/.test(publishing.categoryId) ? publishing.categoryId : stored.publishing.categoryId,
      defaultPrivacy: PRIVACIES.includes(publishing.defaultPrivacy) ? publishing.defaultPrivacy : stored.publishing.defaultPrivacy,
      containsSyntheticMedia: typeof publishing.containsSyntheticMedia === "boolean" ? publishing.containsSyntheticMedia : stored.publishing.containsSyntheticMedia,
      madeForKids: publishing.madeForKids === true,
      channelDescriptionTemplate: text(publishing.channelDescriptionTemplate, KIT_LIMITS.channelDescriptionTemplate),
      bio: text(publishing.bio, KIT_LIMITS.bio).trim(),
      country: typeof publishing.country === "string" && /^[A-Z]{2}$/.test(publishing.country) ? publishing.country : "",
    },
    isDefault: stored.isDefault,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

// ─── Contraste ───────────────────────────────────────────────────

function luminance(hexColor: string): number {
  const value = Number.parseInt(hexColor.slice(1, 7), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** Rapport de contraste WCAG entre deux couleurs hexadécimales (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  if (!isHexColor(a) || !isHexColor(b)) return 1;
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
