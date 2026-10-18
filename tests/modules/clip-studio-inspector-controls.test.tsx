// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DuckField, Inspector, MirrorField } from "@/modules/clip-studio/components/inspector";
import { createAudioItem } from "@/modules/clip-studio/engine/edit";
import { DEFAULT_DUCK, decibelsToDuck } from "@/modules/clip-studio/engine/mix";
import type { AudioItem, ClipProject, MediaSource } from "@/modules/clip-studio/engine/types";

// Radix mesure ses éléments ; jsdom ne connaît pas ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const musicSource: MediaSource = { url: "/test/musique.mp3", ref: "test:musique", name: "Musique d’essai", kind: "audio", durationMs: 8000 };

describe("inspecteur : miroir d'une image", () => {
  it("bascule le miroir", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<MirrorField flipped={false} onChange={onChange} />);
    const toggle = screen.getByRole("button", { name: /Retourner/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<MirrorField flipped onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Retourner/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("inspecteur : creux sous la voix", () => {
  it("s'active au creux de l'assistant, se règle en dB et se retire", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<DuckField duck={undefined} trackName="Musique" shared={false} hasVoice onChange={onChange} />);
    expect(screen.queryByText("Profondeur")).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Creux sous la voix" }));
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_DUCK, "duck");

    rerender(<DuckField duck={decibelsToDuck(12)} trackName="Musique" shared hasVoice={false} onChange={onChange} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Le son descend de 12 dB pendant que la voix parle");
    expect(text).toContain("Aucune voix off dans ce projet");
    expect(text).toContain("tous les sons de la piste « Musique »");
    await userEvent.click(screen.getByRole("switch", { name: "Creux sous la voix" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined, "duck");
  });

  it("n'est proposé qu'à un son qui n'est pas une voix, et passe par la piste", async () => {
    const music: AudioItem = { ...createAudioItem(musicSource, 0, 30), id: "m1" };
    const project: ClipProject = {
      version: 1,
      id: "projet",
      name: "Essai",
      aspect: "9:16",
      width: 1080,
      height: 1920,
      fps: 30,
      background: "#000000",
      tracks: [{ id: "piste-musique", kind: "audio", name: "Musique", items: [music] }],
      createdAt: 0,
      updatedAt: 0,
    };
    const onSetTrackDuck = vi.fn();
    const { unmount } = render(<Inspector project={project} item={music} onPatch={vi.fn()} onClose={vi.fn()} onSetTrackDuck={onSetTrackDuck} />);
    await userEvent.click(screen.getByRole("switch", { name: "Creux sous la voix" }));
    expect(onSetTrackDuck).toHaveBeenCalledWith("piste-musique", DEFAULT_DUCK, "duck");
    unmount();

    const voiceProject: ClipProject = { ...project, tracks: [{ ...project.tracks[0], name: "Voix" }] };
    render(<Inspector project={voiceProject} item={music} onPatch={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("switch", { name: "Creux sous la voix" })).toBeNull();
  });
});
