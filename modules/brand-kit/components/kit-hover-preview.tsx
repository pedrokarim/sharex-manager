"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { FONTS } from "@/modules/clip-studio/lib/font-catalog";
import { api } from "../lib/client";
import { buildFormat, type FormatId } from "../lib/formats";
import type { BrandKit, KitSummary } from "../lib/types";
import { FormatCanvas } from "./format-preview";
import { prepareKitFonts } from "./format-render";

/** Fiches déjà lues, par marque et par version : survoler deux fois ne recharge rien. */
const cache = new Map<string, { updatedAt: number; kit: BrandKit }>();

const SHOWN: { id: FormatId; label: string }[] = [
  { id: "avatar", label: "Avatar" },
  { id: "endcard-vertical", label: "Carton de fin" },
  { id: "short-cover", label: "Couverture" },
];

function fontName(kit: BrandKit, family: string) {
  return FONTS.find((font) => font.family === family)?.label ?? kit.fonts.find((font) => font.family === family)?.name ?? family;
}

/**
 * Ce que montre le survol d'une carte : l'avatar, le carton de fin et la
 * couverture de short, dessinés d'après la marque telle qu'elle est (même
 * sans export), et ses polices. On compare des marques sans les ouvrir.
 */
export function KitHoverPreview({ summary }: { summary: KitSummary }) {
  const cached = cache.get(summary.id);
  const [kit, setKit] = useState<BrandKit | null>(cached && cached.updatedAt === summary.updatedAt ? cached.kit : null);
  const [fontsReady, setFontsReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const current = kit ?? (await api.getKit(summary.id)).kit;
        cache.set(summary.id, { updatedAt: summary.updatedAt, kit: current });
        if (cancelled) return;
        setKit(current);
        await prepareKitFonts(current);
        if (!cancelled) setFontsReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une lecture par ouverture
  }, [summary.id, summary.updatedAt]);

  const built = useMemo(() => (kit ? SHOWN.map((entry) => ({ ...entry, built: buildFormat(kit, entry.id) })) : []), [kit]);

  if (failed) return <p className="text-sm text-muted-foreground">Aperçu indisponible.</p>;
  if (!kit) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="Chargement de l’aperçu" className="size-4 text-muted-foreground" />
      </div>
    );
  }

  const title = fontName(kit, kit.textStyles.title.font);
  const body = fontName(kit, kit.textStyles.caption.font);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
        {built.map((entry) => (
          <figure key={entry.id} className="grid min-w-0 gap-1">
            {/* Dessiné tout de suite, puis redessiné quand les polices de la marque arrivent : pas d'attente au survol. */}
            <FormatCanvas built={entry.built} fontsVersion={fontsReady ? 1 : 0} ready round={entry.id === "avatar"} className="w-full shadow-sm" />
            <figcaption className="truncate text-center text-[11px] text-muted-foreground">{entry.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="truncate text-xs text-muted-foreground" title={`Titres : ${title} · Légendes : ${body}`}>
        Titres <span className="text-foreground">{title}</span> · Légendes <span className="text-foreground">{body}</span>
      </p>
    </div>
  );
}
