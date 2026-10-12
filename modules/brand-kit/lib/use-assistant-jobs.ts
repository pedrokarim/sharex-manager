"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type KitAssistantJob } from "./client";

/** Un travail terminé reste affiché une heure : le temps d'ouvrir la marque ou de lire l'erreur. */
const RECENT = 3_600_000;
const POLL = 2000;

/**
 * Travaux de l'assistant de création : sondés toutes les deux secondes tant
 * que l'un d'eux tourne, puis plus du tout jusqu'au prochain lancement.
 */
export function useAssistantJobs(onFinished: () => void) {
  const [jobs, setJobs] = useState<KitAssistantJob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasRunning = useRef(false);
  /** Marques déjà signalées : une fiche produite rafraîchit la grille une seule fois. */
  const seenKits = useRef(new Set<string>());
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  const poll = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    let list: KitAssistantJob[];
    try {
      list = await api.listAssistantJobs();
    } catch {
      return;
    }
    const now = Date.now();
    setJobs(list.filter((job) => job.status === "running" || now - (job.finishedAt ?? job.createdAt) < RECENT));
    const running = list.some((job) => job.status === "running");
    // Une création vient de se terminer, ou de produire sa fiche : la grille la montre.
    const fresh = list.filter((job) => job.kitId && !seenKits.current.has(job.kitId));
    for (const job of fresh) seenKits.current.add(job.kitId!);
    if ((wasRunning.current && !running) || (fresh.length > 0 && wasRunning.current)) finished.current();
    wasRunning.current = running;
    if (running) timer.current = setTimeout(() => void poll(), POLL);
  }, []);

  useEffect(() => {
    void poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  const cancel = useCallback(
    async (id: string) => {
      await api.cancelKitAssistantJob(id);
      await poll();
    },
    [poll]
  );

  const dismiss = useCallback((id: string) => setJobs((previous) => previous.filter((job) => job.id !== id)), []);

  return { jobs, refresh: poll, cancel, dismiss };
}
