"use client";

import { useEffect } from "react";

/**
 * Erreur dans la mise en page racine elle-même : ce fichier remplace tout le
 * document. Les styles du site, ses polices et son thème ne sont alors pas
 * chargés, d'où les styles écrits ici. La page reprend l'image des pages
 * publiques (photo de brume voilée de vert forêt, texte clair), qui se lit
 * de la même façon en thème clair et sombre.
 */
const FOREST = "#08150e";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <title>Erreur – ShareX Manager</title>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 16px",
            boxSizing: "border-box",
            color: "#fff",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            backgroundColor: FOREST,
            backgroundImage: `linear-gradient(180deg, ${FOREST}cc 0%, ${FOREST}99 50%, ${FOREST}e6 100%), url(/images/home/nature-mist.webp)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div style={{ maxWidth: 560, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "Fraunces, Georgia, 'Times New Roman', serif",
                fontWeight: 500,
                fontSize: "clamp(36px, 7vw, 60px)",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
            >
              ShareX Manager n’a pas pu s’afficher
            </h1>
            <p style={{ margin: "20px 0 0", fontSize: 17, lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>
              Une erreur s’est produite au chargement du site. Réessayez dans un instant ; si elle revient, indiquez ce
              code au support{" "}:{" "}
              <span style={{ fontWeight: 600, color: "#fff", wordBreak: "break-all" }}>{error.digest ?? "aucun code"}</span>.
            </p>
            <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => retry()}
                style={{
                  height: 48,
                  padding: "0 24px",
                  borderRadius: 999,
                  border: 0,
                  background: "#fff",
                  color: FOREST,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Réessayer
              </button>
              {/* Lien ordinaire : la navigation de l'application est peut-être celle qui a échoué. */}
              <a
                href="/"
                style={{
                  height: 48,
                  padding: "0 24px",
                  borderRadius: 999,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.45)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Revenir à l’accueil
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
