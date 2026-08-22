import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import { getAbsoluteUploadPath } from "@/lib/config";
import { albumFallbackDescription, getPublicAlbumSummary } from "@/lib/seo-album";
import { LOGO_CATALOG, loadPublicImage } from "@/lib/og-assets";
import { CATALOG_NAME } from "@/lib/seo";

export const alt = "Album public sur ShareX Manager";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Hauteur du bandeau d'images. Le reste est un panneau opaque pour le texte. */
const BANNER_HEIGHT = 340;

/**
 * Aperçu partagé d'un album public : les quatre premières images en bandeau,
 * le nom de l'album sur un panneau plein en dessous.
 *
 * Le texte n'est pas posé sur les images. Un simple voile ne suffit pas : les
 * albums contiennent aussi bien des captures très claires que très sombres, et
 * un titre blanc devient illisible sur les premières.
 *
 * Les vignettes sont lues sur le disque et encodées en base64 plutôt que
 * référencées par URL — `next/og` devrait sinon appeler l'application par le
 * réseau pour se servir elle-même, ce qui échoue dès que le domaine public
 * diffère de celui du serveur.
 */
async function loadCover(fileName: string): Promise<string | null> {
  try {
    const original = await readFile(join(getAbsoluteUploadPath(), fileName));
    // Redimensionné avant l'encodage : une image de plusieurs mégaoctets
    // encodée en base64 ferait exploser le temps de génération.
    const resized = await sharp(original)
      .resize(640, 400, { fit: "cover", position: "attention" })
      .jpeg({ quality: 74 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error(`Vignette Open Graph illisible (${fileName}):`, error);
    return null;
  }
}

export default async function AlbumOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const album = getPublicAlbumSummary(slug);
  // Le catalogue a son propre logo, distinct de celui de la plateforme.
  const logo = await loadPublicImage(LOGO_CATALOG, { size: 96 });

  const covers = album
    ? (await Promise.all(album.covers.map(loadCover))).filter(
        (value): value is string => value !== null,
      )
    : [];

  const titre = album?.name ?? "Album introuvable";
  const sousTitre = album
    ? album.description?.trim() || albumFallbackDescription(album.imageCount)
    : "Cet album n'est plus partagé publiquement.";

  const largeurTuile = covers.length > 0 ? 1200 / covers.length : 1200;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0b0912",
          fontFamily: "sans-serif",
        }}
      >
        {/* Bandeau : les images côte à côte, sans texte par-dessus. */}
        <div
          style={{
            display: "flex",
            width: "1200px",
            height: `${BANNER_HEIGHT}px`,
            position: "relative",
          }}
        >
          {covers.length > 0 ? (
            covers.map((src, index) => (
              <img
                key={index}
                src={src}
                width={largeurTuile}
                height={BANNER_HEIGHT}
                style={{
                  width: `${largeurTuile}px`,
                  height: `${BANNER_HEIGHT}px`,
                  objectFit: "cover",
                }}
              />
            ))
          ) : (
            <div
              style={{
                display: "flex",
                width: "1200px",
                height: `${BANNER_HEIGHT}px`,
                backgroundImage:
                  "radial-gradient(700px 400px at 20% 0%, #3b2f7a 0%, transparent 65%), radial-gradient(600px 400px at 95% 100%, #4c3fb5 0%, transparent 60%)",
              }}
            />
          )}

          {/* Raccord : les images se fondent dans le panneau. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "120px",
              display: "flex",
              backgroundImage:
                "linear-gradient(to top, #0b0912 10%, rgba(11,9,18,0))",
            }}
          />
        </div>

        {/* Panneau : fond plein, donc lisibilité garantie. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "36px 64px 56px 64px",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: titre.length > 30 ? 58 : 72,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                maxWidth: 1060,
              }}
            >
              {titre}
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 28,
                lineHeight: 1.3,
                color: "rgba(255,255,255,0.7)",
                maxWidth: 1000,
              }}
            >
              {sousTitre}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              {logo ? (
                <img src={logo} width={44} height={44} style={{ width: 44, height: 44 }} />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "flex",
                    backgroundColor: "#6d5cf5",
                  }}
                />
              )}
              <div
                style={{
                  marginLeft: 16,
                  fontSize: 24,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {CATALOG_NAME}
              </div>
            </div>

            {album && album.imageCount > 0 ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {album.imageCount > 1
                  ? `${album.imageCount} images`
                  : "1 image"}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
