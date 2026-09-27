import { BrandLogo, type Brand } from "@/components/brand-logo";

/** Logo officiel de chaque moteur connu ; un moteur personnalisé n'en a pas. */
const ENGINE_BRANDS: Record<string, Brand> = {
  openai: "openai",
  stability: "stability",
  google: "google",
  codex: "codex",
  "gemini-cli": "gemini",
  claude: "claude",
};

/** Moteur d'un modèle (`codex/gpt-image-2` → `codex`) ou d'un moteur seul. */
export function engineBrand(id: string | undefined): Brand | null {
  if (!id) return null;
  return ENGINE_BRANDS[id] ?? ENGINE_BRANDS[id.split("/")[0]] ?? null;
}

export function EngineLogo({ engineId, className }: { engineId?: string; className?: string }) {
  const brand = engineBrand(engineId);
  return brand ? <BrandLogo brand={brand} className={className} /> : null;
}
