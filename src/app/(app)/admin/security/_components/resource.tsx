"use client";

/**
 * Données de l'écran Sécurité, partagées entre l'en-tête et les onglets.
 *
 * Chaque onglet ne charge que ce qu'il montre, au moment où il s'ouvre. Ce
 * qui a déjà été lu reste affiché pendant la relecture (pas de squelette à
 * chaque retour sur un onglet), et deux lectures de la même ressource ne
 * partent jamais en même temps. « Revérifier », dans l'en-tête, relit les
 * points de contrôle que l'onglet État affiche : tous deux lisent le même
 * magasin.
 */

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { errorMessage } from "@/components/feedback";

export type LoadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string };
export type ReloadResult<T> = { ok: true; data: T } | { ok: false; error: string };

const LOADING: LoadState<never> = { status: "loading" };

export class ResourceStore {
  private states = new Map<string, LoadState<unknown>>();
  private listeners = new Map<string, Set<() => void>>();
  private inflight = new Map<string, Promise<ReloadResult<unknown>>>();

  get<T>(key: string): LoadState<T> {
    return (this.states.get(key) as LoadState<T> | undefined) ?? LOADING;
  }

  set<T>(key: string, state: LoadState<T>) {
    this.states.set(key, state);
    this.listeners.get(key)?.forEach((listener) => listener());
  }

  subscribe(key: string, listener: () => void) {
    const set = this.listeners.get(key) ?? new Set();
    set.add(listener);
    this.listeners.set(key, set);
    return () => void set.delete(listener);
  }

  /** Lit la ressource ; une lecture déjà en cours est partagée. Une erreur ne remplace pas des données déjà affichées. */
  load<T>(key: string, loader: () => Promise<T>, fallback: string): Promise<ReloadResult<T>> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<ReloadResult<T>>;
    const task = loader()
      .then((data): ReloadResult<T> => {
        this.set(key, { status: "ready", data });
        return { ok: true, data };
      })
      .catch((error: unknown): ReloadResult<T> => {
        const message = errorMessage(error, fallback);
        if (this.get(key).status !== "ready") this.set(key, { status: "error", error: message });
        return { ok: false, error: message };
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }
}

const StoreContext = createContext<ResourceStore | null>(null);

export function ResourceProvider({ children, store }: { children: ReactNode; store?: ResourceStore }) {
  const [value] = useState(() => store ?? new ResourceStore());
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStore(): ResourceStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useResource doit être utilisé sous <ResourceProvider>.");
  return store;
}

/**
 * Une ressource de l'écran : son état, de quoi la relire, et de quoi la
 * modifier sur place après un geste (une ligne retirée, un réglage enregistré).
 * `auto` : lue dès que le composant apparaît (relue si elle l'était déjà).
 */
export function useResource<T>(key: string, loader: () => Promise<T>, { auto = true, fallback = "Lecture impossible." }: { auto?: boolean; fallback?: string } = {}) {
  const store = useStore();
  const state = useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribe(key, listener), [store, key]),
    () => store.get<T>(key),
    () => store.get<T>(key)
  );

  // Le chargeur change à chaque rendu ; seule la clé décide d'une relecture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => store.load<T>(key, loader, fallback), [store, key]);

  const mutate = useCallback(
    (update: (data: T) => T) => {
      const current = store.get<T>(key);
      if (current.status === "ready") store.set(key, { status: "ready", data: update(current.data) });
    },
    [store, key]
  );

  /** Remplace les données par une réponse du serveur (après un enregistrement). */
  const replace = useCallback((data: T) => store.set(key, { status: "ready", data }), [store, key]);

  useEffect(() => {
    if (auto) void reload();
  }, [auto, reload]);

  return { state, reload, mutate, replace };
}
