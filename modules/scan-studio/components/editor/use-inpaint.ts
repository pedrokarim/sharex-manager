"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeInpaintPatch, maskKey, type InpaintStatus, type ReadPixels } from "../../lib/inpaint-patch";
import { awaitsTranslation, type InpaintPatch } from "../../lib/render";
import type { ScanRegion } from "../../lib/types";

export type { InpaintStatus } from "../../lib/inpaint-patch";

interface Entry {
  key: string;
  status: InpaintStatus;
  patch: InpaintPatch | null;
}

/** Temps laissé à un geste (glisser un contour, peindre) avant de lancer le calcul. */
const SETTLE_MS = 280;

/**
 * Fonds reconstruits des zones dont le masque est en mode « inpaint ».
 *
 * Le calcul se fait ici, dans le navigateur, sur les pixels de la page
 * (`lib/inpaint.ts`) : une zone à la fois, après la fin du geste en cours, et
 * il est annulé dès que le masque change. Tant qu'un fond n'est pas prêt, ou
 * s'il n'a pas pu être calculé, `resolve` rend `null` et la zone garde son
 * aplat de couleur. La scène et l'export lisent les mêmes images : ce qu'on
 * voit est ce qu'on exporte.
 */
export function useInpaint(regions: ScanRegion[], page: { width: number; height: number }, readPixels: ReadPixels, ready: boolean) {
  const entries = useRef(new Map<string, Entry>());
  const [version, setVersion] = useState(0);
  const waiters = useRef<(() => void)[]>([]);
  const readRef = useRef(readPixels);
  readRef.current = readPixels;

  /** Zones à reconstruire, et l'empreinte de leur masque. */
  const wanted = useMemo(
    () =>
      regions
        .filter((region) => region.mask.kind === "inpaint" && !awaitsTranslation(region) && region.outline.length >= 3)
        .map((region) => ({ region, key: maskKey(region) })),
    [regions],
  );
  const signature = wanted.map((entry) => `${entry.region.id}:${entry.key}`).join("|");

  useEffect(() => {
    if (!ready) return;
    const store = entries.current;
    const ids = new Set(wanted.map((entry) => entry.region.id));
    let changed = false;
    for (const id of [...store.keys()]) {
      if (!ids.has(id)) {
        store.delete(id);
        changed = true;
      }
    }
    // À refaire : un masque qui a changé, ou un calcul interrompu avant d'aboutir.
    const stale = wanted.filter((entry) => {
      const known = store.get(entry.region.id);
      return !known || known.key !== entry.key || known.status.state === "pending";
    });
    for (const { region, key } of stale) {
      if (store.get(region.id)?.key === key) continue;
      store.set(region.id, { key, status: { state: "pending" }, patch: null });
      changed = true;
    }
    if (changed) setVersion((value) => value + 1);
    if (stale.length === 0) {
      for (const done of waiters.current.splice(0)) done();
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      for (const { region, key } of stale) {
        if (controller.signal.aborted) return;
        const outcome = await computeInpaintPatch(region, page, readRef.current, controller.signal);
        if (controller.signal.aborted) return;
        // Une zone retirée entre-temps n'a plus d'entrée : son résultat est oublié.
        if (store.get(region.id)?.key === key) store.set(region.id, { key, ...outcome });
        setVersion((value) => value + 1);
      }
      for (const done of waiters.current.splice(0)) done();
    }, SETTLE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // `signature` résume `wanted` : l'effet ne repart que si un masque a vraiment changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready, page.width, page.height]);

  /** Fond prêt à poser pour cette zone, s'il correspond encore à son masque. */
  const resolve = useCallback(
    (region: ScanRegion): InpaintPatch | null => {
      // `version` change à chaque résultat : la fonction change avec lui, et la scène se redessine.
      void version;
      const entry = entries.current.get(region.id);
      return entry && entry.patch && entry.key === maskKey(region) ? entry.patch : null;
    },
    [version],
  );

  const statusOf = useCallback(
    (regionId: string): InpaintStatus | null => {
      void version;
      return entries.current.get(regionId)?.status ?? null;
    },
    [version],
  );

  /** Se résout quand plus aucun calcul n'est attendu : l'export l'attend avant de rendre la page. */
  const settle = useCallback((): Promise<void> => {
    const pending = [...entries.current.values()].some((entry) => entry.status.state === "pending");
    if (!pending) return Promise.resolve();
    return new Promise((done) => waiters.current.push(done));
  }, []);

  return { resolve, statusOf, settle };
}
