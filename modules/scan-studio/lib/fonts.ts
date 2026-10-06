"use client";

/**
 * Polices de lettrage dans le navigateur.
 *
 * Les polices fournies sont embarquées avec l'application : aucune requête
 * vers un service tiers, et l'export dispose exactement des mêmes polices que
 * l'aperçu. Toutes sont sous licence libre (OFL).
 *
 * Les polices ajoutées (§ 8 du dossier) vivent dans les données du module. Leur
 * contenu est demandé à une fonction du module, donc avec la session, puis
 * déclaré au navigateur par `FontFace` : elles n'ont pas d'adresse.
 */

import "@fontsource/comic-neue/400.css";
import "@fontsource/comic-neue/400-italic.css";
import "@fontsource/comic-neue/700.css";
import "@fontsource/comic-neue/700-italic.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/bangers/400.css";
import "@fontsource/anton/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/800.css";
import { api } from "./client";
import { BUNDLED_FONTS, customFontId, type LetteringFont } from "./custom-fonts";
import type { CustomFont } from "./types";

export type { LetteringFont };

/** Les polices fournies. */
export const FONTS: LetteringFont[] = BUNDLED_FONTS;

/**
 * Graisse disponible la plus proche de celle demandée. Une police ajoutée n'a
 * qu'un fichier, déclaré pour toutes les graisses : la demande est rendue telle
 * quelle, et le navigateur n'invente pas de faux gras.
 */
export function nearestWeight(family: string, weight: number): number {
  const font = FONTS.find((entry) => entry.family === family);
  if (!font) return weight;
  return font.weights.reduce((best, candidate) => (Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best));
}

let ready: Promise<void> | null = null;

/**
 * Un canevas ne déclenche pas le chargement d'une police : il dessine avec la
 * police de repli tant qu'elle n'est pas prête. On charge donc toutes les
 * polices fournies explicitement avant le premier rendu.
 */
export function ensureFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(
      FONTS.flatMap((font) =>
        font.weights.flatMap((weight) => [
          document.fonts.load(`${weight} 48px "${font.family}"`).catch(() => []),
          ...(font.italic ? [document.fonts.load(`italic ${weight} 48px "${font.family}"`).catch(() => [])] : []),
        ]),
      ),
    ).then(() => undefined);
  }
  return ready;
}

// ─── Polices ajoutées ────────────────────────────────────────────

let customList: Promise<CustomFont[]> | null = null;

/** Liste des polices ajoutées, lue une fois ; `force` la relit après un ajout ou un retrait. */
export function fetchCustomFonts(force = false): Promise<CustomFont[]> {
  if (force || !customList) {
    const request = api.listFonts();
    customList = request;
    // Une lecture ratée ne reste pas en mémoire : la prochaine demande réessaie.
    request.catch(() => {
      if (customList === request) customList = null;
    });
  }
  return customList;
}

/** Remplace la liste gardée en mémoire, quand la page « Polices » vient de la modifier. */
export function setCustomFonts(fonts: CustomFont[]) {
  customList = Promise.resolve(fonts);
}

const loading = new Map<string, Promise<void>>();
const faces = new Map<string, FontFace>();

function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function loadCustomFont(font: CustomFont): Promise<void> {
  let pending = loading.get(font.family);
  if (!pending) {
    pending = api.getFontFile(font.id).then(async (base64) => {
      // Toutes les graisses pour ce seul fichier : le navigateur ne fabrique pas de faux gras.
      const face = new FontFace(font.family, bytesOf(base64), { weight: "1 1000", style: "normal" });
      await face.load();
      document.fonts.add(face);
      faces.set(font.family, face);
    });
    loading.set(font.family, pending);
    pending.catch(() => loading.delete(font.family));
  }
  return pending;
}

export interface FontLoadFailure {
  family: string;
  /** Nom affiché de la police, quand elle est encore dans la liste. */
  name?: string;
  reason: string;
}

/**
 * Charge les polices ajoutées dont ces familles ont besoin, avant que la scène
 * dessine et avant qu'un export soit rendu. Les familles des polices fournies
 * sont ignorées. Rend les polices qui n'ont pas pu être chargées, avec la
 * raison : absentes de la liste (retirées), fichier illisible par le navigateur.
 */
export async function ensureCustomFonts(families: Iterable<string>): Promise<FontLoadFailure[]> {
  const wanted = [...new Set(families)].filter((family) => customFontId(family) !== null && !faces.has(family));
  if (wanted.length === 0) return [];

  let list: CustomFont[];
  try {
    list = await fetchCustomFonts();
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : "La liste des polices n’a pas pu être lue.";
    return wanted.map((family) => ({ family, reason }));
  }

  const failures: FontLoadFailure[] = [];
  await Promise.all(
    wanted.map(async (family) => {
      const font = list.find((entry) => entry.family === family);
      if (!font) {
        failures.push({ family, reason: "Cette police a été retirée du module." });
        return;
      }
      try {
        await loadCustomFont(font);
      } catch (error) {
        const detail = error instanceof Error && error.message ? error.message : "";
        failures.push({ family, name: font.name, reason: detail || "Le navigateur n’a pas su lire ce fichier de police." });
      }
    }),
  );
  return failures;
}

/** La police ajoutée est-elle prête à être dessinée ? */
export function isCustomFontLoaded(family: string): boolean {
  return faces.has(family);
}

/** Oublie une police retirée : le navigateur ne la dessine plus. */
export function forgetCustomFont(family: string) {
  const face = faces.get(family);
  if (face) document.fonts.delete(face);
  faces.delete(family);
  loading.delete(family);
}
