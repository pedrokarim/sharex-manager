"use client";

/**
 * Polices des textes, embarquées avec l'application : aucune requête vers un
 * service tiers, et l'export dispose exactement des mêmes polices que
 * l'aperçu.
 *
 * Les polices importées dans une image de marque (module `brand-kit`) n'ont
 * pas d'adresse : leur contenu est demandé à une fonction du module, donc avec
 * la session, puis déclaré au navigateur par `FontFace`. Leur famille porte la
 * marque et la police : `bk-<kitId>-<fontId>`.
 */

import "@fontsource/anton/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/bangers/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/700.css";
import "@fontsource/inter/600.css";
import type { ClipProject } from "../engine/types";
import { FONTS } from "./font-catalog";
import { callAnyModule } from "./client";

export { FONTS };

let ready: Promise<void> | null = null;

/**
 * Un canevas ne déclenche pas le chargement d'une police : il dessine avec la
 * police de repli tant qu'elle n'est pas prête. On les charge donc toutes
 * explicitement avant le premier rendu.
 */
export function ensureFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(
      FONTS.flatMap((font) =>
        font.weights.map((weight) =>
          document.fonts.load(`${weight} 48px "${font.family}"`).catch(() => [])
        )
      )
    ).then(() => undefined);
  }
  return ready;
}

// ─── Polices des images de marque ────────────────────────────────

const BRAND_FAMILY = /^bk-(kit-[a-z0-9]{6,32})-([a-z]{1,4}-[a-z0-9]{4,32})$/;

export interface BrandFontRef {
  family: string;
  kitId: string;
  fontId: string;
}

const loading = new Map<string, Promise<boolean>>();

function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function loadBrandFont(font: BrandFontRef): Promise<boolean> {
  let pending = loading.get(font.family);
  if (!pending) {
    pending = callAnyModule<string>("brand-kit", "readFontFile", font.kitId, font.fontId)
      .then(async (base64) => {
        // Toutes les graisses pour ce seul fichier : le navigateur ne fabrique pas de faux gras.
        const face = new FontFace(font.family, bytesOf(base64), { weight: "1 1000", style: "normal" });
        await face.load();
        document.fonts.add(face);
        return true;
      })
      .catch(() => {
        // Une police retirée ou illisible : le texte garde la police de repli, et un nouvel essai reste possible.
        loading.delete(font.family);
        return false;
      });
    loading.set(font.family, pending);
  }
  return pending;
}

/** Charge les polices importées d'une marque. Rend les familles qui n'ont pas pu l'être. */
export async function ensureBrandFonts(fonts: BrandFontRef[]): Promise<string[]> {
  const results = await Promise.all(fonts.map(async (font) => ((await loadBrandFont(font)) ? null : font.family)));
  return results.filter((family): family is string => family !== null);
}

/** Familles de marque utilisées par les textes d'un projet. */
export function brandFontsOf(project: ClipProject): BrandFontRef[] {
  const found = new Map<string, BrandFontRef>();
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.type !== "text") continue;
      const match = BRAND_FAMILY.exec(item.style.font);
      if (match) found.set(item.style.font, { family: item.style.font, kitId: match[1], fontId: match[2] });
    }
  }
  return [...found.values()];
}

/** Toutes les polices dont un projet a besoin : celles du catalogue et celles de sa marque. */
export async function ensureProjectFonts(project: ClipProject): Promise<string[]> {
  const [, missing] = await Promise.all([ensureFonts(), ensureBrandFonts(brandFontsOf(project))]);
  return missing;
}
