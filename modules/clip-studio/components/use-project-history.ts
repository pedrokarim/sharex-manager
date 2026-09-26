"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callModule } from "../lib/client";
import type { ClipProject } from "../engine/types";

const HISTORY_LIMIT = 100;
/** Fenêtre de regroupement : un glissement continu forme une seule étape. */
const COALESCE_MS = 700;
const AUTOSAVE_DELAY_MS = 800;

export type SaveState = "saved" | "pending" | "saving" | "error";

interface HistoryState {
  present: ClipProject;
  past: ClipProject[];
  future: ClipProject[];
}

/**
 * Historique d'édition et enregistrement automatique.
 *
 * `commit` accepte une clé de regroupement : les changements successifs qui
 * portent la même clé (déplacer un élément image après image, régler un
 * curseur) ne créent qu'une étape d'annulation.
 */
export function useProjectHistory(initial: ClipProject) {
  const [state, setState] = useState<HistoryState>({ present: initial, past: [], future: [] });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const lastCommit = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  const skipSave = useRef(true);

  const commit = useCallback(
    (update: (project: ClipProject) => ClipProject, coalesceKey?: string) => {
      setState((current) => {
        const next = update(current.present);
        if (next === current.present) return current;
        const now = Date.now();
        const coalesce =
          coalesceKey !== undefined &&
          lastCommit.current.key === coalesceKey &&
          now - lastCommit.current.at < COALESCE_MS;
        lastCommit.current = { key: coalesceKey ?? null, at: now };
        return {
          present: next,
          past: coalesce ? current.past : [...current.past, current.present].slice(-HISTORY_LIMIT),
          future: [],
        };
      });
    },
    []
  );

  const undo = useCallback(() => {
    lastCommit.current = { key: null, at: 0 };
    setState((current) =>
      current.past.length === 0
        ? current
        : {
            present: current.past[current.past.length - 1],
            past: current.past.slice(0, -1),
            future: [current.present, ...current.future],
          }
    );
  }, []);

  const redo = useCallback(() => {
    lastCommit.current = { key: null, at: 0 };
    setState((current) =>
      current.future.length === 0
        ? current
        : {
            present: current.future[0],
            past: [...current.past, current.present],
            future: current.future.slice(1),
          }
    );
  }, []);

  // Enregistrement automatique, peu après la dernière modification.
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState("pending");
    const timer = setTimeout(() => {
      setSaveState("saving");
      callModule("saveProject", state.present)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.present]);

  return {
    project: state.present,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    saveState,
  };
}
