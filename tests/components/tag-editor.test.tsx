// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag, TagRef } from "@/lib/organization/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { TagEditor, tagOptions } from "@/components/tags/tag-editor";
import { FileTags } from "@/components/tags/file-tags";
import { batchTagsMessage } from "@/components/tags/batch-tags-dialog";

MotionGlobalConfig.skipAnimations = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

function tag(id: number, name: string, slug: string, fileCount: number): Tag {
  return {
    id,
    name,
    slug,
    fileCount,
    description: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    createdBy: "u1",
    lastUsedAt: null,
  };
}

const TAGS = [tag(1, "Valorant", "valorant", 12), tag(2, "Jeu vidéo", "jeu-video", 30), tag(3, "Reçu", "recu", 2)];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function Controlled({ initial = [], ...props }: { initial?: string[]; allowCreate?: boolean; tags?: Tag[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <TagEditor value={value} onChange={setValue} tags={props.tags ?? TAGS} allowCreate={props.allowCreate} />
      <output data-testid="value">{value.join("|")}</output>
    </>
  );
}

describe("tagOptions", () => {
  it("propose les tags qui contiennent la saisie, sans accents ni casse, le plus proche d’abord", () => {
    const options = tagOptions("JEU", TAGS, new Set(), true);
    // « JEU » n'est le slug d'aucun tag : sa création reste proposée, après les suggestions.
    expect(options.map((option) => (option.kind === "tag" ? option.tag.name : `+${option.name}`))).toEqual(["Jeu vidéo", "+JEU"]);
    expect(tagOptions("recu", TAGS, new Set(), true)[0]).toMatchObject({ kind: "tag", tag: { slug: "recu" } });
  });

  it("propose la création d’un nom inconnu, jamais celle d’un nom au même slug qu’un tag existant", () => {
    expect(tagOptions("Maquette", TAGS, new Set(), true).at(-1)).toEqual({ kind: "create", name: "Maquette" });
    expect(tagOptions("jeu video", TAGS, new Set(), true).some((option) => option.kind === "create")).toBe(false);
    expect(tagOptions("Maquette", TAGS, new Set(), false)).toEqual([]);
  });

  it("écarte les tags déjà choisis et montre les plus posés quand le champ est vide", () => {
    const options = tagOptions("", TAGS, new Set(["jeu-video"]), true);
    expect(options.map((option) => option.kind === "tag" && option.tag.name)).toEqual(["Valorant", "Reçu"]);
  });
});

describe("TagEditor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ajoute une suggestion choisie au clic", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole("combobox", { name: "Tags" }), "valo");
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: /Valorant/ }));
    expect(screen.getByTestId("value")).toHaveTextContent("Valorant");
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("crée un tag inconnu à la volée avec Entrée", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.type(screen.getByRole("combobox"), "Maquette");
    expect(await screen.findByRole("option", { name: /Créer/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("Maquette");
  });

  it("retire un tag par sa croix et par Retour arrière sur un champ vide", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={["Valorant", "Reçu"]} />);
    await user.click(screen.getByRole("button", { name: "Retirer le tag Valorant" }));
    expect(screen.getByTestId("value")).toHaveTextContent(/^Reçu$/);
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("value")).toBeEmptyDOMElement();
  });

  it("sans création, un nom inconnu ne s’ajoute pas", async () => {
    const user = userEvent.setup();
    render(<Controlled allowCreate={false} />);
    await user.type(screen.getByRole("combobox"), "Maquette{Enter}");
    expect(await screen.findByText("Aucun tag ne porte ce nom.")).toBeInTheDocument();
    expect(screen.getByTestId("value")).toBeEmptyDOMElement();
  });

  it("charge les tags connus quand l’appelant ne les fournit pas", async () => {
    const fetchMock = vi.fn(async () => json({ tags: TAGS }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    function Uncontrolled() {
      const [value, setValue] = useState<string[]>([]);
      return <TagEditor value={value} onChange={setValue} />;
    }
    render(<Uncontrolled />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/tags", expect.anything()));
    await user.type(screen.getByRole("combobox"), "va");
    expect(await screen.findByRole("option", { name: /Valorant/ })).toBeInTheDocument();
  });
});

describe("FileTags", () => {
  let fileTags: TagRef[];
  const puts: unknown[] = [];

  beforeEach(() => {
    fileTags = [{ id: 1, name: "Valorant", slug: "valorant" }];
    puts.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/tags") return json({ tags: TAGS });
        if (url === "/api/files/capture.png/tags") {
          if (init?.method === "PUT") {
            const names = (JSON.parse(String(init.body)) as { tags: string[] }).tags;
            puts.push(names);
            fileTags = names.map((name, index) => TAGS.find((entry) => entry.name === name) ?? { id: 100 + index, name, slug: name.toLowerCase() });
          }
          return json({ tags: fileTags.map(({ id, name, slug }) => ({ id, name, slug })) });
        }
        return json({ error: "inconnu" }, 404);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("montre les tags du fichier, avec un lien vers la galerie filtrée", async () => {
    render(<FileTags fileName="capture.png" />);
    const link = await screen.findByRole("link", { name: "Valorant" });
    expect(link).toHaveAttribute("href", "/gallery?tag=valorant");
  });

  it("enregistre aussitôt un ajout et un retrait, et le dit à côté du titre", async () => {
    const user = userEvent.setup();
    render(<FileTags fileName="capture.png" />);
    await screen.findByRole("link", { name: "Valorant" });

    await user.type(screen.getByRole("combobox"), "Nouveau{Enter}");
    await waitFor(() => expect(puts).toEqual([["Valorant", "Nouveau"]]));
    expect(await screen.findByText("Enregistré")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retirer le tag Valorant" }));
    await waitFor(() => expect(puts.at(-1)).toEqual(["Nouveau"]));
    expect(screen.queryByRole("link", { name: "Valorant" })).not.toBeInTheDocument();
  });

  it("revient aux tags enregistrés quand le serveur refuse", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/tags") return json({ tags: TAGS });
        if (init?.method === "PUT") return json({ error: "30 tags au plus par fichier" }, 400);
        return json({ tags: [{ id: 1, name: "Valorant", slug: "valorant" }] });
      }),
    );
    render(<FileTags fileName="capture.png" />);
    await screen.findByRole("link", { name: "Valorant" });
    await user.click(screen.getByRole("button", { name: "Retirer le tag Valorant" }));
    expect(await screen.findByText("30 tags au plus par fichier")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Valorant" })).toBeInTheDocument();
  });
});

describe("batchTagsMessage", () => {
  it("dit le tag et le nombre de fichiers", () => {
    expect(batchTagsMessage("add", ["Valorant"], 12)).toBe("« Valorant » ajouté à 12 fichiers");
    expect(batchTagsMessage("remove", ["a", "b"], 1)).toBe("2 tags retirés de 1 fichier");
  });
});
