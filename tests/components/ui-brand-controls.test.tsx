// @vitest-environment jsdom

import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CharacterCount, measureText } from "@/components/ui/character-count";
import { ColorPicker, normalizeHex, toHex } from "@/components/ui/color-picker";
import { ContrastIndicator, contrastLevel, contrastRatio } from "@/components/ui/contrast-indicator";
import { DropZone } from "@/components/ui/drop-zone";
import { PositionPicker, type FramePosition } from "@/components/ui/position-picker";
import { SliderWithStops } from "@/components/ui/slider-with-stops";
import { StepTimeline, StepTimelineContent, StepTimelineIndicator, StepTimelineItem, StepTimelineTitle } from "@/components/ui/step-timeline";
import { TagInput } from "@/components/ui/tag-input";
import { TemplateInput, fillTemplate } from "@/components/ui/template-input";

// Radix mesure ses éléments ; jsdom ne connaît pas ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe("ColorPicker", () => {
  it("ramène toute saisie à #rrggbb", () => {
    expect(normalizeHex("FA0")).toBe("#ffaa00");
    expect(normalizeHex("#12AbEf")).toBe("#12abef");
    expect(normalizeHex("12abef80")).toBe("#12abef");
    expect(normalizeHex("vert")).toBeNull();
    expect(toHex("rgba(255, 0, 16, 0.5)")).toBe("#ff0010");
    expect(toHex("n’importe quoi")).toBe("#000000");
  });

  it("n’envoie le code saisi qu’une fois lisible, et rétablit sinon", async () => {
    const onChange = vi.fn();
    render(<ColorPicker label="Fond" value="#112233" onChange={onChange} showInput />);
    const input = screen.getByLabelText("Fond, code hexadécimal");
    await userEvent.clear(input);
    await userEvent.type(input, "abc{Enter}");
    expect(onChange).toHaveBeenCalledWith("#aabbcc");
    onChange.mockClear();
    await userEvent.clear(input);
    await userEvent.type(input, "zz");
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("112233");
  });
});

describe("ContrastIndicator", () => {
  it("calcule le rapport WCAG et le niveau", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastLevel(21)).toBe("aaa");
    expect(contrastLevel(4.6)).toBe("aa");
    expect(contrastLevel(3.2)).toBe("large");
    expect(contrastLevel(1.5)).toBe("fail");
  });

  it("affiche le rapport à la française et le niveau en clair", () => {
    render(<ContrastIndicator foreground="#777777" background="#ffffff" />);
    // 4,48 arrondi vers le bas : un rapport juste sous 4,5 ne doit jamais s'afficher « 4,5 ».
    expect(screen.getByText("4,4 : 1", { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByText("Grands textes seulement")).toBeInTheDocument();
  });
});

describe("TagInput", () => {
  function Harness({ initial = [] as string[], max = 5 }) {
    const [tags, setTags] = useState(initial);
    return <TagInput aria-label="Tags" value={tags} onChange={setTags} max={max} maxTagLength={10} showCount />;
  }

  it("ajoute à Entrée et à la virgule, ignore les doublons sans tenir compte de la casse", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    await userEvent.type(input, "Anime{Enter}jeu vidéo,anime,");
    expect(screen.getByText("Anime")).toBeInTheDocument();
    expect(screen.getByText("jeu vidéo")).toBeInTheDocument();
    expect(screen.getAllByText(/anime/i)).toHaveLength(1);
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("ajoute un collage « a, b, c » d’un coup et coupe les tags trop longs", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    fireEvent.paste(input, { clipboardData: { getData: () => "un, deux, unmottreslongvraiment" } });
    expect(screen.getByText("un")).toBeInTheDocument();
    expect(screen.getByText("deux")).toBeInTheDocument();
    expect(screen.getByText("unmottresl")).toBeInTheDocument();
  });

  it("retire le dernier tag par Retour arrière, et un tag par son bouton", async () => {
    render(<Harness initial={["a", "b", "c"]} />);
    const input = screen.getByLabelText("Tags");
    await userEvent.type(input, "{Backspace}");
    expect(screen.queryByText("c")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retirer a" }));
    expect(screen.queryByText("a")).not.toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("cache la saisie une fois le maximum atteint", () => {
    render(<Harness initial={["a", "b"]} max={2} />);
    expect(screen.getByLabelText("Tags")).toBeDisabled();
  });
});

describe("TemplateInput", () => {
  const variables = [
    { name: "title", label: "Titre", sample: "Top 5" },
    { name: "brand", label: "Marque", sample: "Riso Pop" },
  ];

  it("remplit les variables connues et laisse les autres", () => {
    expect(fillTemplate("{title} – {brand} {inconnue}", { title: "A", brand: "B" })).toBe("A – B {inconnue}");
  });

  it("insère une variable à l’endroit du curseur et montre l’aperçu rempli", async () => {
    function Harness() {
      const [value, setValue] = useState("Nouveau : ");
      return <TemplateInput id="tpl" value={value} onChange={setValue} variables={variables} maxLength={50} />;
    }
    render(<Harness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, 0);
    await userEvent.click(screen.getByRole("button", { name: "Insérer marque" }));
    expect(input).toHaveValue("{brand}Nouveau : ");
    expect(screen.getByText("Riso PopNouveau :")).toBeInTheDocument();
  });

  it("préfère le remplissage fourni par l’application", () => {
    render(<TemplateInput value="{title}" onChange={() => undefined} variables={variables} render={(value) => value.replace("{title}", "RENDU")} />);
    expect(screen.getByText("RENDU")).toBeInTheDocument();
  });
});

describe("PositionPicker", () => {
  function Harness({ positions }: { positions: "corners" | "grid" }) {
    const [value, setValue] = useState<FramePosition>("top-left");
    return (
      <>
        <PositionPicker label="Coin" positions={positions} value={value} onValueChange={setValue} />
        <output>{value}</output>
      </>
    );
  }

  it("choisit un coin d’un clic", async () => {
    render(<Harness positions="corners" />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    await userEvent.click(screen.getByRole("radio", { name: "En bas à droite" }));
    expect(screen.getByText("bottom-right")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "En bas à droite" })).toHaveAttribute("aria-checked", "true");
  });

  it("se déplace aux flèches, d’un coin à l’autre ou d’une zone à la voisine", async () => {
    const { unmount } = render(<Harness positions="corners" />);
    screen.getByRole("radio", { name: "En haut à gauche" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("top-right")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByText("bottom-right")).toBeInTheDocument();
    unmount();

    render(<Harness positions="grid" />);
    expect(screen.getAllByRole("radio")).toHaveLength(9);
    screen.getByRole("radio", { name: "En haut à gauche" }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(screen.getByText("center")).toBeInTheDocument();
  });
});

describe("CharacterCount", () => {
  it("compte les caractères ou les octets et signale le dépassement", () => {
    expect(measureText("été", "bytes")).toBe(5);
    const { rerender } = render(<CharacterCount value="abcdefghi" max={10} />);
    expect(screen.getByText("9/10").closest("[data-slot=character-count]")).toHaveAttribute("data-state", "near");
    rerender(<CharacterCount value="abcdefghijk" max={10} />);
    expect(screen.getByText(/11\/10/).closest("[data-slot=character-count]")).toHaveAttribute("data-state", "over");
  });
});

describe("SliderWithStops", () => {
  it("nomme ses paliers sans erreur d’arrondi", () => {
    render(<SliderWithStops aria-label="Opacité" min={0} max={0.3} step={0.1} value={[0.1]} formatStop={(value) => `${value}`} />);
    for (const label of ["0", "0.1", "0.2", "0.3"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/0\.30000/)).not.toBeInTheDocument();
  });

  it("montre les paliers donnés, mis en forme", () => {
    render(<SliderWithStops aria-label="Durée" min={1} max={8} step={0.5} value={[2]} stops={[1, 4, 8]} formatStop={(value) => `${value} s`} />);
    expect(screen.getByText("4 s")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Durée" })).toBeInTheDocument();
  });
});

describe("StepTimeline", () => {
  it("porte l’état de chaque étape et le lit aux lecteurs d’écran", () => {
    render(
      <StepTimeline>
        <StepTimelineItem state="done">
          <StepTimelineIndicator />
          <StepTimelineContent>
            <StepTimelineTitle state="done">Fiche</StepTimelineTitle>
          </StepTimelineContent>
        </StepTimelineItem>
        <StepTimelineItem state="running">
          <StepTimelineIndicator />
          <StepTimelineContent>
            <StepTimelineTitle state="running">Visuels</StepTimelineTitle>
          </StepTimelineContent>
        </StepTimelineItem>
      </StepTimeline>
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-state", "done");
    expect(items[1]).toHaveAttribute("data-state", "running");
    expect(screen.getByText(", en cours")).toBeInTheDocument();
  });
});

describe("DropZone", () => {
  it("ne transmet que les fichiers acceptés", () => {
    const onFiles = vi.fn();
    render(
      <DropZone onFiles={onFiles} accept={(file) => file.type.startsWith("image/")} label="Déposer">
        <p>Zone</p>
      </DropZone>
    );
    const zone = screen.getByText("Zone").parentElement!;
    const image = new File(["x"], "a.png", { type: "image/png" });
    const text = new File(["x"], "b.txt", { type: "text/plain" });
    const dataTransfer = { types: ["Files"], files: [image, text], dropEffect: "none" };
    fireEvent.dragEnter(zone, { dataTransfer });
    expect(screen.getByText("Déposer")).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer });
    expect(onFiles).toHaveBeenCalledWith([image]);
    expect(screen.queryByText("Déposer")).not.toBeInTheDocument();
  });
});
