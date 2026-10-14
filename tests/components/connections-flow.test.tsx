// @vitest-environment jsdom

import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSummary, PublishField } from "@/lib/connections/types";
import type { ConnectionsOverview, ConnectorView } from "@/components/connections/types";

// Les actions serveur de la page sont remplacées : le parcours ne parle qu'à elles.
const actions = vi.hoisted(() => ({
  getOverviewAction: vi.fn(),
  saveAppAction: vi.fn(),
  clearAppAction: vi.fn(),
  getPendingAuthorizationAction: vi.fn(),
  finalizePendingAuthorizationAction: vi.fn(),
  cancelPendingAuthorizationAction: vi.fn(),
  setMonthlyBudgetAction: vi.fn(),
  cancelJobAction: vi.fn(),
  retryJobAction: vi.fn(),
}));
vi.mock("@/app/(app)/admin/connections/actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/m/clip-studio",
  useSearchParams: () => new URLSearchParams(),
}));

import { ConnectAccountSheet, describeConnectionError } from "@/components/connections/connect-account-sheet";
import { AppConfigForm } from "@/components/connections/app-config-form";
import { DateTimePicker, formatSchedule } from "@/components/connections/date-time-picker";
import { PublishFieldInput, fieldProblem, measureField } from "@/components/connections/publish-field-input";
import { accountHealth, connectorPhrase, joinWords } from "@/components/connections/shared";
import { CONNECTION_MESSAGE_TYPE, type PublishJobSummary } from "@/lib/connections/types";
import { QueueTab } from "@/app/(app)/admin/connections/[accountId]/queue-tab";

MotionGlobalConfig.skipAnimations = true;
// Radix et cmdk mesurent leurs éléments ; jsdom ne connaît ni ResizeObserver ni scrollIntoView.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const REDIRECT = "https://sxm.example/api/connections/tube/callback";

function connector(overrides: Partial<ConnectorView> = {}): ConnectorView {
  return {
    id: "tube",
    label: "Tube",
    logo: "tube",
    accountNoun: { one: "chaîne", many: "chaînes" },
    status: "ready",
    capabilities: ["publish.video", "posts.list", "posts.manage", "profile.banner"],
    scopeSets: [
      { id: "all", label: "Tout", description: "Publier et gérer.", capabilities: ["publish.video", "posts.list", "posts.manage", "profile.banner"] },
      { id: "upload", label: "Publier seulement", capabilities: ["publish.video", "posts.list"] },
    ],
    publishFields: [],
    app: {
      connector: "tube",
      configured: true,
      source: "file",
      clientId: "client-123",
      envNames: { clientId: "TUBE_CLIENT_ID", clientSecret: "TUBE_CLIENT_SECRET" },
      redirectUri: REDIRECT,
      settings: [],
    },
    setupSteps: ["Créer une application sur https://console.tube.test/apps.", "Coller l’adresse de retour."],
    consoleUrl: "https://console.tube.test",
    ...overrides,
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
    capabilities: ["publish.video"],
    status: "connected",
    connectedAt: 1,
    lastCheckedAt: 1,
    tokenState: "ok",
    ...overrides,
  };
}

function overview(connectors: ConnectorView[], accounts: AccountSummary[] = []): ConnectionsOverview {
  return {
    connectors,
    accounts,
    keySource: "env",
    authUrl: "https://sxm.example",
    publicMedia: { baseUrl: "https://sxm.example", reachable: true },
    billing: {},
  };
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("textes et états", () => {
  it("décrit un service par ses capacités, sans le nommer", () => {
    expect(connectorPhrase(connector())).toBe("Publier des vidéos sur une chaîne ; gérer les publications et changer la bannière.");
    expect(connectorPhrase({ capabilities: ["publish.text", "publish.image"], accountNoun: { one: "compte", many: "comptes" } })).toBe(
      "Publier des messages et des images sur un compte."
    );
    expect(joinWords(["a", "b", "c"])).toBe("a, b et c");
  });

  it("dit le geste qui règle un compte", () => {
    expect(accountHealth(account()).action).toBeNull();
    expect(accountHealth(account({ status: "needs-reconnect" }))).toMatchObject({ tone: "error", action: "reconnect" });
    expect(accountHealth(account({ tokenState: "expiring-soon", tokenRenewal: "automatic" }))).toMatchObject({ tone: "warning", action: "extend" });
    expect(accountHealth(account({ tokenState: "expiring-soon", tokenRenewal: "manual" }))).toMatchObject({ action: "reconnect" });
  });

  it("traduit chaque erreur de connexion en geste", () => {
    expect(describeConnectionError("redirect_uri_mismatch", "Tube").fix).toBe("redirect");
    expect(describeConnectionError("invalid_client", "Tube").fix).toBe("configure");
    expect(describeConnectionError("access_denied", "Tube").fix).toBe("retry");
    expect(describeConnectionError("n_importe_quoi", "Tube").title).toBe("La connexion n’a pas abouti");
  });
});

describe("champs de publication", () => {
  const title: PublishField = { key: "title", kind: "text", label: "Titre", role: "title", maxLength: 10, required: true };
  const description: PublishField = { key: "description", kind: "textarea", label: "Description", maxLength: 10, maxBytes: 10 };

  it("mesure en caractères, en octets ou selon le service", () => {
    expect(measureField(title, "Été 🎬")).toMatchObject({ used: 5, unit: "chars" });
    expect(measureField(description, "Été")).toMatchObject({ used: 5, unit: "bytes" });
    expect(measureField(title, "日本", "weighted")?.used).toBe(4);
    expect(fieldProblem(title, "")).toBe("Titre : obligatoire.");
    expect(fieldProblem(title, "x".repeat(11))).toContain("10 caractères au plus");
    expect(fieldProblem(description, "ééééé é")).toContain("octets au plus");
  });

  it("dessine un choix court en bascules et une longue liste en palette", async () => {
    const privacy: PublishField = {
      key: "privacy",
      kind: "select",
      label: "Visibilité",
      role: "privacy",
      choices: [
        { value: "private", label: "Privée" },
        { value: "public", label: "Publique" },
      ],
    };
    const onChange = vi.fn();
    const { unmount } = render(<PublishFieldInput field={privacy} value="private" onChange={onChange} idPrefix="t" />);
    await userEvent.click(screen.getByRole("radio", { name: "Publique" }));
    expect(onChange).toHaveBeenCalledWith("public");
    unmount();

    const category: PublishField = { key: "category", kind: "select", label: "Catégorie", choices: Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: `Catégorie ${index}` })) };
    render(<PublishFieldInput field={category} value="3" onChange={onChange} idPrefix="t" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Catégorie 3");
  });

  it("visibilité sans choix d’avance : liste déroulante vide, choix exigé ; case figée par le service", async () => {
    const privacy: PublishField = {
      key: "privacy",
      kind: "select",
      label: "Qui peut voir cette vidéo",
      choices: [
        { value: "PUBLIC_TO_EVERYONE", label: "Tout le monde" },
        { value: "SELF_ONLY", label: "Moi uniquement" },
      ],
      noDefault: true,
      required: true,
    };
    expect(fieldProblem(privacy, "")).toMatch(/choisissez/);
    const { unmount } = render(<PublishFieldInput field={privacy} value="" onChange={() => {}} idPrefix="t" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Choisir");
    expect(screen.queryByRole("radio")).toBeNull();
    unmount();

    const duet: PublishField = { key: "allowDuet", kind: "toggle", label: "Autoriser le duo", disabled: true, help: "Coupé dans les réglages de ce compte." };
    render(<PublishFieldInput field={duet} value={false} onChange={() => {}} idPrefix="t" />);
    expect(screen.getByRole("switch", { name: "Autoriser le duo" })).toBeDisabled();
  });

  it("compte les tags en jetons", () => {
    const tags: PublishField = { key: "tags", kind: "tags", label: "Tags", maxTotal: 5 };
    render(<PublishFieldInput field={tags} value={["abc", "def"]} onChange={() => {}} idPrefix="t" />);
    expect(screen.getByText("7/5").closest("[data-state]")).toHaveAttribute("data-state", "over");
    expect(screen.getByRole("button", { name: "Retirer abc" })).toBeInTheDocument();
  });
});

describe("DateTimePicker", () => {
  it("affiche la date choisie et la retire", async () => {
    const onChange = vi.fn();
    const when = new Date(2031, 4, 14, 18, 30).toISOString();
    render(<DateTimePicker value={when} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /14 mai 2031 à 18:30/ })).toBeInTheDocument();
    expect(formatSchedule(when)).toContain("18:30");
    await userEvent.click(screen.getByRole("button", { name: "Retirer la date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("configuration d'une application", () => {
  it("montre ce qui vient de l'environnement sans le faire saisir", () => {
    const fromEnv = connector({
      app: { ...connector().app!, source: "env", clientId: "env-client", settings: [{ key: "config_id", label: "Configuration", required: true, secret: false, source: "env", envName: "TUBE_CONFIG_ID", value: "42" }] },
    });
    render(<AppConfigForm connector={fromEnv} submitLabel="Enregistrer" onSaved={() => {}} />);
    expect(screen.getAllByText(/Fourni par l’environnement du serveur/)).toHaveLength(2);
    expect(screen.queryByLabelText("Identifiant du client")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("vérifie la forme pendant la frappe, puis enregistre", async () => {
    const empty = connector({
      app: {
        ...connector().app!,
        configured: false,
        source: null,
        clientId: undefined,
        settings: [{ key: "config_id", label: "Configuration", required: true, secret: false, source: null, pattern: "\\d+" }],
      },
    });
    actions.saveAppAction.mockResolvedValue({ ok: true, data: overview([connector()]) });
    const onSaved = vi.fn();
    render(<AppConfigForm connector={empty} submitLabel="Enregistrer et continuer" onSaved={onSaved} />);
    const submit = screen.getByRole("button", { name: "Enregistrer et continuer" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Identifiant du client"), "abc def");
    expect(screen.getByText(/ne contient pas d’espace/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Identifiant du client"));
    await userEvent.type(screen.getByLabelText("Identifiant du client"), "abc");
    await userEvent.type(screen.getByLabelText("Secret du client"), "s3cret");
    await userEvent.type(screen.getByLabelText("Configuration"), "x");
    expect(screen.getByText(/Cette valeur n’a pas la forme attendue/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Configuration"));
    await userEvent.type(screen.getByLabelText("Configuration"), "42");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(actions.saveAppAction).toHaveBeenCalledWith("tube", { clientId: "abc", clientSecret: "s3cret", settings: { config_id: "42" } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe("parcours de connexion", () => {
  function Harness(props: Partial<React.ComponentProps<typeof ConnectAccountSheet>> & { data: ConnectionsOverview }) {
    const [open, setOpen] = useState(true);
    return <ConnectAccountSheet open={open} onOpenChange={setOpen} overview={props.data} {...props} />;
  }

  it("mène du service à « C’est prêt » par la fenêtre surgissante", async () => {
    const before = overview([connector(), connector({ id: "soon", label: "Bientôt", status: "planned", app: null })], [account({ id: "acc-old0000001", displayName: "Ancienne" })]);
    const fresh = account({ id: "acc-new0000001", displayName: "Nouvelle chaîne" });
    actions.getOverviewAction.mockResolvedValue({ ok: true, data: { ...before, accounts: [...before.accounts, fresh] } });
    const popup = { closed: false, focus: vi.fn(), close: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const onConnected = vi.fn();
    render(<Harness data={before} onConnected={onConnected} returnLabel="Revenir à la publication" />);

    // 1. Le service : les comptes déjà reliés sont rappelés, un service annoncé n'est pas choisissable.
    expect(await screen.findByText(/Déjà relié/)).toHaveTextContent("Ancienne");
    expect(screen.getByRole("option", { name: /Bientôt/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("option", { name: /Tube/ }));

    // 3. Le niveau d'accès, en clair.
    expect(await screen.findByText("Ne permet pas de gérer les publications")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Publier seulement"));
    await userEvent.click(screen.getByRole("button", { name: "Continuer" }));

    // 4. L'autorisation : une fenêtre surgissante, le tiroir attend.
    await userEvent.click(await screen.findByRole("button", { name: /Ouvrir Tube/ }));
    const url = new URL(String(open.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/connections/tube/connect");
    expect(url.searchParams.get("scopes")).toBe("upload");
    expect(url.searchParams.get("mode")).toBe("popup");
    expect(url.searchParams.get("returnTo")).toBe("/?sxmConnect=1");
    expect(await screen.findByText("En attente de Tube…")).toBeInTheDocument();

    // Un message d'une autre origine est ignoré.
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.test", data: { type: CONNECTION_MESSAGE_TYPE, ok: true, connector: "tube", state: "connected", grantId: "grt-x", accountIds: [fresh.id] } }));
    });
    expect(actions.getOverviewAction).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { origin: window.location.origin, data: { type: CONNECTION_MESSAGE_TYPE, ok: true, connector: "tube", state: "connected", grantId: "grt-x", accountIds: [fresh.id] } })
      );
    });

    // 6. C'est prêt, avec le retour à ce qu'on faisait.
    expect(await screen.findByText("C’est prêt")).toBeInTheDocument();
    expect(screen.getByText("Nouvelle chaîne")).toBeInTheDocument();
    expect(onConnected).toHaveBeenCalledWith([fresh]);
    expect(screen.getByRole("button", { name: /Revenir à la publication/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir le compte/ })).toHaveAttribute("href", "/admin/connections/acc-new0000001");
  });

  it("explique une adresse de retour refusée, avec l'adresse à copier", async () => {
    const data = overview([connector()]);
    render(<Harness data={data} start={{ connectorId: "tube", result: { state: "error", code: "redirect_uri_mismatch", message: "redirect_uri_mismatch" } }} />);
    expect(await screen.findByText("Tube refuse l’adresse de retour")).toBeInTheDocument();
    expect(screen.getByText(REDIRECT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir la console de Tube/ })).toHaveAttribute("href", "https://console.tube.test");
  });

  it("ouvre la configuration quand l'application manque, puis enchaîne", async () => {
    const missing = connector({ app: { ...connector().app!, configured: false, source: null, clientId: undefined } });
    actions.saveAppAction.mockResolvedValue({ ok: true, data: overview([connector()]) });
    render(<Harness data={overview([missing])} />);
    await userEvent.click(await screen.findByRole("option", { name: /Tube/ }));
    expect(await screen.findByText("Adresse de retour à déclarer chez Tube")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir la console/ })).toHaveAttribute("target", "_blank");
    await userEvent.type(screen.getByLabelText("Identifiant du client"), "abc");
    await userEvent.type(screen.getByLabelText("Secret du client"), "def");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));
    expect(await screen.findByRole("radiogroup")).toBeInTheDocument();
  });

  it("fait choisir les comptes trouvés, tous cochés d'avance", async () => {
    actions.getPendingAuthorizationAction.mockResolvedValue({
      ok: true,
      data: {
        id: "pnd-123456",
        connector: "tube",
        connectorLabel: "Tube",
        logo: "tube",
        accountNoun: { one: "page", many: "pages" },
        expiresAt: Date.now() + 600_000,
        accounts: [
          { externalId: "p1", name: "Page un", capabilities: ["publish.video"], existingAccountId: null },
          { externalId: "p2", name: "Page deux", capabilities: ["publish.video"], existingAccountId: "acc-old0000001" },
        ],
      },
    });
    actions.finalizePendingAuthorizationAction.mockResolvedValue({ ok: true, data: { grantId: "grt-1", accounts: [account({ id: "acc-p100000001", displayName: "Page un" })] } });
    actions.getOverviewAction.mockResolvedValue({ ok: true, data: overview([connector()]) });
    render(<Harness data={overview([connector()])} start={{ connectorId: "tube", result: { state: "pending", pendingId: "pnd-123456" } }} />);
    expect(await screen.findByText(/déjà relié, sera mis à jour/)).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.every((box) => box.getAttribute("data-state") === "checked")).toBe(true);
    await userEvent.click(boxes[1]);
    await userEvent.click(screen.getByRole("button", { name: "Relier ce compte" }));
    expect(actions.finalizePendingAuthorizationAction).toHaveBeenCalledWith("pnd-123456", ["p1"]);
    expect(await screen.findByText("C’est prêt")).toBeInTheDocument();
  });

  it("reconnecte directement à l'étape de l'autorisation", async () => {
    render(<Harness data={overview([connector()])} start={{ connectorId: "tube", step: "authorize", scopeSet: "all", reconnect: { accountId: "acc-1", accountName: "Ma chaîne" } }} />);
    expect(await screen.findByText(/Reconnecter « Ma chaîne »/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/le même qu’avant/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Retour" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
  });
});

describe("file des envois", () => {
  const base = {
    accountId: "acc-1",
    connector: "tube",
    source: { module: "clip-studio", id: "exp-1", file: "a.mp4", bytes: 100, kind: "video" as const },
    options: {},
    bytesSent: 100,
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now(),
  };

  it("distingue « pas encore publié » (annulable) de « publié, traitement en cours » (lien)", () => {
    const jobs: PublishJobSummary[] = [
      { ...base, id: "pub-wait01", title: "En attente du service", state: "processing", note: "Le service prépare la vidéo", checkAt: Date.now() + 120_000 },
      { ...base, id: "pub-done01", title: "Déjà en ligne", state: "processing", result: { externalId: "r1", url: "https://example.com/r1" } },
    ];
    render(<QueueTab jobs={jobs} connector={connector()} onChanged={() => {}} />);
    const waiting = screen.getByText("En attente du service").closest("li")!;
    expect(within(waiting).getByText("Le service prépare la vidéo")).toBeInTheDocument();
    expect(within(waiting).getByText(/pas encore publié · prochain passage/i)).toBeInTheDocument();
    expect(within(waiting).getByRole("button", { name: /Annuler/ })).toBeInTheDocument();
    expect(within(waiting).queryByRole("link")).toBeNull();
    const online = screen.getByText("Déjà en ligne").closest("li")!;
    expect(within(online).getByRole("link", { name: /Voir sur Tube/ })).toHaveAttribute("href", "https://example.com/r1");
    expect(within(online).queryByRole("button", { name: /Annuler/ })).toBeNull();
  });

  it("dit qu'une reprise après l'attente ne republie pas", () => {
    const jobs: PublishJobSummary[] = [{ ...base, id: "pub-fail01", title: "Trop long", state: "failed", processingSince: Date.now() - 3 * 3600_000, error: "Le service traite encore." }];
    render(<QueueTab jobs={jobs} connector={connector()} onChanged={() => {}} />);
    expect(screen.getByText(/sans republier/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reprendre/ })).toBeInTheDocument();
  });
});
