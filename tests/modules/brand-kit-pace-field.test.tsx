// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PACE_DESCRIPTIONS, VideoSection } from "@/modules/brand-kit/components/sections/video-section";
import { createDefaultKit } from "@/modules/brand-kit/lib/defaults";
import type { BrandKit } from "@/modules/brand-kit/lib/types";

// Radix mesure ses éléments ; jsdom ne connaît pas ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe("réglage « Rythme du montage » de l'éditeur de la marque", () => {
  it("montre les trois rythmes avec leur phrase, « Normal » quand rien n'est réglé", () => {
    const kit = createDefaultKit("Atelier Lumen");
    render(<VideoSection kit={kit} update={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "Rythme du montage" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Normal/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Calme/ })).toHaveAttribute("aria-checked", "false");
    expect(PACE_DESCRIPTIONS.normal).toBe("Un changement toutes les 2,2 s au plus.");
    expect(PACE_DESCRIPTIONS.lively).toBe("Un changement toutes les 1,4 s.");
    for (const text of Object.values(PACE_DESCRIPTIONS)) expect(group.textContent).toContain(text);
  });

  it("écrit `pace` dans la fiche au clic sur un rythme", async () => {
    const kit = createDefaultKit("Atelier Lumen");
    const update = vi.fn<(mutate: (draft: BrandKit) => BrandKit) => void>();
    const { rerender } = render(<VideoSection kit={kit} update={update} />);
    await userEvent.click(screen.getByRole("radio", { name: /Vif/ }));
    expect(update).toHaveBeenCalledTimes(1);
    const lively = update.mock.calls[0][0](kit);
    expect(lively.pace).toBe("lively");

    rerender(<VideoSection kit={lively} update={update} />);
    expect(screen.getByRole("radio", { name: /Vif/ })).toHaveAttribute("aria-checked", "true");
    // Recliquer le rythme choisi ne le retire pas.
    await userEvent.click(screen.getByRole("radio", { name: /Vif/ }));
    expect(update).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("radio", { name: /Calme/ }));
    expect(update.mock.calls[1][0](lively).pace).toBe("calm");
  });
});
