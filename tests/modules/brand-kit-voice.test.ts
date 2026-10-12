import { describe, expect, it, vi } from "vitest";

// L'assistant de Clip Studio appelle d'autres modules par le gestionnaire : aucun appel ici.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import { createDefaultKit, upgradeKit } from "@/modules/brand-kit/lib/defaults";
import { toBrandTheme } from "@/modules/brand-kit/lib/theme";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";
import { toAssistantBrand } from "@/modules/clip-studio/lib/assistant";
import { cleanVoiceSettings } from "@/modules/clip-studio/lib/voice-settings";

const kit = (patch: Record<string, unknown> = {}): BrandKit => ({ ...createDefaultKit("Marque d'essai", 1000), ...patch }) as BrandKit;

describe("image de marque : voix", () => {
  it("une marque d'avant la voix se lit sans voix", () => {
    const old = kit();
    delete (old as Partial<BrandKit>).voice;
    const upgraded = upgradeKit(old);
    expect("voice" in upgraded).toBe(false);
    expect(upgraded.publishing.channelDescriptionTemplate).toBeTruthy();
  });

  it("lit une voix abîmée avec tolérance", () => {
    expect(upgradeKit(kit({ voice: { voice: 42 } })).voice).toBeUndefined();
    expect(upgradeKit(kit({ voice: "siwis" })).voice).toBeUndefined();
    expect(upgradeKit(kit({ voice: { voice: "jessica", speed: "vite", tone: "chuchotée" } })).voice).toEqual({ voice: "jessica", speed: 1 });
    // Débit borné ; une voix en ligne ne garde pas d'intonation.
    expect(upgradeKit(kit({ voice: { voice: "azure:fr-FR-DeniseNeural", speed: 5, tone: "steady" } })).voice).toEqual({
      voice: "azure:fr-FR-DeniseNeural",
      speed: 1.6,
    });
    expect(cleanVoiceSettings({ voice: "edge:fr-FR-<script>", speed: 1 })).toBeUndefined();
  });

  it("enregistre la voix envoyée par l'éditeur, et la retire quand elle n'est plus envoyée", () => {
    const stored = kit({ voice: { voice: "pierre", speed: 0.85, tone: "steady" } });
    const saved = sanitizeKit({ ...stored, voice: { voice: "jessica", speed: 1.15, tone: "expressive" } }, stored);
    expect(saved.voice).toEqual({ voice: "jessica", speed: 1.15, tone: "expressive" });
    const removed = sanitizeKit({ ...stored, voice: undefined }, stored);
    expect(removed.voice).toBeUndefined();
  });

  it("l'assistant reçoit la voix de la marque", () => {
    const record = kit({ voice: { voice: "gilles", speed: 0.85, tone: "balanced" } });
    const brand = toAssistantBrand(record, toBrandTheme(record));
    expect(brand.voice).toEqual({ voice: "gilles", speed: 0.85, tone: "balanced" });
    expect(toAssistantBrand(kit(), toBrandTheme(kit())).voice).toBeUndefined();
  });
});
