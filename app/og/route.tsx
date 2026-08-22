import { ImageResponse } from "next/og";

import { LOGO_SITE, loadPublicImage } from "@/lib/og-assets";
import { SITE_NAME } from "@/lib/seo";

const size = { width: 1200, height: 630 };

/**
 * Image Open Graph par défaut du site, servie à une URL stable.
 *
 * Volontairement une route et non un `opengraph-image.tsx` : la convention de
 * fichier n'attache son image qu'au segment qui la déclare, et disparaît dès
 * qu'une page enfant définit son propre bloc `openGraph`. Une route se
 * référence explicitement, depuis n'importe où.
 *
 * `next/og` ne comprend qu'un sous-ensemble de CSS — pas de `gap`, pas de
 * raccourci `background`, et tout conteneur à plusieurs enfants doit déclarer
 * son `display: flex`.
 */
export async function GET() {
  const logo = await loadPublicImage(LOGO_SITE, { size: 128 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#0c0a14",
          backgroundImage:
            "radial-gradient(900px 500px at 15% -10%, #3b2f7a 0%, transparent 60%), radial-gradient(700px 500px at 100% 110%, #4c3fb5 0%, transparent 55%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {logo ? (
            <img src={logo} width={64} height={64} style={{ width: 64, height: 64 }} />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                display: "flex",
                backgroundColor: "#6d5cf5",
              }}
            />
          )}
          <div
            style={{
              marginLeft: 22,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              maxWidth: 900,
            }}
          >
            Vos captures, chez vous.
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 30,
              color: "rgba(255,255,255,0.72)",
              maxWidth: 860,
              lineHeight: 1.35,
            }}
          >
            Gestionnaire d&apos;images auto-hébergé pour ShareX, Flameshot et
            mobile.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 24,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          ShareX · Flameshot · Android · Liens permanents · Sans publicité
        </div>
      </div>
    ),
    size,
  );
}
