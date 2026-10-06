import { readFile } from "fs/promises";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import { LOGO_CATALOG, loadPublicImage } from "@/lib/og-assets";
import { checkRateLimit } from "@/lib/rate-limit";
import { CATALOG_NAME } from "@/lib/seo";

/**
 * Image d'aperçu d'une page de section du catalogue (`catalogSections`) : la
 * couverture à droite, le titre sur un panneau plein à gauche. Le texte n'est
 * jamais posé sur l'image, pour rester lisible quelle qu'elle soit.
 *
 * Composer cette image coûte un redimensionnement et un rendu : le résultat
 * est gardé en mémoire, et la composition est bornée par adresse IP. La
 * visibilité, elle, est vérifiée par l'appelant avant chaque réponse, mémoire
 * ou pas.
 */

export const SECTION_OG_SIZE = { width: 1200, height: 630 };

/**
 * Jamais gardée par un cache partagé : l'aperçu d'un chapitre qui redevient
 * privé ne doit pas continuer d'être servi (voir la route des médias).
 */
const HEADERS = { "Content-Type": "image/png", "Cache-Control": "private, no-cache" };

const COVER_WIDTH = 440;

interface SectionOgOptions {
  /** Clé de mémoire : change dès que le contenu change. */
  key: string;
  kicker: string;
  title: string;
  subtitle?: string;
  /** Chemin absolu de la couverture, déjà vérifié par le catalogue. */
  coverFile?: string | null;
  /** Adresse du visiteur, pour borner les compositions. */
  ip: string;
}

const MAX_KEPT = 40;
const holder = globalThis as typeof globalThis & { __catalogSectionOg?: Map<string, Uint8Array> };
const kept = (): Map<string, Uint8Array> => (holder.__catalogSectionOg ??= new Map());

async function loadCover(file: string): Promise<string | null> {
  try {
    const resized = await sharp(await readFile(file))
      .resize(COVER_WIDTH, SECTION_OG_SIZE.height, { fit: "cover", position: "top" })
      .jpeg({ quality: 76 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error("Couverture d'aperçu illisible :", error);
    return null;
  }
}

export function sectionOgNotFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function renderSectionOgImage({ key, kicker, title, subtitle, coverFile, ip }: SectionOgOptions): Promise<Response> {
  const known = kept().get(key);
  if (known) return new Response(known.slice().buffer, { headers: HEADERS });

  const limit = checkRateLimit(`catalog-og:${ip}`, { max: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return new Response(null, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  }

  const [logo, cover] = await Promise.all([loadPublicImage(LOGO_CATALOG, { size: 96 }), coverFile ? loadCover(coverFile) : null]);
  const textWidth = cover ? SECTION_OG_SIZE.width - COVER_WIDTH : SECTION_OG_SIZE.width;

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: "#08150e", fontFamily: "sans-serif", color: "#ffffff" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: `${textWidth}px`, padding: "60px 56px 56px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#bfe6c9" }}>{kicker}</div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: title.length > 26 ? 56 : 72,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
              }}
            >
              {title.length > 80 ? `${title.slice(0, 79)}…` : title}
            </div>
            {subtitle ? (
              <div style={{ display: "flex", marginTop: 18, fontSize: 28, lineHeight: 1.3, color: "rgba(255,255,255,0.72)" }}>
                {subtitle.length > 110 ? `${subtitle.slice(0, 109)}…` : subtitle}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            {logo ? <img src={logo} width={44} height={44} style={{ width: 44, height: 44 }} /> : null}
            <div style={{ display: "flex", marginLeft: logo ? 16 : 0, fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{CATALOG_NAME}</div>
          </div>
        </div>
        {cover ? (
          <img
            src={cover}
            width={COVER_WIDTH}
            height={SECTION_OG_SIZE.height}
            style={{ width: `${COVER_WIDTH}px`, height: `${SECTION_OG_SIZE.height}px`, objectFit: "cover" }}
          />
        ) : null}
      </div>
    ),
    SECTION_OG_SIZE,
  );

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (kept().size >= MAX_KEPT) kept().delete(kept().keys().next().value as string);
  kept().set(key, bytes);
  return new Response(bytes.slice().buffer, { headers: HEADERS });
}
