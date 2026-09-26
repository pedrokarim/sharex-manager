"use client";

import { Circle, RectangleHorizontal, Timer } from "lucide-react";
import { TEXT_PRESETS } from "../engine/edit";
import type { ShapeItem } from "../engine/types";

interface TextPanelProps {
  onAddText: (presetId: string) => void;
  onAddShape: (shape: ShapeItem["shape"]) => void;
}

/**
 * Styles de texte et formes, ajoutés à la tête de lecture. Chaque style est
 * montré dans sa vraie police et ses vraies couleurs : on choisit ce que l'on
 * voit.
 */
export function TextPanel({ onAddText, onAddShape }: TextPanelProps) {
  return (
    <div className="flex flex-col gap-5 p-3">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Styles de texte</h3>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_PRESETS.map((preset) => {
            const style = preset.style;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onAddText(preset.id)}
                className="group flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-[linear-gradient(135deg,#27272a,#3f3f46)] p-2 transition-transform hover:scale-[1.03]"
                title={`Ajouter un texte « ${preset.label} »`}
              >
                <span
                  className="max-w-full truncate leading-tight"
                  style={{
                    fontFamily: `"${style.font}", sans-serif`,
                    fontWeight: style.weight,
                    fontSize: 17,
                    color: style.color,
                    textTransform: style.uppercase ? "uppercase" : "none",
                    letterSpacing: `${style.letterSpacing}em`,
                    WebkitTextStroke: style.stroke ? `${Math.max(1, style.stroke.width * 17)}px ${style.stroke.color}` : undefined,
                    paintOrder: "stroke fill",
                    textShadow: style.shadow ? `0 ${style.shadow.offsetY * 17}px ${style.shadow.blur * 17}px ${style.shadow.color}` : undefined,
                    background: style.background?.color,
                    padding: style.background ? "2px 8px" : undefined,
                    borderRadius: style.background ? 6 : undefined,
                  }}
                >
                  {preset.sample}
                </span>
                <span className="text-[10px] text-zinc-400">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Formes</h3>
        <div className="grid grid-cols-3 gap-2">
          <ShapeButton label="Rectangle" onClick={() => onAddShape("rect")}>
            <RectangleHorizontal className="h-5 w-5" />
          </ShapeButton>
          <ShapeButton label="Cercle" onClick={() => onAddShape("ellipse")}>
            <Circle className="h-5 w-5" />
          </ShapeButton>
          <ShapeButton label="Compte à rebours" onClick={() => onAddShape("progress")}>
            <Timer className="h-5 w-5" />
          </ShapeButton>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Le compte à rebours se vide sur toute sa durée&nbsp;: idéal pour laisser
          le temps de répondre à une question.
        </p>
      </section>
    </div>
  );
}

function ShapeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {children}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
