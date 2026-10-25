/**
 * Maquette d'une image de marque neuve (§ 3.1) : tout l'aperçu fonctionne dès
 * la première seconde, et l'on remplace ensuite chaque pièce.
 */

import { defaultRoleStyles } from "@/modules/clip-studio/engine/brand";
import { minContrast, paletteCandidates, readableOn, TEXT_CONTRAST } from "@/modules/clip-studio/engine/legibility";
import { DEFAULT_TEXT_FONT, isCatalogTextFont, nearestCatalogWeight } from "@/modules/clip-studio/lib/font-catalog";
import { cleanVoiceSettings } from "@/modules/clip-studio/lib/voice-settings";
import { upgradePoseAssets } from "./mascot";
import { repairNotice, repairTypography, TEXT_FONT_ROLES } from "./typography";
import { sanitizeVoiceSheet } from "./voice-sheet";
import type { BrandKit, BrandPalette, BrandPublishing, TextRole, TextStyle } from "./types";

export const DEFAULT_PALETTE: BrandPalette = {
  background: "#14141c",
  ink: "#f5f5f4",
  surface: "#ffffff",
  onSurface: "#14141c",
  accent: "#8b5cf6",
  accentSecondary: "#facc15",
  onAccent: "#ffffff",
  extras: ["#0ea5e9", "#f97316", "#10b981", "#ec4899"],
};

/**
 * Styles de la maquette : ceux des modèles de Clip Studio, à l'encre de la
 * palette. Les rôles de texte gardent une police de texte du catalogue (jamais
 * une monospace ni une police de titre), et chaque couleur est lisible sur
 * son fond (4,5:1) : une encre qui ne l'est pas cède la place à la couleur de
 * la palette qui l'est, sinon au noir ou au blanc.
 */
export function defaultTextStyles(palette: BrandPalette = DEFAULT_PALETTE): Record<TextRole, TextStyle> {
  const styles = defaultRoleStyles();
  const candidates = paletteCandidates(palette);
  for (const role of ["title", "subtitle", "caption"] as const) {
    styles[role].color = readableOn([palette.background], palette.ink, candidates, minContrast(role, styles[role].size));
  }
  styles.label.color = readableOn([palette.accent], palette.onAccent, candidates, TEXT_CONTRAST);
  styles.body.color = readableOn([palette.surface], palette.onSurface, candidates, TEXT_CONTRAST);
  for (const role of TEXT_FONT_ROLES) {
    if (!isCatalogTextFont(styles[role].font)) styles[role] = { ...styles[role], font: DEFAULT_TEXT_FONT, weight: nearestCatalogWeight(DEFAULT_TEXT_FONT, styles[role].weight) };
  }
  return styles;
}

export function newKitId(): string {
  return `kit-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newItemId(prefix: "ast" | "fnt" | "job"): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultKit(name: string, now = Date.now()): BrandKit {
  return {
    version: 1,
    id: newKitId(),
    name,
    tagline: "",
    language: "fr",
    tone: "",
    rules: { always: [], never: [] },
    palette: structuredClone(DEFAULT_PALETTE),
    fonts: [],
    textStyles: defaultTextStyles(),
    assets: [],
    endCard: { enabled: true, seconds: 2.5, callToAction: "Abonne-toi" },
    ai: { styleNotes: "", scriptTone: "" },
    publishing: defaultPublishing(),
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Description de chaîne d'une marque neuve : l'accroche, puis les liens. */
export const DEFAULT_CHANNEL_DESCRIPTION = "{hook}\n\n{links}";

/** Réglages de publication d'une marque neuve. */
export function defaultPublishing(): BrandPublishing {
  return {
    accountIds: [],
    titleTemplate: "{title}",
    descriptionTemplate: "{summary}\n\n{links}\n\n{credits}",
    captionTemplate: "{title}\n\n{cta}",
    firstCommentTemplate: "",
    serviceTemplates: {},
    hashtags: [],
    tags: [],
    links: [],
    categoryId: "24",
    // Rien ne part en public sans un choix explicite.
    defaultPrivacy: "private",
    containsSyntheticMedia: true,
    madeForKids: false,
    channelDescriptionTemplate: DEFAULT_CHANNEL_DESCRIPTION,
    bio: "",
    country: "",
  };
}

/**
 * Complète les réglages de publication d'une fiche écrite avant les textes
 * de publication (dossier 01 ter, § 4.3). Migration douce, faite à la
 * lecture : une marque sans `hashtags` recopie ses tags, qui servaient
 * jusque-là de mots-dièse ; les modèles absents prennent ceux d'une marque
 * neuve, sauf le premier commentaire, qui reste vide.
 */
export function upgradePublishing(input: unknown): BrandPublishing {
  const fresh = defaultPublishing();
  const publishing = (input && typeof input === "object" ? input : {}) as Partial<BrandPublishing>;
  const tags = Array.isArray(publishing.tags) ? publishing.tags : fresh.tags;
  const services = publishing.serviceTemplates;
  return {
    ...fresh,
    ...publishing,
    tags,
    hashtags: Array.isArray(publishing.hashtags) ? publishing.hashtags : [...tags],
    captionTemplate: typeof publishing.captionTemplate === "string" ? publishing.captionTemplate : fresh.captionTemplate,
    firstCommentTemplate: typeof publishing.firstCommentTemplate === "string" ? publishing.firstCommentTemplate : "",
    serviceTemplates: services && typeof services === "object" && !Array.isArray(services) ? services : {},
    links: Array.isArray(publishing.links) ? publishing.links : [],
    // Profil des comptes : une marque d'avant les reçoit vides, sauf le modèle de description.
    channelDescriptionTemplate: typeof publishing.channelDescriptionTemplate === "string" ? publishing.channelDescriptionTemplate : fresh.channelDescriptionTemplate,
    bio: typeof publishing.bio === "string" ? publishing.bio : "",
    country: typeof publishing.country === "string" ? publishing.country : "",
  };
}

/**
 * Fiche lue sur le disque, mise à la forme actuelle. La voix est lue avec
 * tolérance : une marque d'avant la voix, ou une voix abîmée, n'en a pas.
 * Une police monospace dans un rôle de texte (D1) est remplacée par une
 * police de texte lisible, avec un avertissement pour l'éditeur.
 */
export function upgradeKit(kit: BrandKit): BrandKit {
  const { voice: stored, voiceSheet: storedSheet, typographyNotice: _stale, ...rest } = kit;
  const voice = cleanVoiceSettings(stored);
  // Fiche de voix (S1) : une marque d'avant, ou une fiche abîmée, n'en a pas.
  const voiceSheet = sanitizeVoiceSheet(storedSheet);
  const typography = kit.textStyles ? repairTypography(kit) : null;
  const notice = typography ? repairNotice(kit, typography) : undefined;
  // Poses d'avant la bibliothèque (D2) : étiquettes proposées d'après leur libellé et leur note.
  return {
    ...rest,
    ...(voice ? { voice } : {}),
    ...(voiceSheet ? { voiceSheet } : {}),
    ...(typography ? { textStyles: typography.textStyles } : {}),
    ...(notice ? { typographyNotice: notice } : {}),
    assets: upgradePoseAssets(kit.assets),
    publishing: upgradePublishing(kit.publishing),
  };
}
