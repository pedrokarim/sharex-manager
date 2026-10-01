"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Délai avant l'envoi : glisser un curseur ne déclenche pas dix requêtes. */
const SAVE_DELAY_MS = 500;

/**
 * Préférence rattachée au compte (voir `lib/user-preferences.ts`).
 *
 * `value` vaut `defaults` tant que le serveur n'a pas répondu, puis ce que le
 * compte avait enregistré, complété par `defaults` pour les champs absents.
 * `ready` passe à vrai à ce moment : avant, mieux vaut ne rien enregistrer,
 * sous peine d'écraser la préférence par les valeurs par défaut.
 *
 * `update` fusionne un changement et l'enregistre peu après. Un changement
 * encore en attente part quand le composant disparaît ou que l'onglet se ferme.
 */
export function useAccountPreference<T extends Record<string, unknown>>(scope: string, defaults: T) {
  const [value, setValue] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  /** Champs modifiés avant la réponse du serveur : ils gardent la priorité. */
  const touched = useRef(new Set<keyof T>());

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    // keepalive : la requête aboutit même si la page se ferme juste après.
    void fetch(`/api/settings/preferences/${scope}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: latest.current }),
      keepalive: true,
    }).catch(() => undefined);
  }, [scope]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/settings/preferences/${scope}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!alive) return;
        const saved = payload?.value;
        if (saved && typeof saved === "object") {
          const merged = { ...latest.current, ...saved } as T;
          for (const key of touched.current) merged[key] = latest.current[key];
          latest.current = merged;
          setValue(merged);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...latest.current, ...patch };
      const changed = (Object.keys(patch) as (keyof T)[]).some((key) => latest.current[key] !== next[key]);
      if (!changed) return;
      for (const key of Object.keys(patch) as (keyof T)[]) touched.current.add(key);
      latest.current = next;
      dirty.current = true;
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush]
  );

  return { value, ready, update };
}
