// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ priority: _priority, fill: _fill, ...props }: any) => <img {...props} />,
}));

// next/font ne s'exécute que dans la compilation de Next.
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "font-front-display", className: "font-front-display" }),
}));

import PublicError from "@/app/error";
import AppError from "@/app/(app)/error";
import GlobalError from "@/app/global-error";

MotionGlobalConfig.skipAnimations = true;

const failure = (digest?: string) => Object.assign(new Error("détail interne : mot de passe"), digest ? { digest } : {});

afterEach(() => vi.restoreAllMocks());

describe("pages d'erreur", () => {
  it("page publique : titre en français, code à citer, réessayer et retour à l'accueil", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<PublicError error={failure("abc123")} retry={retry} />);

    expect(screen.getByRole("heading", { level: 1, name: "Cette page n’a pas pu s’afficher" })).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revenir à l’accueil" })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retry).toHaveBeenCalledTimes(1);
    // Le message de l'erreur peut contenir des détails internes : jamais affiché.
    expect(screen.queryByText(/mot de passe/)).not.toBeInTheDocument();
  });

  it("espace connecté : l'erreur reste dans la page, avec la galerie comme sortie", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<AppError error={failure("xyz789")} retry={retry} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("xyz789")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la galerie" })).toHaveAttribute("href", "/gallery");
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/mot de passe/)).not.toBeInTheDocument();
  });

  it("espace connecté : le dit quand l'erreur n'a pas de code", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppError error={failure()} retry={() => {}} />);
    expect(screen.getByText("Aucun code n’a été donné pour cette erreur.")).toBeInTheDocument();
  });

  it("erreur globale : son propre document, sans dépendre des styles du site", async () => {
    // Un <html> ne se monte pas dans le conteneur de jsdom : on lit le balisage rendu.
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(<GlobalError error={failure("g-1")} retry={() => {}} />);
    expect(html.startsWith('<html lang="fr">')).toBe(true);
    expect(html).toContain("ShareX Manager n’a pas pu s’afficher");
    expect(html).toContain("g-1");
    expect(html).toContain('href="/"');
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("mot de passe");
    // Aucune feuille de style du site : tout est écrit dans la page.
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
  });
});
