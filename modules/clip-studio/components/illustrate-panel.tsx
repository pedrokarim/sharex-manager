"use client";

import { cn } from "@/lib/utils";
import type { BoardPalette } from "../engine/board-palette";
import type { ActorKind, DrawTool, StrokeKind } from "../engine/illustrate";

interface IllustratePanelProps {
  palette: BoardPalette;
  /** Outil de tracé actif sur l'aperçu, ou `null`. */
  tool: DrawTool | null;
  onToolChange: (tool: DrawTool | null) => void;
  onAddStroke: (kind: StrokeKind) => void;
  onAddActor: (kind: ActorKind) => void;
}

/**
 * Panneau « Illustrer » : tracer sur l'aperçu à la souris, ou poser un trait
 * ou un acteur de la planche à la tête de lecture, au centre de la zone
 * d'écriture. Chaque vignette est dessinée dans la palette de la planche du
 * projet : on choisit ce que l'on verra.
 */
export function IllustratePanel({ palette, tool, onToolChange, onAddStroke, onAddActor }: IllustratePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-3">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Tracer sur l’aperçu</h3>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Outils de tracé">
          {DRAW_TOOLS.map((entry) => (
            <Tile
              key={entry.id}
              label={entry.label}
              palette={palette}
              pressed={tool === entry.id}
              onClick={() => onToolChange(tool === entry.id ? null : entry.id)}
              title={`${entry.label} : appuyez au départ, relâchez à l’arrivée`}
            >
              {entry.icon(palette)}
            </Tile>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Appuyez au départ, relâchez à l’arrivée. Tirez ensuite la poignée du milieu pour courber le trait.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Traits</h3>
        <div className="grid grid-cols-3 gap-2">
          {STROKES.map((entry) => (
            <Tile key={entry.id} label={entry.label} palette={palette} onClick={() => onAddStroke(entry.id)} title={`Ajouter ${entry.article} à la tête de lecture`}>
              {entry.icon(palette)}
            </Tile>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Acteurs</h3>
        <div className="grid grid-cols-3 gap-2">
          {ACTORS.map((entry) => (
            <Tile key={entry.id} label={entry.label} palette={palette} onClick={() => onAddActor(entry.id)} title={`Ajouter ${entry.article} à la tête de lecture`}>
              {entry.icon(palette)}
            </Tile>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Tout se pose à la tête de lecture, au centre de la zone d’écriture. Pour barrer, souligner ou entourer un mot d’un texte, sélectionnez ce texte&nbsp;: l’inspecteur a ses marques.
        </p>
      </section>
    </div>
  );
}

/**
 * Vignette d'un outil : un carreau de papier de la planche, son dessin centré
 * au pixel près (viewBox carrée, centre à 20, 20), le libellé dessous.
 */
function Tile({
  label,
  palette,
  pressed,
  onClick,
  title,
  children,
}: {
  label: string;
  palette: BoardPalette;
  pressed?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-lg border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
        pressed && "border-primary bg-primary/10 text-foreground"
      )}
    >
      <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md" style={{ background: palette.paper }}>
        <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden>
          {children}
        </svg>
      </span>
      <span className="w-full truncate text-center text-[10px] leading-4">{label}</span>
    </button>
  );
}

type Icon = (palette: BoardPalette) => React.ReactNode;

const line = (palette: BoardPalette, color: keyof BoardPalette = "ink", width = 2.4) => ({
  fill: "none",
  stroke: palette[color],
  strokeWidth: width,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

const DRAW_TOOLS: { id: DrawTool; label: string; icon: Icon }[] = [
  {
    id: "arrow",
    label: "Flèche",
    icon: (palette) => (
      <g {...line(palette)}>
        <path d="M8 32 L32 8" />
        <path d="M21 8 H32 V19" />
      </g>
    ),
  },
  { id: "line", label: "Trait", icon: (palette) => <path d="M8 32 L32 8" {...line(palette)} /> },
  { id: "link", label: "Liaison", icon: (palette) => <path d="M8 30 C 14 10, 26 30, 32 10" {...line(palette, "muted", 2)} /> },
];

const STROKES: { id: StrokeKind; label: string; article: string; icon: Icon }[] = [
  {
    id: "arrow",
    label: "Flèche",
    article: "une flèche",
    icon: (palette) => (
      <g {...line(palette)}>
        <path d="M6 22.75 Q 20 14.75 34 20.75" />
        <path d="M27 15.25 L34 20.75 L26.5 24.75" />
      </g>
    ),
  },
  {
    id: "cross",
    label: "Croix",
    article: "une croix",
    icon: (palette) => (
      <g {...line(palette, "ink", 3)}>
        <path d="M10 10 L30 30" />
        <path d="M30 10 L10 30" />
      </g>
    ),
  },
  { id: "strike", label: "Barre", article: "une barre", icon: (palette) => <path d="M6 20 H34" {...line(palette, "ink", 3)} /> },
  { id: "underline", label: "Souligner", article: "un soulignement", icon: (palette) => <path d="M6 19.25 Q 20 22.25 34 19.25" {...line(palette, "ink", 3)} /> },
  { id: "circle", label: "Cercle", article: "un cercle à main levée", icon: (palette) => <path d="M14 11 C 26 7, 37 14, 34 23 C 31 31, 12 33, 7 25 C 3 18, 10 11, 20 10" transform="translate(-0.18 0.03)" {...line(palette, "accent")} /> },
  { id: "link", label: "Liaison", article: "une liaison", icon: (palette) => <path d="M6 23.5 Q 20 9.5 34 23.5" {...line(palette, "muted", 2)} /> },
];

const ACTORS: { id: ActorKind; label: string; article: string; icon: Icon }[] = [
  {
    id: "card",
    label: "Carte",
    article: "une carte",
    icon: (palette) => (
      <g>
        <rect x="4" y="12" width="32" height="16" rx="3" fill={palette.sheet} stroke={palette.shadow} />
        <rect x="11" y="18.75" width="18" height="2.5" rx="1.25" fill={palette.onSheet} />
      </g>
    ),
  },
  {
    id: "card-index",
    label: "Carte 01",
    article: "une carte numérotée",
    icon: (palette) => (
      <g>
        <rect x="4" y="12" width="32" height="16" rx="3" fill={palette.sheet} stroke={palette.shadow} />
        <rect x="8" y="18.75" width="5" height="2.5" rx="1.25" fill={palette.accent} />
        <rect x="16" y="18.75" width="15" height="2.5" rx="1.25" fill={palette.onSheet} />
      </g>
    ),
  },
  {
    id: "chip",
    label: "Pastille",
    article: "une pastille",
    icon: (palette) => (
      <g>
        <rect x="5" y="14" width="30" height="12" rx="6" fill={palette.sheet} stroke={palette.shadow} />
        <circle cx="11.5" cy="20" r="2" fill={palette.accent} />
        <rect x="16" y="18.75" width="14" height="2.5" rx="1.25" fill={palette.onSheet} />
      </g>
    ),
  },
  {
    id: "note",
    label: "Note",
    article: "une note collée",
    icon: (palette) => (
      <g transform="rotate(-4 20 20)">
        <rect x="8" y="8" width="24" height="24" rx="1.5" fill={palette.accent} />
        <rect x="12" y="15" width="16" height="2.5" rx="1.25" fill={palette.onAccent} />
        <rect x="12" y="22.5" width="11" height="2.5" rx="1.25" fill={palette.onAccent} />
      </g>
    ),
  },
  {
    id: "counter",
    label: "Compteur",
    article: "un compteur",
    icon: (palette) => (
      <g>
        {/* Deux chiffres et leur unité, plus petite, posée sur la ligne de base : centrés au centre de la vignette. */}
        <ellipse cx="10.75" cy="20" rx="4.5" ry="7" fill="none" stroke={palette.ink} strokeWidth="2.4" />
        <ellipse cx="21.75" cy="20" rx="4.5" ry="7" fill="none" stroke={palette.ink} strokeWidth="2.4" />
        <rect x="28.75" y="24" width="5" height="3" rx="1.5" fill={palette.accent} />
      </g>
    ),
  },
  {
    id: "title",
    label: "Titre à pavé",
    article: "un titre dont un mot est sur un pavé",
    icon: (palette) => (
      <g>
        <rect x="4" y="18.75" width="13" height="2.5" rx="1.25" fill={palette.ink} />
        <rect x="19" y="14" width="17" height="12" rx="3" fill={palette.accent} />
        <rect x="22" y="18.75" width="11" height="2.5" rx="1.25" fill={palette.onAccent} />
      </g>
    ),
  },
];
