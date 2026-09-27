"use client";

import { useEffect, useState } from "react";
import type { AudioItem } from "../engine/types";

/** Crêtes par seconde de son : assez fin pour la timeline, léger à calculer. */
const PEAKS_PER_SECOND = 50;

interface Peaks {
  values: Float32Array;
  perSecond: number;
}

/**
 * Crêtes d'un son, calculées une fois par adresse. Le décodage passe par un
 * contexte hors ligne : il ne réveille pas la sortie audio de la page.
 */
const cache = new Map<string, Promise<Peaks | null>>();

function loadPeaks(url: string): Promise<Peaks | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const data = await (await fetch(url)).arrayBuffer();
        const buffer = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(data);
        const channel = buffer.getChannelData(0);
        const size = Math.max(1, Math.round(buffer.sampleRate / PEAKS_PER_SECOND));
        const values = new Float32Array(Math.ceil(channel.length / size));
        let loudest = 0;
        for (let index = 0; index < values.length; index++) {
          let peak = 0;
          const end = Math.min(channel.length, (index + 1) * size);
          for (let sample = index * size; sample < end; sample++) {
            const value = Math.abs(channel[sample]);
            if (value > peak) peak = value;
          }
          values[index] = peak;
          if (peak > loudest) loudest = peak;
        }
        // Normalisé : une voix calme reste lisible à côté d'une musique forte.
        if (loudest > 0) for (let index = 0; index < values.length; index++) values[index] /= loudest;
        return { values, perSecond: buffer.sampleRate / size };
      } catch {
        return null;
      }
    })();
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Forme d'onde de la partie du son réellement utilisée par l'élément
 * (après la coupe de début), dessinée sur toute la largeur du bloc.
 */
export function Waveform({ item, fps }: { item: AudioItem; fps: number }) {
  const [peaks, setPeaks] = useState<Peaks | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPeaks(item.source.url).then((result) => {
      if (alive) setPeaks(result);
    });
    return () => {
      alive = false;
    };
  }, [item.source.url]);

  if (!peaks) return null;
  const from = Math.floor((item.trimStart / fps) * peaks.perSecond);
  const count = Math.max(1, Math.round((item.duration / fps) * peaks.perSecond));
  const slice = peaks.values.subarray(from, Math.min(peaks.values.length, from + count));
  if (slice.length === 0) return null;

  let path = "";
  for (let index = 0; index < slice.length; index++) {
    const height = Math.max(0.04, slice[index]) * 45;
    path += `M${index} ${50 - height}V${50 + height}`;
  }

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${count} 100`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full text-current opacity-40"
    >
      <path d={path} stroke="currentColor" strokeWidth={0.7} vectorEffect="non-scaling-stroke" fill="none" />
    </svg>
  );
}
