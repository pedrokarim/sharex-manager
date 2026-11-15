// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "@/lib/organization/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/icon-theme", () => ({
  THEMED_ICONS: { tags: () => <svg data-testid="tags-icon" /> },
}));

import { TagsPageClient, relativeDate } from "@/app/(app)/organization/tags/page.client";

MotionGlobalConfig.skipAnimations = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const DAY = 86_400_000;
const now = Date.now();

function tag(id: number, name: string, slug: string, fileCount: number, extra: Partial<Tag> = {}): Tag {
  return {
    id,
    name,
    slug,
    fileCount,
    description: null,
    createdAt: new Date(now - 30 * DAY).toISOString(),
    updatedAt: new Date(now - 30 * DAY).toISOString(),
    createdBy: "u1",
    lastUsedAt: null,
    ...extra,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let stored: Tag[];
const requests: Array<{ method: string; url: string; body?: unknown }> = [];

beforeEach(() => {
  requests.length = 0;
  stored = [
    tag(1, "Valorant", "valorant", 12, { lastUsedAt: new Date(now - 2 * DAY).toISOString(), description: "Captures de parties" }),
    tag(2, "Reçu", "recu", 3, { createdBy: "u2", lastUsedAt: new Date(now - 40 * DAY).toISOString() }),
    tag(3, "Maquette", "maquette", 0, { createdBy: null }),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, url, body });
      if (url === "/api/tags" && method === "GET") return json({ tags: stored });
      if (url === "/api/tags" && method === "POST") {
        const created = tag(10, body.name, body.name.toLowerCase(), 0);
        stored = [...stored, created];
        return json({ tag: created, created: true }, 201);
      }
      const match = /^\/api\/tags\/(\d+)$/.exec(url);
      if (match && method === "PATCH") {
        const updated = { ...stored.find((entry) => entry.id === Number(match[1]))!, ...body };
        stored = stored.map((entry) => (entry.id === updated.id ? updated : entry));
        return json({ tag: updated });
      }
      return json({ error: "inconnu" }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const viewer = { id: "u1", isAdmin: false };

function rowNames() {
  const body = screen.getAllByRole("rowgroup")[1];
  return within(body)
    .getAllByRole("row")
    .map((row) => row.getAttribute("data-tag-row"));
}

describe("page des tags", () => {
  it("montre le tableau : nom vers la galerie filtrée, fichiers, dernière pose, créateur", async () => {
    render(<TagsPageClient viewer={viewer} userNames={{ u1: "karim", u2: "lea" }} />);
    const link = await screen.findByRole("link", { name: "Valorant" });
    expect(link).toHaveAttribute("href", "/gallery?tag=valorant");
    const row = link.closest("tr")!;
    expect(within(row).getByText("12")).toBeInTheDocument();
    expect(within(row).getByText("Captures de parties")).toBeInTheDocument();
    expect(within(row).getByText("avant-hier")).toBeInTheDocument();
    expect(within(row).getByText("Vous")).toBeInTheDocument();
    const recu = screen.getByRole("link", { name: "Reçu" }).closest("tr")!;
    expect(within(recu).getByText("lea")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: "Maquette" }).closest("tr")!).getByText("Jamais posé")).toBeInTheDocument();
    expect(screen.getByText("3 tags")).toBeInTheDocument();
  });

  it("trie par colonne, et inverse au second clic", async () => {
    const user = userEvent.setup();
    render(<TagsPageClient viewer={viewer} />);
    await screen.findByRole("link", { name: "Valorant" });
    expect(rowNames()).toEqual(["maquette", "recu", "valorant"]);

    await user.click(screen.getByRole("button", { name: "Fichiers" }));
    expect(rowNames()).toEqual(["valorant", "recu", "maquette"]);
    expect(screen.getByRole("columnheader", { name: "Fichiers" })).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: "Fichiers" }));
    expect(rowNames()).toEqual(["maquette", "recu", "valorant"]);

    // Un tag jamais posé reste en bas, dans les deux sens.
    await user.click(screen.getByRole("button", { name: "Dernière pose" }));
    expect(rowNames()).toEqual(["valorant", "recu", "maquette"]);
  });

  it("filtre par la recherche, sans accents, et dessine l’absence de résultat", async () => {
    const user = userEvent.setup();
    render(<TagsPageClient viewer={viewer} />);
    await screen.findByRole("link", { name: "Valorant" });
    await user.type(screen.getByRole("textbox", { name: "Chercher un tag" }), "recu");
    expect(rowNames()).toEqual(["recu"]);
    await user.clear(screen.getByRole("textbox", { name: "Chercher un tag" }));
    await user.type(screen.getByRole("textbox", { name: "Chercher un tag" }), "zzz");
    expect(screen.getByText(/Aucun tag ne correspond/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(rowNames()).toHaveLength(3);
  });

  it("dessine l’état vide, avec le champ de création qui ajoute la première ligne", async () => {
    stored = [];
    const user = userEvent.setup();
    render(<TagsPageClient viewer={viewer} />);
    expect(await screen.findByText("Aucun tag pour l’instant")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Nom du nouveau tag" }), "Valorant");
    await user.click(screen.getByRole("button", { name: "Créer le tag" }));
    expect(await screen.findByRole("link", { name: "Valorant" })).toBeInTheDocument();
    expect(requests.find((request) => request.method === "POST")?.body).toEqual({ name: "Valorant" });
  });

  it("renomme sur place depuis le menu de la ligne", async () => {
    const user = userEvent.setup();
    render(<TagsPageClient viewer={viewer} />);
    await screen.findByRole("link", { name: "Valorant" });
    await user.click(screen.getByRole("button", { name: "Actions du tag Valorant" }));
    await user.click(await screen.findByRole("menuitem", { name: "Renommer" }));
    const input = await screen.findByRole("textbox", { name: "Nouveau nom de Valorant" });
    await user.clear(input);
    await user.type(input, "Valorant ranked{Enter}");
    expect(await screen.findByRole("link", { name: "Valorant ranked" })).toBeInTheDocument();
    expect(requests.find((request) => request.method === "PATCH")).toMatchObject({ url: "/api/tags/1", body: { name: "Valorant ranked" } });
    expect(screen.getByText("Renommé")).toBeInTheDocument();
  });

  it("ne propose ni renommage ni suppression sur le tag d’un autre compte, ni fusion hors admin", async () => {
    const user = userEvent.setup();
    render(<TagsPageClient viewer={viewer} />);
    await screen.findByRole("link", { name: "Reçu" });
    await user.click(screen.getByRole("button", { name: "Actions du tag Reçu" }));
    await screen.findByRole("menuitem", { name: "Voir les fichiers" });
    expect(screen.queryByRole("menuitem", { name: "Renommer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Supprimer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Fusionner/ })).not.toBeInTheDocument();
  });

  it("dit l’échec du chargement et permet de réessayer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Base indisponible" }, 500)));
    render(<TagsPageClient viewer={viewer} />);
    expect(await screen.findByText("Base indisponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

describe("relativeDate", () => {
  it("écrit une date passée en mots", () => {
    expect(relativeDate(new Date(now - 10_000).toISOString(), now)).toBe("à l’instant");
    expect(relativeDate(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("il y a 3 heures");
  });
});
