"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/client";
import type { PageStatus, ScanRegion } from "../../lib/types";

const HISTORY_LIMIT = 100;
/** Fenêtre de regroupement : une saisie continue forme une seule étape. */
const COALESCE_MS = 700;
const AUTOSAVE_DELAY_MS = 1000;

/** Ce que l'atelier modifie d'une page, et que l'historique fait remonter. */
export interface PageDocument {
  regions: ScanRegion[];
  status: PageStatus;
}

export type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";

interface HistoryState {
  present: PageDocument;
  past: PageDocument[];
  future: PageDocument[];
}

/** Le serveur refuse une révision périmée par un message, pas par un code : on le reconnaît à ses mots. */
function isRevisionConflict(message: string): boolean {
  return /modifiée ailleurs|révision|revision|conflict/i.test(message);
}

/**
 * Historique d'édition d'une page et enregistrement automatique.
 *
 * `commit` accepte une clé de regroupement : les changements successifs qui
 * portent la même clé (une frappe après l'autre, un curseur) ne créent qu'une
 * étape d'annulation. Une clé qui commence par `drag:` regroupe tout un geste
 * de souris, quelle que soit sa durée.
 *
 * Les enregistrements partent un par un : chacun envoie la révision rendue par
 * le précédent. Si le serveur la refuse, la page a été modifiée ailleurs et
 * l'enregistrement s'arrête jusqu'au rechargement.
 */
export function usePageHistory(pageId: string, initial: PageDocument, initialRevision: number) {
  const [state, setState] = useState<HistoryState>({ present: initial, past: [], future: [] });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastCommit = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });

  const presentRef = useRef(state.present);
  presentRef.current = state.present;
  /** Dernier document que le serveur a accepté. */
  const savedRef = useRef(initial);
  const revisionRef = useRef(initialRevision);
  const savingRef = useRef<Promise<void> | null>(null);
  const blockedRef = useRef(false);

  const commit = useCallback((update: (document: PageDocument) => PageDocument, coalesceKey?: string) => {
    // Décidé hors de la mise à jour d'état, qui doit rester pure.
    const now = Date.now();
    const coalesce =
      coalesceKey !== undefined &&
      lastCommit.current.key === coalesceKey &&
      (coalesceKey.startsWith("drag:") || now - lastCommit.current.at < COALESCE_MS);
    lastCommit.current = { key: coalesceKey ?? null, at: now };
    setState((current) => {
      const next = update(current.present);
      if (next === current.present) return current;
      return {
        present: next,
        past: coalesce ? current.past : [...current.past, current.present].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    lastCommit.current = { key: null, at: 0 };
    setState((current) =>
      current.past.length === 0
        ? current
        : {
            present: current.past[current.past.length - 1],
            past: current.past.slice(0, -1),
            future: [current.present, ...current.future],
          },
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
          },
    );
  }, []);

  /** Envoie ce qui n'est pas encore enregistré. Un seul envoi à la fois. */
  const flush = useCallback((): Promise<void> => {
    if (savingRef.current) return savingRef.current;
    if (blockedRef.current || presentRef.current === savedRef.current) return Promise.resolve();

    const run = async () => {
      // Tant que le document a changé pendant l'envoi, on renvoie le dernier.
      while (!blockedRef.current && presentRef.current !== savedRef.current) {
        const snapshot = presentRef.current;
        setSaveState("saving");
        try {
          const result = await api.savePage(pageId, {
            regions: snapshot.regions,
            status: snapshot.status,
            revision: revisionRef.current,
          });
          revisionRef.current = result.revision;
          savedRef.current = snapshot;
        } catch (error) {
          const message = error instanceof Error && error.message ? error.message : "Enregistrement impossible";
          if (isRevisionConflict(message)) blockedRef.current = true;
          setSaveError(message);
          setSaveState(blockedRef.current ? "conflict" : "error");
          toast.error(message);
          return;
        }
      }
      setSaveError(null);
      setSaveState("saved");
    };
    savingRef.current = run().finally(() => {
      savingRef.current = null;
    });
    return savingRef.current;
  }, [pageId]);

  // Enregistrement automatique, une seconde après la dernière modification.
  useEffect(() => {
    if (blockedRef.current) return;
    if (state.present === savedRef.current) {
      // Une annulation est revenue à ce qui est déjà sur le serveur.
      if (!savingRef.current) setSaveState("saved");
      return;
    }
    setSaveState((current) => (current === "saving" ? current : "pending"));
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.present, flush]);

  // En quittant : on enregistre tout de suite, et le navigateur retient la
  // fermeture de l'onglet tant qu'il reste quelque chose à envoyer.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (blockedRef.current || (presentRef.current === savedRef.current && !savingRef.current)) return;
      void flush();
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  /**
   * Prend acte d'un état décidé par le serveur (une page exportée devient
   * « exportée ») sans créer d'étape d'annulation ni relancer d'enregistrement
   * si rien d'autre n'attendait.
   */
  const adoptStatus = useCallback((status: PageStatus) => {
    const present = presentRef.current;
    if (present.status === status) return;
    const next = { ...present, status };
    if (savedRef.current === present) savedRef.current = next;
    presentRef.current = next;
    setState((current) => (current.present === present ? { ...current, present: next } : current));
  }, []);

  return {
    present: state.present,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    saveState,
    saveError,
    flush,
    adoptStatus,
  };
}
