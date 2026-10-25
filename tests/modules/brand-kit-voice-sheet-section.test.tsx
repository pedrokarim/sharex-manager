// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/brand-kit/lib/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/brand-kit/lib/client")>();
  return { ...actual, api: { ...actual.api, startVoiceDraft: vi.fn(), getVoiceDraftJob: vi.fn(), cancelVoiceDraft: vi.fn() } };
});

import { VoiceSheetSection } from "@/modules/brand-kit/components/sections/voice-sheet-section";
import { api } from "@/modules/brand-kit/lib/client";
import { createDefaultKit } from "@/modules/brand-kit/lib/defaults";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import { emptyVoiceSheet } from "@/modules/brand-kit/lib/voice-sheet";

// Radix mesure ses éléments ; jsdom ne connaît pas ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

type Mutate = (draft: BrandKit) => BrandKit;

/** Rejoue chaque modification demandée par la section, comme l'éditeur. */
function harness(initial: BrandKit) {
  let kit = initial;
  const update = vi.fn((mutate: Mutate) => {
    kit = mutate(kit);
  });
  return { update, current: () => kit };
}

describe("section « Voix du créateur » de l'éditeur de la marque", () => {
  it("écrit les réponses dans la fiche de la marque", async () => {
    const kit = createDefaultKit("Atelier Copeau");
    const state = harness(kit);
    const { rerender } = render(<VoiceSheetSection kit={kit} update={state.update} />);
    expect(screen.getByText(/0 sur 8 questions/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Que faites-vous/), "J");
    expect(state.current().voiceSheet?.pitch).toBe("J");

    rerender(<VoiceSheetSection kit={state.current()} update={state.update} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Une preuve par ligne" }), "40 ateliers accompagnés{Enter}");
    expect(state.current().voiceSheet?.proofs).toEqual(["40 ateliers accompagnés"]);
    rerender(<VoiceSheetSection kit={state.current()} update={state.update} />);
    expect(screen.getByText(/2 sur 8 questions/)).toBeInTheDocument();
  });

  it("montre la proposition à relire, et ne reprend que ce qui est coché", async () => {
    vi.mocked(api.startVoiceDraft).mockResolvedValue({ id: "job-abcd1234", kitId: "kit-abcdef", status: "running", createdAt: 1 });
    vi.mocked(api.getVoiceDraftJob).mockResolvedValue({
      id: "job-abcd1234",
      kitId: "kit-abcdef",
      status: "done",
      createdAt: 1,
      draft: { ...emptyVoiceSheet(), pitch: "J’aide les menuisiers à trouver des clients", proofs: ["40 ateliers accompagnés"] },
    });
    const kit = { ...createDefaultKit("Atelier Copeau"), voiceSheet: { ...emptyVoiceSheet(), pitch: "Ma phrase à moi" } };
    const state = harness(kit);
    render(<VoiceSheetSection kit={kit} update={state.update} />);

    await userEvent.click(screen.getByRole("button", { name: /Proposer à partir de mes textes/ }));
    await userEvent.type(screen.getByLabelText("Vos textes"), "Je suis menuisier à Nantes depuis 2011, 40 ateliers accompagnés.");
    await userEvent.click(screen.getByRole("button", { name: "Proposer" }));
    expect(api.startVoiceDraft).toHaveBeenCalledWith(kit.id, "Je suis menuisier à Nantes depuis 2011, 40 ateliers accompagnés.");
    // Rien n'est repris tant que la proposition n'est pas relue.
    expect(state.update).not.toHaveBeenCalled();

    const proofs = await screen.findByRole("checkbox", { name: /Vos preuves/ }, { timeout: 4000 });
    const pitch = screen.getByRole("checkbox", { name: /Ce que vous faites/ });
    // Une question vide se remplit d'office ; une réponse existante attend un accord, et reste affichée.
    expect(proofs).toHaveAttribute("data-state", "checked");
    expect(pitch).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText(/Remplacerait/)).toHaveTextContent("Ma phrase à moi");

    await userEvent.click(screen.getByRole("button", { name: "Reprendre 1 réponse" }));
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.current().voiceSheet?.pitch).toBe("Ma phrase à moi");
    expect(state.current().voiceSheet?.proofs).toEqual(["40 ateliers accompagnés"]);
    await waitFor(() => expect(screen.getByText(/reprise/)).toBeInTheDocument());
  });
});
