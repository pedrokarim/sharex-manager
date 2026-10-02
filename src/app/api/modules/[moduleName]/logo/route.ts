import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { requireAccess } from "@/lib/api-guard";
import { apiModuleManager } from "@/lib/modules/module-manager.api";

/** Formats acceptés pour un logo. Le SVG en est absent : il peut porter du script. */
const LOGO_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/**
 * Logo d'un module, lu dans son dossier `branding/` d'après ce que déclare son
 * `module.json`. `?size=small` sert la petite version, quand le module en
 * fournit une.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleName: string }> }
) {
  const access = await requireAccess("user");
  if (!access.ok) return access.response;

  const { moduleName } = await params;
  // Nom de module strict : sans ce contrôle, un nom encodé (« %2E%2E »)
  // ferait sortir la route du dossier `modules/`.
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(moduleName)) {
    return NextResponse.json({ error: "Module invalide" }, { status: 400 });
  }

  const config = (await apiModuleManager.getModules()).find((module) => module.name === moduleName);
  const branding = config?.branding;
  if (!branding?.logo) {
    return NextResponse.json({ error: "Ce module n'a pas de logo" }, { status: 404 });
  }

  const wanted = request.nextUrl.searchParams.get("size") === "small" ? (branding.logoSmall ?? branding.logo) : branding.logo;
  const moduleDir = path.resolve(process.cwd(), "modules", moduleName);
  const file = path.resolve(moduleDir, wanted);
  const type = LOGO_TYPES[path.extname(file).toLowerCase()];

  // Le chemin vient d'un `module.json` : il doit rester dans le dossier du
  // module, et désigner une image.
  if (!type || !file.startsWith(moduleDir + path.sep)) {
    return NextResponse.json({ error: "Logo invalide" }, { status: 400 });
  }

  try {
    // Le chemin réel compte : un lien symbolique ne doit pas mener ailleurs.
    const real = fs.realpathSync(file);
    if (!real.startsWith(fs.realpathSync(moduleDir) + path.sep)) {
      return NextResponse.json({ error: "Logo invalide" }, { status: 400 });
    }
    const body = fs.readFileSync(real);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(body.length),
        // L'adresse porte la version du module : le fichier peut rester en cache.
        "Cache-Control": "private, max-age=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo introuvable" }, { status: 404 });
  }
}
