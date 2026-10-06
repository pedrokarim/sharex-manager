"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScanEye, TriangleAlert } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { needsReview } from "../../lib/analysis/merge";
import type { ScanRegion } from "../../lib/types";
import { RegionMenuItems, type RegionActions } from "./region-menu";

interface RegionStripProps {
  regions: ScanRegion[];
  selectedId: string | null;
  onSelect: (regionId: string) => void;
  /** Zones dont le texte ne tient pas dans sa boîte. */
  overflowing: ReadonlySet<string>;
  actions: RegionActions;
}

/**
 * Bandeau des zones de la page, dans l'ordre de lecture. Un clic sélectionne
 * la zone sur la page ; le clic droit ouvre les mêmes actions que le bouton
 * « … » de l'inspecteur.
 */
export function RegionStrip({ regions, selectedId, onSelect, overflowing, actions }: RegionStripProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // La zone sélectionnée (au clavier, sur la page) reste visible dans le bandeau.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-region="${selectedId}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  if (regions.length === 0) {
    return (
      <div className="flex h-14 shrink-0 items-center border-t px-4 text-xs text-muted-foreground">
        Aucune zone sur cette page. Tracez-en une autour d’un texte avec le rectangle (R) ou le contour libre (P).
      </div>
    );
  }

  return (
    <div ref={listRef} role="listbox" aria-label="Zones de la page" className="flex h-14 shrink-0 items-center gap-1 overflow-x-auto border-t px-2">
      <AnimatePresence initial={false}>
        {regions.map((region, index) => {
          const text = region.translation.text.trim();
          // Pas encore de traduction : le texte lu sur la page tient lieu d'étiquette.
          const source = region.reading.clean.trim();
          const doubtful = needsReview(region);
          const selected = region.id === selectedId;
          return (
            <ContextMenu key={region.id}>
              <ContextMenuTrigger asChild onContextMenu={() => onSelect(region.id)}>
                <motion.button
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-region={region.id}
                  onClick={() => onSelect(region.id)}
                  className={cn(
                    "flex h-10 max-w-64 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-xs transition-colors",
                    selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <span className="font-mono text-[11px] tabular-nums opacity-70">{index + 1}</span>
                  {text ? <span className="truncate">{text}</span> : <span className="truncate italic opacity-70">{source || "à traduire"}</span>}
                  {doubtful && <ScanEye className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Lecture à vérifier" />}
                  {text && overflowing.has(region.id) && (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Le texte ne tient pas dans sa boîte" />
                  )}
                </motion.button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <RegionMenuItems variant="context" regionId={region.id} index={index} count={regions.length} actions={actions} />
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
