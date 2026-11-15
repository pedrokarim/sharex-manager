// @vitest-environment jsdom

import React, { useState } from "react";
import { getDefaultNormalizer, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Inspector } from "@/modules/clip-studio/components/inspector";
import { PublishRightsLines } from "@/modules/clip-studio/components/music-rights";
import { addItem, createMusicItems, createProject } from "@/modules/clip-studio/engine/edit";
import type { ClipProject, MediaSource } from "@/modules/clip-studio/engine/types";
import { groupRightsWarnings, projectRightsWarnings, unconfirmedBlockers, type RightsTrack } from "@/modules/clip-studio/lib/rights-warnings";

// Radix mesure ses éléments ; jsdom ne connaît pas ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Les espaces insécables comptent : le normaliseur par défaut les ramènerait à des espaces.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false, trim: true }) };

const CLAIMED = "cafeace9-eb96-4459-8705-f4f246658804";
const RISKY = "11111111-1111-4111-8111-111111111111";

const bank: RightsTrack[] = [
  { id: CLAIMED, title: "Epic Hip-Hop", artist: "Soundrider/Dope", rights: { state: "claimed", reason: "Revendiqué par HAAWK au nom de Soundrider.", since: "2026-11-15" } },
  { id: RISKY, title: "Risqué", artist: "Quelqu’un", rights: { state: "at-risk" } },
];

const source = (id: string): MediaSource => ({
  url: `/api/modules/clip-studio/data/resources/music/${id}.mp3`,
  ref: `module:clip-studio/resources/music/${id}.mp3`,
  name: `Morceau ${id.slice(0, 4)}`,
  kind: "audio",
  durationMs: 60_000,
});

function project(...ids: string[]): ClipProject {
  let next = createProject("Droits", "9:16");
  ids.forEach((id, index) => {
    for (const item of createMusicItems(source(id), index * 300, (index + 1) * 300, next.fps)) next = addItem(next, item, undefined, "Musique");
  });
  return next;
}

/** L'envoi de l'écran Publier, réduit à ce qui dépend des droits des musiques. */
function SendHarness({ value }: { value: ClipProject }) {
  const groups = groupRightsWarnings(projectRightsWarnings(value, bank));
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const blocked = unconfirmedBlockers(groups, confirmed).length > 0;
  return (
    <>
      <PublishRightsLines
        groups={groups}
        confirmed={confirmed}
        onConfirm={(id, on) =>
          setConfirmed((current) => {
            const next = new Set(current);
            if (on) next.add(id);
            else next.delete(id);
            return next;
          })
        }
        editorHref={`/m/clip-studio/edit?id=${value.id}`}
      />
      <button type="button" disabled={blocked}>
        Publier
      </button>
    </>
  );
}

describe("écran Publier : musique revendiquée", () => {
  it("affiche la ligne du morceau et garde l'envoi fermé tant qu'on n'a pas confirmé", async () => {
    const value = project(CLAIMED, RISKY);
    render(<SendHarness value={value} />);
    expect(screen.getByText("Musique revendiquée : « Epic Hip-Hop »", exact)).toBeInTheDocument();
    expect(screen.getByText("Musique à risque : « Risqué »", exact)).toBeInTheDocument();
    const firstItem = value.tracks.flatMap((track) => track.items)[0].id;
    expect(screen.getAllByRole("link", { name: /Voir la musique dans l’éditeur/ })[0]).toHaveAttribute("href", `/m/clip-studio/edit?id=${value.id}&item=${firstItem}`);

    // Une seule case : le morceau à risque ne bloque pas.
    const confirm = screen.getByRole("checkbox", { name: "Publier quand même avec ce morceau revendiqué" });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    const send = screen.getByRole("button", { name: "Publier" });
    expect(send).toBeDisabled();

    await userEvent.click(confirm);
    expect(send).toBeEnabled();
    await userEvent.click(confirm);
    expect(send).toBeDisabled();
  });

  it("ne montre rien pour un projet sans morceau en cause", () => {
    const { container } = render(<SendHarness value={project()} />);
    expect(container.querySelector("ul")).toBeNull();
    expect(screen.getByRole("button", { name: "Publier" })).toBeEnabled();
  });
});

describe("inspecteur : musique en cause", () => {
  it("dit l'état et la raison, et propose de remplacer le morceau", async () => {
    const value = project(CLAIMED);
    const [warning] = projectRightsWarnings(value, bank);
    const onReplaceMusic = vi.fn();
    render(<Inspector project={value} item={warning.item} onPatch={vi.fn()} onClose={vi.fn()} rightsWarning={warning} onReplaceMusic={onReplaceMusic} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Revendiqué · « Epic Hip-Hop »");
    expect(text).toContain("Revendiqué par HAAWK au nom de Soundrider.");
    expect(text).toContain("Constaté le 15/11/2026.");
    await userEvent.click(screen.getByRole("button", { name: /Remplacer depuis le panneau Musique/ }));
    expect(onReplaceMusic).toHaveBeenCalledWith(warning.item.id);
  });

  it("reste muet pour un son sans avertissement", () => {
    const value = project(CLAIMED);
    const item = value.tracks.flatMap((track) => track.items)[0];
    render(<Inspector project={value} item={item} onPatch={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("Droits de la musique")).toBeNull();
  });
});
