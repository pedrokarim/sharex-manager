// @vitest-environment jsdom

/**
 * Onglet « Chaîne / Profil » d'un compte : les deux groupes, la proposition
 * tirée de la marque, l'envoi, « Autoriser… » pour une capacité manquante
 * et l'aide pour ce que l'API ne permet pas. Un service fictif : l'onglet
 * ne connaît que les éléments déclarés.
 */

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSummary, ProfileField } from "@/lib/connections/types";
import type { ConnectorView } from "@/components/connections/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createDefaultKit } from "@/modules/brand-kit/lib/defaults";

const actions = vi.hoisted(() => ({
  readProfileAction: vi.fn(),
  updateProfileAction: vi.fn(),
  profileChoicesAction: vi.fn(),
  pushBrandAction: vi.fn(),
  listSectionsAction: vi.fn(),
  listPlaylistsAction: vi.fn(),
  listPostsAction: vi.fn(),
  addSectionAction: vi.fn(),
  moveSectionAction: vi.fn(),
  removeSectionAction: vi.fn(),
  createPlaylistAction: vi.fn(),
  updatePlaylistAction: vi.fn(),
  addPlaylistVideoAction: vi.fn(),
}));
const brandApi = vi.hoisted(() => ({ getKit: vi.fn(), saveFormatExport: vi.fn() }));
vi.mock("@/app/(app)/admin/connections/actions", () => actions);
vi.mock("@/modules/brand-kit/lib/client", () => ({ api: brandApi, downloadBlob: vi.fn(), editorHref: (id: string) => `/m/brand-kit/${id}` }));
vi.mock("@/modules/brand-kit/components/format-render", () => ({ renderFormatPng: vi.fn(async () => new Blob()) }));
vi.mock("@/modules/brand-kit/lib/formats", () => ({ buildFormat: vi.fn(() => ({})) }));

import { ChannelTab } from "@/app/(app)/admin/connections/[accountId]/channel-tab";

MotionGlobalConfig.skipAnimations = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const FIELDS: ProfileField[] = [
  { key: "description", label: "Description", kind: "textarea", editable: true, maxLength: 1000, capability: "profile.details", brand: "description" },
  { key: "keywords", label: "Mots-clés", kind: "keywords", editable: true, maxLength: 500, capability: "profile.details", brand: "keywords" },
  { key: "title", label: "Nom de la chaîne", kind: "text", editable: false, brand: "name", manual: { url: "https://studio.tube.test/{externalId}/profil", linkLabel: "Ouvrir Tube Studio" } },
];

function connector(): ConnectorView {
  return {
    id: "tube",
    label: "Tube",
    logo: "tube",
    accountNoun: { one: "chaîne", many: "chaînes" },
    status: "ready",
    capabilities: ["publish.video", "profile.details"],
    scopeSets: [],
    publishFields: [],
    profileFields: FIELDS,
    profileRead: true,
    app: null,
    setupSteps: [],
    consoleUrl: "https://console.tube.test",
  };
}

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: "acc-tube00001",
    connector: "tube",
    connectorLabel: "Tube",
    logo: "tube",
    externalId: "UC123",
    name: "Ma chaîne",
    displayName: "Ma chaîne",
    scopes: [],
    capabilities: ["publish.video", "profile.details"],
    status: "connected",
    connectedAt: 1,
    lastCheckedAt: 1,
    tokenState: "ok",
    requestableCapabilities: [],
    ...overrides,
  };
}

function kit() {
  const value = createDefaultKit("Ma Marque");
  value.tagline = "Les sorties de la semaine";
  value.publishing = { ...value.publishing, tags: ["anime", "jeu vidéo"] };
  return value;
}

function renderTab(overrides: Partial<AccountSummary> = {}) {
  return render(
    <TooltipProvider>
      <ChannelTab account={account(overrides)} connector={connector()} kits={[{ id: "kit-abcdef12", name: "Ma Marque", isDefault: true }]} onPushed={() => undefined} />
    </TooltipProvider>
  );
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
  brandApi.getKit.mockReset();
  brandApi.getKit.mockResolvedValue({ kit: kit(), exports: [] });
  actions.readProfileAction.mockResolvedValue({ ok: true, data: { values: { description: "Ancienne description", keywords: ["anime"], title: "Ma chaîne" }, fetchedAt: 1 } });
});

describe("onglet Chaîne / Profil", () => {
  it("sépare ce qui s'envoie de ce qui se change chez le service, et propose la marque", async () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Modifiable depuis ShareX Manager" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /À changer chez Tube/ })).toBeTruthy();

    // La description proposée est le modèle de la marque, rendu.
    const description = (await screen.findByDisplayValue("Les sorties de la semaine")) as HTMLTextAreaElement;
    expect(description.tagName).toBe("TEXTAREA");
    expect(await screen.findByText("Ancienne description")).toBeTruthy();
    expect(screen.getAllByText("À envoyer")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Tout envoyer \(2\)/ })).toBeTruthy();

    // Ce que l'API ne permet pas : le texte de la marque, et la bonne page du service.
    const manual = screen.getByRole("heading", { name: "Nom de la chaîne" }).closest("div")!.parentElement!;
    expect(within(manual).getByText(/ne permet pas de le changer par son API/)).toBeTruthy();
    expect(within(manual).getByText("Ma Marque")).toBeTruthy();
    expect(within(manual).getByRole("link", { name: /Ouvrir/ }).getAttribute("href")).toBe("https://studio.tube.test/UC123/profil");
  });

  it("envoie la proposition, puis montre la valeur relue « À jour »", async () => {
    const user = userEvent.setup();
    actions.updateProfileAction.mockResolvedValue({
      ok: true,
      data: { values: { description: "Les sorties de la semaine", keywords: ["anime"], title: "Ma chaîne" }, fetchedAt: 2 },
    });
    renderTab();
    await screen.findByDisplayValue("Les sorties de la semaine");
    const row = screen.getByRole("heading", { name: "Description" }).closest("div")!.parentElement!.parentElement!;
    await user.click(within(row).getByRole("button", { name: /Envoyer/ }));
    expect(actions.updateProfileAction).toHaveBeenCalledWith("acc-tube00001", { description: "Les sorties de la semaine" });
    await waitFor(() => expect(screen.getAllByText("À envoyer")).toHaveLength(1));
    expect(screen.getAllByText("À jour").length).toBeGreaterThan(0);
  });

  it("une capacité non accordée propose « Autoriser… », sans bouton d'envoi", async () => {
    renderTab({ capabilities: ["publish.video"], requestableCapabilities: ["profile.details"] });
    await screen.findByDisplayValue("Les sorties de la semaine");
    const links = screen.getAllByRole("link", { name: /Autoriser…/ });
    expect(links).toHaveLength(2);
    const href = new URL(links[0].getAttribute("href")!, "https://sxm.test");
    expect(href.pathname).toBe("/api/connections/tube/connect");
    expect(href.searchParams.get("add")).toBe("profile.details");
    expect(href.searchParams.get("account")).toBe("acc-tube00001");
    expect(screen.queryByRole("button", { name: /^Envoyer$/ })).toBeNull();
  });

  it("un service sans élément modifiable le dit franchement", async () => {
    const readOnly = { ...connector(), profileFields: FIELDS.filter((field) => !field.editable) };
    render(
      <TooltipProvider>
        <ChannelTab account={account()} connector={readOnly} kits={[]} onPushed={() => undefined} />
      </TooltipProvider>
    );
    expect(await screen.findByText(/Tube ne permet de modifier aucun élément du profil par son API/)).toBeTruthy();
  });
});
