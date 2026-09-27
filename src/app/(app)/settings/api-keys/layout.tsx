import type { Metadata } from "next";

/**
 * La page est un composant client, qui ne peut pas exporter de `metadata`.
 * Le titre passe donc par ce layout, resté côté serveur.
 */
export const metadata: Metadata = {
  title: "Clés d'API",
};

export default function ApiKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
