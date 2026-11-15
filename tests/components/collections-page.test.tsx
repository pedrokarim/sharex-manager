// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionSummary, Tag } from "@/lib/organization/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/organization/collections",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

import { CollectionsClient } from "@/app/(app)/organization/collections/page.client";
import { CollectionEditor } from "@/app/(app)/organization/collections/collection-editor";

MotionGlobalConfig.skipAnimations = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const NOW = "2026-11-15T10:00:00.000Z";

function summary(overrides: Partial<CollectionSummary>): CollectionSummary {
  return {
    id: 1,
    name: "Collection",
    slug: "collection",
    description: null,
    rules: { kinds: ["image"] },
    sort: "date",
    order: "desc",
    userId: "u1",
    pinned: false,
    createdAt: NOW,
    updatedAt: NOW,
    fileCount: 0,
    cover: [],
    ...overrides,
  };
}

const TAGS: Tag[] = [
  {
    id: 1,
    name: "Valorant",
    slug: "valorant",
    description: null,
    fileCount: 12,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "u1",
    lastUsedAt: NOW,
  },
];

interface Route {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => unknown;
  status?: number;
}

/** `fetch` simulé : chaque route répond par un JSON ; toute autre adresse échoue. */
function mockFetch(routes: Route[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = routes.find((candidate) => candidate.match(url, init));
    if (!route) return new Response(JSON.stringify({ error: `Route inattendue ${url}` }), { status: 500 });
    return new Response(JSON.stringify(route.respond(url, init)), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const get = (path: string) => (url: string, init?: RequestInit) =>
  url === path && (!init?.method || init.method === "GET");
const post = (path: string) => (url: string, init?: RequestInit) => url === path && init?.method === "POST";

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liste des collections", () => {
  it("montre chaque collection avec son nombre et ses règles, épinglées d'abord", async () => {
    mockFetch([
      {
        match: get("/api/collections"),
        // Ordre volontairement faux : la liste remet elle-même les épinglées en tête.
        respond: () => ({ collections: [
          summary({ id: 1, name: "Reçus", slug: "recus", fileCount: 3, rules: { search: "reçu" } }),
          summary({
            id: 2,
            name: "Clips Valorant",
            slug: "clips-valorant",
            pinned: true,
            fileCount: 1284,
            cover: ["a.mp4", "b.png"],
            rules: { kinds: ["video"], tagsAll: ["valorant"], period: { lastDays: 30 } },
          }),
        ] }),
      },
      { match: get("/api/tags"), respond: () => ({ tags: TAGS }) },
    ]);

    render(<CollectionsClient />);

    const items = await screen.findAllByTestId("collection-item");
    expect(items).toHaveLength(2);
    // La collection épinglée passe en tête, même rendue en second par le serveur.
    expect(within(items[0]).getByText("Clips Valorant")).toBeInTheDocument();
    expect(within(items[0]).getByLabelText("Épinglée")).toBeInTheDocument();
    expect(within(items[0]).getByText("Vidéos · tag Valorant · 30 derniers jours")).toBeInTheDocument();
    expect(within(items[0]).getByText(/1\s284 fichiers/)).toBeInTheDocument();
    expect(within(items[0]).getAllByRole("link")[1]).toHaveAttribute("href", "/organization/collections/clips-valorant");
    expect(within(items[1]).getByText("Reçus")).toBeInTheDocument();
    expect(within(items[1]).getByText("3 fichiers")).toBeInTheDocument();
  });

  it("dessine l'état vide avec « Nouvelle collection »", async () => {
    mockFetch([
      { match: get("/api/collections"), respond: () => ({ collections: [] }) },
      { match: get("/api/tags"), respond: () => ({ tags: [] }) },
    ]);

    render(<CollectionsClient />);

    expect(await screen.findByText("Aucune collection")).toBeInTheDocument();
    // Le bouton de l'en-tête et celui de l'état vide.
    expect(screen.getAllByRole("button", { name: "Nouvelle collection" })).toHaveLength(2);
  });

  it("propose de réessayer quand la liste ne se charge pas", async () => {
    mockFetch([{ match: get("/api/collections"), respond: () => ({ error: "Base indisponible" }), status: 500 }]);

    render(<CollectionsClient />);

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

describe("éditeur de collection", () => {
  it("refuse d'enregistrer sans règle, en le disant à côté du bouton", async () => {
    const fetchMock = mockFetch([]);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(<CollectionEditor open onOpenChange={() => {}} tags={TAGS} onSaved={onSaved} />);

    await user.type(screen.getByLabelText("Nom"), "Tout");
    await user.click(screen.getByRole("button", { name: "Créer la collection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ajoutez au moins une règle");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("demande l'aperçu après la saisie, puis crée la collection", async () => {
    const fetchMock = mockFetch([
      { match: post("/api/collections/preview"), respond: () => ({ fileCount: 7, cover: ["facture-1.png"] }) },
      {
        match: post("/api/collections"),
        status: 201,
        respond: (_url, init) => ({
          collection: { ...summary({ id: 9, slug: "factures" }), ...JSON.parse(String(init?.body)) },
        }),
      },
    ]);
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(<CollectionEditor open onOpenChange={() => {}} tags={TAGS} onSaved={onSaved} />);

    expect(screen.getByText("Ajoutez une règle pour voir les fichiers qu’elle retient.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Texte dans le nom du fichier"), "facture");

    await waitFor(() => expect(screen.getByTestId("preview-count")).toHaveTextContent("7 fichiers"));
    const previewCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/collections/preview");
    // La demande attend la fin de la frappe : une seule pour « facture ».
    expect(previewCalls).toHaveLength(1);
    expect(JSON.parse(String(previewCalls[0][1]?.body))).toEqual({
      rules: { search: "facture" },
      sort: "date",
      order: "desc",
    });
    expect(screen.getByText("Nom contenant « facture »")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nom"), "Factures");
    await user.click(screen.getByRole("button", { name: "Créer la collection" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === "/api/collections" && init?.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: "Factures",
      description: null,
      rules: { search: "facture" },
      sort: "date",
      order: "desc",
    });
  });

  it("affiche l'erreur du serveur au-dessus des boutons", async () => {
    mockFetch([
      { match: post("/api/collections/preview"), respond: () => ({ fileCount: 0, cover: [] }) },
      { match: post("/api/collections"), respond: () => ({ error: "Les règles ne sont pas valides.", code: "invalid_rules" }), status: 400 },
    ]);
    const user = userEvent.setup();

    render(<CollectionEditor open onOpenChange={() => {}} tags={TAGS} onSaved={() => {}} />);

    await user.type(screen.getByLabelText("Nom"), "Doublon");
    await user.click(screen.getByRole("radio", { name: "Favoris seulement" }));
    await user.click(screen.getByRole("button", { name: "Créer la collection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Les règles ne sont pas valides.");
  });
});
