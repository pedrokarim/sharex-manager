// @vitest-environment jsdom

import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "@/lib/i18n/locales/fr.json";

const nav = vi.hoisted(() => ({ pathname: "/", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("next/image", () => ({
  default: ({ priority: _priority, ...props }: any) => <img {...props} />,
}));

// Les vrais textes français : le test lit ce que l'interface affichera.
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const value = key.split(".").reduce<any>((node, part) => node?.[part], fr);
      if (typeof value !== "string") return key;
      return value.replace(/\{(\w+)\}/g, (_, name) => params?.[name] ?? "");
    },
  }),
}));

vi.mock("@/components/sidebar/nav-user", () => ({ NavUser: () => <div data-testid="nav-user" /> }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button type="button">Thème</button> }));

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const modules = [
  {
    moduleName: "clip-studio",
    title: "Clip Studio",
    url: "/m/clip-studio",
    icon: "Clapperboard",
    logo: "/logo.png",
    subItems: [
      { title: "Projets", url: "/m/clip-studio/projects" },
      { title: "Exports", url: "/m/clip-studio/exports" },
    ],
    pages: [],
  },
];

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar isAdmin moduleNavItems={modules} user={{ name: "Test", email: "test@example.test" }} />
    </SidebarProvider>,
  );
}

function link(name: string) {
  return screen.getAllByRole("link", { name }).find((el) => el.getAttribute("data-slot")?.startsWith("sidebar-menu"))!;
}

beforeEach(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
});

describe("barre latérale", () => {
  it("marque la sous-page et son module, ouvre leur section, laisse les autres fermées", () => {
    nav.pathname = "/m/clip-studio/exports";
    renderSidebar();

    expect(link("Exports")).toHaveAttribute("data-active", "true");
    expect(link("Exports")).toHaveAttribute("aria-current", "page");
    expect(link("Clip Studio")).toHaveAttribute("data-active", "true");
    expect(link("Galerie")).toHaveAttribute("data-active", "false");

    const clipToggle = screen.getByRole("button", { name: "Replier « Clip Studio »" });
    expect(clipToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Déplier « Galerie »" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Administration" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Utilisateurs" })).toBeNull();
  });

  it("range les modules avant l'administration, sous des titres sans doublon", () => {
    nav.pathname = "/gallery";
    renderSidebar();

    const labels = Array.from(document.querySelectorAll('[data-sidebar="group-label"]')).map((el) => el.textContent);
    expect(labels).toEqual(["Mon espace", "Modules et outils", "Administration"]);
    expect(screen.getByRole("link", { name: "Envois" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avis" })).toBeInTheDocument();
  });

  it("ouvre l'administration sur une page d'admin et garde le réglage des autres sections", async () => {
    const user = userEvent.setup();
    nav.pathname = "/gallery/starred";
    const view = renderSidebar();

    // Galerie ouverte d'elle-même ; on la referme, puis on va en admin.
    await user.click(screen.getByRole("button", { name: "Replier « Galerie »" }));
    nav.pathname = "/admin/logs";
    await act(async () => {
      view.rerender(
        <SidebarProvider>
          <AppSidebar isAdmin moduleNavItems={modules} user={{ name: "Test", email: "test@example.test" }} />
        </SidebarProvider>,
      );
    });

    expect(screen.getByRole("button", { name: "Administration" })).toHaveAttribute("aria-expanded", "true");
    expect(link("Journaux")).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Déplier « Galerie »" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("nomme le bouton de la barre en français", () => {
    nav.pathname = "/gallery";
    renderSidebar();
    const rail = document.querySelector('[data-sidebar="rail"]')!;
    expect(rail).toHaveAttribute("aria-label", "Afficher ou masquer la barre latérale");
    expect(within(document.body).queryByText("Toggle Sidebar")).toBeNull();
  });
});
