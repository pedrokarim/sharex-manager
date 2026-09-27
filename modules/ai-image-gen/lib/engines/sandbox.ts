/**
 * Mode d'isolation de Codex CLI.
 *
 * Le réglage vient de l'interface, mais désactiver le bac à sable laisse un
 * agent, qu'un texte piégé peut détourner, exécuter n'importe quelle commande
 * sur le serveur. Ce choix ne se fait donc qu'au niveau du serveur :
 * `AI_IMAGE_GEN_ALLOW_UNSANDBOXED=1` dans l'environnement, pour un hôte dont
 * le noyau empêche le bac à sable de démarrer.
 */

export type CodexSandbox = "read-only" | "workspace-write" | "off";

export const UNSANDBOXED_ENV = "AI_IMAGE_GEN_ALLOW_UNSANDBOXED";

export function unsandboxedAllowed(): boolean {
  return process.env[UNSANDBOXED_ENV] === "1";
}

/** Mode réellement appliqué pour une valeur enregistrée. */
export function resolveSandbox(value: unknown): CodexSandbox {
  if (value === "workspace-write") return "workspace-write";
  if (value === "off" && unsandboxedAllowed()) return "off";
  return "read-only";
}

/** Contrôle d'un réglage envoyé par l'interface. */
export function assertSandboxSetting(value: unknown) {
  if (value === undefined || value === "read-only" || value === "workspace-write") return;
  if (value === "off") {
    if (unsandboxedAllowed()) return;
    throw new Error(
      `Désactiver le bac à sable se décide sur le serveur : ajoutez ${UNSANDBOXED_ENV}=1 à son environnement.`
    );
  }
  throw new Error("Mode d'isolation inconnu.");
}
