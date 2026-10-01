/**
 * Accès à Codex CLI pour écrire les scripts : l'appel vit dans AI Image Gen,
 * qui détecte l'exécutable et règle son isolation.
 */
export { askCodex, extractJson, findCodex, type CodexOptions } from "../../ai-image-gen/lib/codex-text";
