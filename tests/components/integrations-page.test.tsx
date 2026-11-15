// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKeyView, CreatedApiKey } from "@/types/api-key";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/icon-theme", () => ({
  THEMED_ICONS: { integrations: () => <svg data-testid="integrations-icon" /> },
}));
// Le dessin du QR code n'est pas l'objet de ces tests : on garde ce qu'il reçoit.
const qrInputs: string[] = [];
vi.mock("qrcode", () => ({
  default: {
    toDataURL: async (data: string) => {
      qrInputs.push(data);
      return "data:image/png;base64,UVI=";
    },
  },
}));

import { IntegrationsPageClient, toolStatus } from "@/app/(app)/settings/integrations/page.client";

MotionGlobalConfig.skipAnimations = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const VIEWER = "alice";
const SECRET = "sk_createdByServer0123456789abcdefghijklmnop";
const PASTED = "sk_pastedByHand0123456789abcdefghijklmnopqrs";
const HOUR = 3_600_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function view(overrides: Partial<ApiKeyView> = {}): ApiKeyView {
  return {
    id: "key_1",
    name: "Clé",
    prefix: "sk_abcdef",
    createdAt: new Date(Date.now() - 48 * HOUR).toISOString(),
    expiresAt: null,
    createdBy: VIEWER,
    permissions: { uploadImages: true, uploadText: false, uploadFiles: false, extractColors: false },
    ...overrides,
  };
}

let stored: ApiKeyView[];
const requests: Array<{ method: string; url: string; body?: string }> = [];
const downloads: Array<{ name: string; blob: Blob }> = [];
let lastBlob: Blob | null = null;

beforeEach(() => {
  stored = [];
  requests.length = 0;
  downloads.length = 0;
  qrInputs.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, url, body: init?.body ? String(init.body) : undefined });
      if (url === "/api/api-keys" && method === "GET") return json(stored);
      if (url === "/api/api-keys/policy") return json({ defaultExpiryDays: 90, maxExpiryDays: null });
      if (url === "/api/api-keys" && method === "POST") {
        const body = JSON.parse(String(init?.body));
        const created: CreatedApiKey = { ...view({ id: "key_new", name: body.name, permissions: body.permissions, tool: body.tool }), key: SECRET };
        return json(created);
      }
      return json({ error: "inconnu" }, 404);
    }),
  );
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    lastBlob = blob as Blob;
    return "blob:sxm-test";
  };
  URL.revokeObjectURL = () => {};
  // jsdom ne sait pas suivre un lien de téléchargement : on note ce qu'il aurait enregistré.
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    if (this.download && lastBlob) downloads.push({ name: this.download, blob: lastBlob });
  };
});

const panel = (name: string) => screen.getByRole("region", { name });
// Le Blob de jsdom ne se lit pas par le `Response` de Node : on passe par FileReader.
const blobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe("état de chaque outil", () => {
  it("dit « Aucune clé » sans clé, ne compte que les clés valides du compte", async () => {
    stored = [
      view({ id: "k1", tool: "mobile", lastUsed: new Date(Date.now() - 3 * HOUR).toISOString() }),
      view({ id: "k2", tool: "mobile" }),
      // Celle d'un autre compte (l'administrateur les reçoit toutes) et une clé expirée.
      view({ id: "k3", tool: "sharex", createdBy: "bob" }),
      view({ id: "k4", tool: "flameshot", expiresAt: new Date(Date.now() - HOUR).toISOString() }),
      view({ id: "k5" }),
    ];
    render(<IntegrationsPageClient viewerId={VIEWER} />);

    expect(await within(panel("ShareX (Windows)")).findByText("Aucune clé pour cet outil")).toBeInTheDocument();
    expect(within(panel("Flameshot et fu (Linux)")).getByText("Aucune clé pour cet outil")).toBeInTheDocument();
    expect(within(panel("ShareX Mobile (Android)")).getByText(/^2 clés · dernier envoi il y a 3\sh$/)).toBeInTheDocument();
    for (const name of ["ShareX (Windows)", "Flameshot et fu (Linux)", "ShareX Mobile (Android)"]) {
      expect(within(panel(name)).getByRole("link", { name: "Gérer les clés" })).toHaveAttribute("href", "/settings/api-keys");
    }
  });

  it("toolStatus : une clé jamais utilisée", () => {
    expect(toolStatus([view({ tool: "sharex" })], "sharex")).toBe("1 clé · aucun envoi pour l’instant");
    expect(toolStatus([], "sharex")).toBe("Aucune clé pour cet outil");
  });
});

describe("créer une clé pour un outil", () => {
  it("crée la clé avec son outil, puis propose le fichier .sxcu une seule fois", async () => {
    const user = userEvent.setup();
    render(<IntegrationsPageClient viewerId={VIEWER} />);
    const sharex = panel("ShareX (Windows)");
    await within(sharex).findByText("Aucune clé pour cet outil");
    expect(within(sharex).queryByRole("button", { name: /Télécharger le fichier \.sxcu/ })).toBeNull();

    await user.click(within(sharex).getByRole("button", { name: "Créer une clé pour ShareX" }));

    const post = requests.find((request) => request.method === "POST");
    expect(JSON.parse(post!.body!)).toEqual({
      name: "ShareX – Windows",
      permissions: { uploadImages: true, uploadText: true, uploadFiles: true, extractColors: false },
      expiresInDays: 90,
      tool: "sharex",
    });

    const buttons = await within(sharex).findAllByRole("button", { name: /Télécharger le fichier \.sxcu/ });
    expect(buttons).toHaveLength(1);
    expect(within(sharex).getByText(/ne sera plus affichée/)).toBeInTheDocument();
    expect(within(sharex).getByText(SECRET)).toBeInTheDocument();
    expect(within(sharex).getByText("1 clé · aucun envoi pour l’instant")).toBeInTheDocument();

    await user.click(buttons[0]);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe("sharex-windows.sxcu");
    const sxcu = JSON.parse(await blobText(downloads[0].blob));
    expect(sxcu.Headers["x-api-key"]).toBe(SECRET);
    expect(sxcu.Name).toBe("ShareX – Windows");
    expect(sxcu.DestinationType).toBe("ImageUploader, TextUploader, FileUploader");
    expect(sxcu.RequestURL).toBe(`${window.location.origin}/api/upload`);

    // Une fois fermé, le fichier ne se refait plus : le serveur n'a plus la clé.
    await user.click(within(sharex).getByRole("button", { name: "J’ai terminé" }));
    expect(within(sharex).queryByRole("button", { name: /Télécharger le fichier \.sxcu/ })).toBeNull();
    expect(within(sharex).queryByText(SECRET)).toBeNull();
  });

  it("affiche le refus du serveur à côté du bouton", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementationOnce(async () => json([]));
    vi.mocked(fetch).mockImplementationOnce(async () => json({ defaultExpiryDays: 90, maxExpiryDays: null }));
    vi.mocked(fetch).mockImplementationOnce(async () => json({ error: "Outil inconnu." }, 400));
    render(<IntegrationsPageClient viewerId={VIEWER} />);
    const mobile = panel("ShareX Mobile (Android)");
    await within(mobile).findByText("Aucune clé pour cet outil");
    await user.click(within(mobile).getByRole("button", { name: "Créer une clé pour ShareX Mobile" }));
    expect(await within(mobile).findByRole("alert")).toHaveTextContent("Outil inconnu.");
  });
});

describe("clé déjà en main", () => {
  it("fabrique le .sxcu dans le navigateur, sans envoyer la clé", async () => {
    const user = userEvent.setup();
    render(<IntegrationsPageClient viewerId={VIEWER} />);
    const linux = panel("Flameshot et fu (Linux)");
    await within(linux).findByText("Aucune clé pour cet outil");

    await user.click(within(linux).getByRole("tab", { name: "J’ai déjà une clé" }));
    expect(within(linux).getByText(/rien n’est envoyé au serveur/)).toBeInTheDocument();
    await user.type(within(linux).getByLabelText("Clé API"), PASTED);
    await user.click(within(linux).getByRole("button", { name: /Télécharger le fichier \.sxcu/ }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe("flameshot-linux.sxcu");
    const sxcu = JSON.parse(await blobText(downloads[0].blob));
    expect(sxcu.Headers["x-api-key"]).toBe(PASTED);
    expect(sxcu.DestinationType).toBe("ImageUploader");

    // Aucun appel autre que les deux lectures de la page, et jamais la clé.
    expect(requests.map((request) => `${request.method} ${request.url}`).sort()).toEqual(["GET /api/api-keys", "GET /api/api-keys/policy"]);
    expect(JSON.stringify(requests)).not.toContain(PASTED);

    // Les commandes de fu reprennent le nom du fichier.
    expect(within(linux).getByText(/fu add ~\/Téléchargements\/flameshot-linux\.sxcu/)).toBeInTheDocument();
  });

  it("dessine le QR code mobile au format de l'application", async () => {
    const user = userEvent.setup();
    render(<IntegrationsPageClient viewerId={VIEWER} />);
    const mobile = panel("ShareX Mobile (Android)");
    await within(mobile).findByText("Aucune clé pour cet outil");

    await user.click(within(mobile).getByRole("tab", { name: "J’ai déjà une clé" }));
    await user.type(within(mobile).getByLabelText("Clé API"), PASTED);

    expect(await within(mobile).findByAltText("QR code de configuration pour ShareX Mobile")).toBeInTheDocument();
    await waitFor(() => expect(qrInputs.length).toBeGreaterThan(0));
    expect(JSON.parse(qrInputs.at(-1)!)).toEqual({
      type: "sharex-mobile-config",
      version: "1.0.0",
      serverUrl: window.location.origin,
      apiKey: PASTED,
      permissions: { uploadImages: true, uploadText: false, uploadFiles: true, extractColors: false },
    });
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });
});
