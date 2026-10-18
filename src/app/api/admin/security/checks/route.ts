import { requireAccess } from "@/lib/api-guard";
import { gatherSecurityChecks } from "@/lib/security/checks";

/**
 * Points de contrôle de l'écran Sécurité, réservés aux administrateurs.
 *
 * GET → `{ checks: [{ id, group, status, title, detail, action? }], checkedAt }`
 *
 * Relu à chaque appel : « Revérifier » montre l'état du moment. Aucune
 * valeur secrète n'est renvoyée.
 */

export async function GET() {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  try {
    return Response.json(await gatherSecurityChecks(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/security/checks]", error);
    return Response.json({ error: "Les points de contrôle n’ont pas pu être calculés." }, { status: 500 });
  }
}
