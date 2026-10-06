/**
 * La vraie palette d'IA : celle de l'application, telle qu'AI Image Gen la
 * tient (§ 7.4 du dossier). Scan Studio n'a aucune clé à lui : il lit celles
 * d'AI Image Gen, appelle ses moteurs d'image et passe par son Codex CLI,
 * comme Clip Studio.
 *
 * - Relire une zone, traduire avec le contexte : un modèle de langage, joint
 *   avec la clé OpenAI ou Google enregistrée dans AI Image Gen, ou Codex CLI
 *   (texte seulement) avec l'abonnement du compte connecté.
 * - Traduire la page entière : un moteur d'image d'AI Image Gen qui sait
 *   partir d'une image existante. Le moteur est appelé directement, sans
 *   passer par la file d'AI Image Gen : une page de scan ne doit ni apparaître
 *   dans le fil du studio, ni partir dans la galerie publique si le studio y
 *   envoie ses rendus (§ 13).
 *
 * AI Image Gen coupé, plus rien n'est proposé : chaque modèle porte la raison.
 *
 * Ce fichier n'est chargé qu'au premier besoin (`index.ts`) : les tests, qui
 * donnent une fausse palette, ne le chargent jamais.
 */

import { apiModuleManager } from "@/lib/modules/module-manager.api";
import { askCodex, findCodex } from "../../../../ai-image-gen/lib/codex-text";
import { findModel, generateWithEngine, getCatalog } from "../../../../ai-image-gen/lib/engines/registry";
import { EngineError } from "../../../../ai-image-gen/lib/engines/types";
import { buildEngineConfig } from "../../../../ai-image-gen/lib/generate";
import type { AiAction } from "../../types";
import { AiCallError, askGoogle, askOpenAi, type AiImage, type AiModelRef, type AiPalette, type AiPaletteModel } from "./providers";

const PALETTE_MODULE = "ai-image-gen";

interface LanguageModel {
  provider: "openai" | "google" | "codex";
  providerLabel: string;
  model: string;
  label: string;
  /** Le modèle sait-il lire une image ? */
  vision: boolean;
}

/** Modèles de langage joignables avec ce que la palette possède déjà. */
const LANGUAGE_MODELS: LanguageModel[] = [
  { provider: "openai", providerLabel: "OpenAI", model: "gpt-4o-mini", label: "GPT-4o mini", vision: true },
  { provider: "openai", providerLabel: "OpenAI", model: "gpt-4o", label: "GPT-4o", vision: true },
  { provider: "google", providerLabel: "Google AI", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
  { provider: "google", providerLabel: "Google AI", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
  // Les modèles 2.5 sont annoncés en fin de vie selon certaines sources : un modèle récent reste proposé à côté.
  { provider: "google", providerLabel: "Google AI", model: "gemini-3.5-flash", label: "Gemini 3.5 Flash", vision: true },
  { provider: "codex", providerLabel: "Codex CLI", model: "codex", label: "Codex CLI, abonnement du compte connecté", vision: false },
];

/** Pourquoi la palette entière est indisponible ; `null` quand AI Image Gen est en service. */
function paletteReason(): string | null {
  const loaded = apiModuleManager.getLoadedModule(PALETTE_MODULE);
  return loaded && loaded.config.enabled !== false ? null : "Le module AI Image Gen est désactivé : c’est lui qui tient les clés et les moteurs d’IA.";
}

function languageModelStatus(model: LanguageModel, keys: Record<string, string | undefined>, off: string | null): AiPaletteModel {
  const base = { provider: model.provider, providerLabel: model.providerLabel, model: model.model, label: model.label };
  if (off) return { ...base, available: false, reason: off };
  if (model.provider === "codex") {
    return findCodex() ? { ...base, available: true } : { ...base, available: false, reason: "Codex CLI est introuvable sur ce serveur." };
  }
  return keys[model.provider]
    ? { ...base, available: true }
    : { ...base, available: false, reason: `Aucune clé ${model.providerLabel} enregistrée dans AI Image Gen.` };
}

/** Taille proposée par le moteur dont les proportions sont les plus proches de celles de la page. */
function closestSize(sizes: string[], page: { width: number; height: number }): string {
  const ratio = page.width / Math.max(1, page.height);
  let best = sizes[0] ?? "1024x1536";
  let bestGap = Infinity;
  for (const size of sizes) {
    const [width, height] = size.split("x").map(Number);
    if (!width || !height) continue;
    const gap = Math.abs(Math.log(width / height / ratio));
    if (gap < bestGap) {
      best = size;
      bestGap = gap;
    }
  }
  return best;
}

function requireKey(ref: AiModelRef, label: string): string {
  const key = buildEngineConfig().apiKeys[ref.provider];
  if (!key) throw new AiCallError("unauthorized", `Aucune clé ${label} enregistrée dans AI Image Gen.`);
  return key;
}

function assertInService() {
  const off = paletteReason();
  if (off) throw new AiCallError("unavailable", off);
}

async function askLanguageModel(ref: AiModelRef, prompt: string, image: AiImage | undefined, signal: AbortSignal): Promise<string> {
  assertInService();
  if (ref.provider === "openai") return askOpenAi({ apiKey: requireKey(ref, "OpenAI"), model: ref.model, prompt, image, signal });
  if (ref.provider === "google") return askGoogle({ apiKey: requireKey(ref, "Google"), model: ref.model, prompt, image, signal });
  if (ref.provider === "codex" && !image) return askCodex(prompt, { signal, timeoutMs: 120_000 });
  throw new AiCallError("invalid-request", "Ce modèle ne sait pas faire cela.");
}

export function createPalette(): AiPalette {
  return {
    async models(): Promise<Record<AiAction, AiPaletteModel[]>> {
      const off = paletteReason();
      const config = buildEngineConfig();
      const language = LANGUAGE_MODELS.map((model) => ({ model, status: languageModelStatus(model, config.apiKeys, off) }));

      // Moteurs d'image qui savent retoucher une image existante : les seuls utiles à la page entière.
      const { models } = await getCatalog(config);
      const page = models
        .filter((model) => model.supportsReference)
        .map(
          (model): AiPaletteModel => ({
            provider: model.engineId,
            providerLabel: model.accessLabel.replace(/^Clé /, ""),
            model: model.id,
            label: model.label,
            available: !off && model.available,
            ...(off ? { reason: off } : model.reason ? { reason: model.reason } : {}),
          }),
        );

      return {
        reading: language.filter((entry) => entry.model.vision).map((entry) => entry.status),
        translation: language.map((entry) => entry.status),
        page,
      };
    },

    readImage: (ref, prompt, image, signal) => askLanguageModel(ref, prompt, image, signal),

    completeText: (ref, prompt, signal) => askLanguageModel(ref, prompt, undefined, signal),

    async editImage(ref, prompt, image, size, signal): Promise<AiImage> {
      assertInService();
      const config = buildEngineConfig();
      const model = findModel(ref.model, config);
      if (!model || model.engineId !== ref.provider || !model.supportsReference) {
        throw new AiCallError("invalid-request", "Ce moteur d’image ne sait pas retoucher une page.");
      }
      try {
        const result = await generateWithEngine(
          { prompt, model: model.id, size: closestSize(model.sizes, size), n: 1, references: [{ ...image, role: "edit-target" }] },
          config,
          { signal },
        );
        const rendered = result.images[0];
        if (!rendered?.b64) throw new AiCallError("refused", "Le moteur n’a rendu aucune image.");
        return { b64: rendered.b64, mimeType: rendered.mimeType ?? "image/png" };
      } catch (error) {
        if (error instanceof EngineError) throw new AiCallError("unavailable", error.message);
        throw error;
      }
    },
  };
}
