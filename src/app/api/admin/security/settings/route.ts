import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/api-guard";
import { resolveAuthProvider } from "@/lib/auth-config";
import { logger } from "@/lib/utils/logger";
import {
  BUILTIN_ONLY_SECTIONS,
  defaultSecuritySettings,
  getSecuritySettings,
  RATE_LIMIT_PRESETS,
  RESTART_REQUIRED_SECTIONS,
  SecuritySettingsError,
  updateSecuritySettings,
  type SecuritySettings,
} from "@/lib/security/settings";

/**
 * Réglages de sécurité (`data/security.json`), réservés aux administrateurs.
 *
 * GET  → réglages, mode d'authentification et métadonnées de l'écran
 * PUT  → modification partielle : `{ sessions: { maxAgeDays: 14 } }`
 *
 * `authMode` permet à l'écran de griser les sections propres au mode
 * « builtin » (`builtinOnly`) quand la connexion passe par Ascencia ID.
 */

function payload(settings: SecuritySettings) {
  let authMode: "builtin" | "ascencia" = "builtin";
  try {
    authMode = resolveAuthProvider(process.env.SHAREX_AUTH_PROVIDER);
  } catch {
    authMode = "builtin";
  }
  return {
    settings,
    defaults: defaultSecuritySettings(),
    authMode,
    builtinOnly: BUILTIN_ONLY_SECTIONS,
    restartRequired: RESTART_REQUIRED_SECTIONS,
    rateLimitPresets: RATE_LIMIT_PRESETS,
  };
}

export async function GET() {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  return Response.json(payload(getSecuritySettings()));
}

export async function PUT(request: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;

  let patch: unknown;
  try {
    patch = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide : un objet JSON est attendu." }, { status: 400 });
  }

  const before = getSecuritySettings();
  try {
    const settings = updateSecuritySettings(patch);
    const changed = (Object.keys(settings) as (keyof SecuritySettings)[]).filter(
      (section) => JSON.stringify(settings[section]) !== JSON.stringify(before[section])
    );
    if (changed.length > 0) {
      void logger.info("security.settings.update", "Réglages de sécurité modifiés", {
        userId: guard.session.user.id,
        userEmail: guard.session.user.email,
        metadata: { sections: changed, before: pick(before, changed), after: pick(settings, changed) },
      });
    }
    return Response.json(payload(settings));
  } catch (error) {
    if (error instanceof SecuritySettingsError) {
      return Response.json({ error: "Réglages refusés.", issues: error.issues }, { status: 400 });
    }
    console.error("[admin/security/settings]", error);
    return Response.json({ error: "Les réglages n’ont pas pu être enregistrés." }, { status: 500 });
  }
}

function pick(settings: SecuritySettings, sections: (keyof SecuritySettings)[]) {
  return Object.fromEntries(sections.map((section) => [section, settings[section]]));
}
