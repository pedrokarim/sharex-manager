// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/une/adresse-inconnue",
  useSearchParams: () => new URLSearchParams(),
}));

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

import { NotFoundView } from "@/components/front/not-found-view";

MotionGlobalConfig.skipAnimations = true;

describe("page 404", () => {
  it("dit que la page n'existe pas, cite l'adresse et mène à l'accueil", () => {
    render(<NotFoundView signedIn={false} />);

    expect(screen.getByRole("heading", { level: 1, name: "Cette page n’existe pas" })).toBeInTheDocument();
    expect(screen.getByText("/une/adresse-inconnue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revenir à l’accueil" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Ouvrir la galerie" })).not.toBeInTheDocument();
  });

  it("propose la galerie à un compte connecté", () => {
    render(<NotFoundView signedIn />);

    expect(screen.getByRole("link", { name: "Revenir à l’accueil" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Ouvrir la galerie" })).toHaveAttribute("href", "/gallery");
  });
});
