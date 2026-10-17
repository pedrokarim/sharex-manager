"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type FormatExport } from "./client";
import type { BrandKit } from "./types";

export type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";

const SAVE_DELAY = 500;

/** Le serveur refuse un enregistrement quand la fiche a changé ailleurs. */
const isConflict = (error: unknown) => /changé ailleurs/i.test(errorMessage(error, ""));

/** Pose de chaque format, sans celles que le serveur a retirées. */
function keepPoses(formatPoses: NonNullable<BrandKit["mascot"]>["formatPoses"], poseIds: string[]) {
  if (!formatPoses) return undefined;
  return Object.fromEntries(Object.entries(formatPoses).filter(([, id]) => id === null || poseIds.includes(id ?? ""))) as typeof formatPoses;
}

/**
 * Fusionne la fiche rendue par une opération serveur (image ajoutée, police
 * retirée…) avec des modifications locales faites pendant l'opération : les
 * fichiers et ce qui les désigne viennent du serveur, le reste de l'éditeur.
 */
function mergeServerKit(local: BrandKit, server: BrandKit): BrandKit {
  const families = new Set(server.fonts.map((font) => font.family));
  const textStyles = Object.fromEntries(
    Object.entries(local.textStyles).map(([role, style]) => {
      const fallback = server.textStyles[role as keyof BrandKit["textStyles"]];
      // Une police importée retirée : le style reprend celle choisie par le serveur.
      return [role, style.font.startsWith("bk-") && !families.has(style.font) ? { ...style, font: fallback.font } : style];
    })
  ) as BrandKit["textStyles"];
  const fonts = server.fonts.map((font) => ({ ...font, name: local.fonts.find((entry) => entry.id === font.id)?.name ?? font.name }));
  const assets = server.assets.map((asset) => {
    const mine = local.assets.find((entry) => entry.id === asset.id);
    // Libellé, note et étiquettes d'une pose sont réglés dans l'éditeur.
    return mine ? { ...asset, label: mine.label, note: mine.note, ...(mine.pose ? { pose: mine.pose } : {}) } : asset;
  });
  return {
    ...local,
    fonts,
    textStyles,
    assets,
    logoAssetId: server.logoAssetId,
    markAssetId: server.markAssetId,
    watermark: server.watermark && local.watermark ? { ...local.watermark, assetId: server.watermark.assetId } : server.watermark,
    mascot: server.mascot
      ? {
          ...server.mascot,
          ...(local.mascot
            ? {
                name: local.mascot.name,
                identityPrompt: local.mascot.identityPrompt,
                // Réglages faits pendant l'opération, sur des poses que le serveur garde encore.
                formatPoses: keepPoses(local.mascot.formatPoses, server.mascot.poseAssetIds),
                presence: local.mascot.presence && {
                  ...local.mascot.presence,
                  openingPoseId: server.mascot.poseAssetIds.includes(local.mascot.presence.openingPoseId ?? "") ? local.mascot.presence.openingPoseId : undefined,
                },
              }
            : {}),
        }
      : local.mascot,
    endCard: { ...local.endCard, poseAssetId: server.endCard.poseAssetId },
    formatImages: server.formatImages,
    ai: { ...local.ai, collectionId: server.ai.collectionId },
    isDefault: server.isDefault,
    updatedAt: server.updatedAt,
  };
}

/**
 * Fiche ouverte dans l'éditeur : chargement, enregistrement automatique une
 * demi-seconde après la dernière modification, contrôle de version.
 */
export function useKitEditor(kitId: string | null) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [exports, setExports] = useState<FormatExport[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);

  const kitRef = useRef<BrandKit | null>(null);
  /** `updatedAt` de la dernière version connue du serveur. */
  const baseRef = useRef(0);
  /** Nombre de modifications locales, et celui du dernier enregistrement réussi. */
  const editsRef = useRef(0);
  const savedEditsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);
  const blockedRef = useRef(false);
  const operationsRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const adopt = useCallback((next: BrandKit) => {
    kitRef.current = next;
    baseRef.current = next.updatedAt;
    editsRef.current = 0;
    savedEditsRef.current = 0;
    blockedRef.current = false;
    setKit(next);
    setSaveState("saved");
    setSaveError(null);
  }, []);

  const load = useCallback(async () => {
    if (!kitId) return;
    setLoadError(null);
    try {
      const result = await api.getKit(kitId);
      adopt(result.kit);
      setExports(result.exports);
    } catch (error) {
      setLoadError(errorMessage(error, "Image de marque introuvable."));
    }
  }, [kitId, adopt]);

  useEffect(() => {
    setKit(null);
    kitRef.current = null;
    void load();
  }, [load]);

  const save = useCallback(async (): Promise<void> => {
    if (savingRef.current) {
      await savingRef.current;
      return;
    }
    const current = kitRef.current;
    if (!current || blockedRef.current || operationsRef.current > 0) return;
    const edits = editsRef.current;
    if (edits === savedEditsRef.current) return;
    setSaveState("saving");
    const task = (async () => {
      try {
        const saved = await api.saveKit(current, baseRef.current);
        baseRef.current = saved.updatedAt;
        savedEditsRef.current = edits;
        // Les champs restent ceux de l'éditeur : la fiche bornée par le serveur retirerait
        // l'espace final d'une phrase en cours de frappe. Seule la version change.
        const latest = kitRef.current;
        if (latest) {
          const next = { ...latest, updatedAt: saved.updatedAt };
          kitRef.current = next;
          setKit(next);
        }
        setSaveState(editsRef.current === edits ? "saved" : "pending");
        setSaveError(null);
      } catch (error) {
        if (isConflict(error)) {
          blockedRef.current = true;
          setSaveState("conflict");
        } else {
          setSaveState("error");
        }
        setSaveError(errorMessage(error, "Enregistrement impossible."));
      } finally {
        savingRef.current = null;
      }
    })();
    savingRef.current = task;
    await task;
    // Des modifications sont arrivées pendant l'envoi : elles partent à leur tour.
    if (!blockedRef.current && editsRef.current !== savedEditsRef.current && !timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void save();
      }, SAVE_DELAY);
    }
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save();
    }, SAVE_DELAY);
  }, [save]);

  /** Modifie la fiche localement ; l'enregistrement suit tout seul. */
  const update = useCallback(
    (mutate: (draft: BrandKit) => BrandKit) => {
      const current = kitRef.current;
      if (!current || blockedRef.current) return;
      const next = mutate(current);
      kitRef.current = next;
      editsRef.current += 1;
      setKit(next);
      setSaveState("pending");
      schedule();
    },
    [schedule]
  );

  /** Envoie tout de suite ce qui attend. */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savingRef.current) await savingRef.current;
    if (editsRef.current !== savedEditsRef.current) await save();
  }, [save]);

  /**
   * Opération serveur qui rend la fiche modifiée (image, police, visuel
   * refait). Ce qui attend part d'abord, puis la fiche rendue est adoptée.
   */
  const runOne = useCallback(
    async (operation: () => Promise<BrandKit>): Promise<BrandKit | null> => {
      await flush();
      if (blockedRef.current) throw new Error("Rechargez d’abord l’image de marque : elle a changé ailleurs.");
      operationsRef.current += 1;
      try {
        const server = await operation();
        const dirty = editsRef.current !== savedEditsRef.current;
        if (dirty && kitRef.current) {
          const merged = mergeServerKit(kitRef.current, server);
          kitRef.current = merged;
          baseRef.current = server.updatedAt;
          setKit(merged);
        } else {
          kitRef.current = server;
          baseRef.current = server.updatedAt;
          editsRef.current = 0;
          savedEditsRef.current = 0;
          setKit(server);
          setSaveState("saved");
        }
        return server;
      } finally {
        operationsRef.current -= 1;
        if (operationsRef.current === 0 && editsRef.current !== savedEditsRef.current) schedule();
      }
    },
    [flush, schedule]
  );

  const runOperation = useCallback(
    (operation: () => Promise<BrandKit>): Promise<BrandKit | null> => {
      // Une à la fois : le serveur relit puis réécrit la fiche, deux ajouts simultanés se perdraient.
      const task = queueRef.current.then(() => runOne(operation));
      queueRef.current = task.then(
        () => undefined,
        () => undefined
      );
      return task;
    },
    [runOne]
  );

  // Ne rien perdre en quittant la page.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (editsRef.current !== savedEditsRef.current) {
        void flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  return { kit, exports, setExports, loadError, saveState, saveError, update, flush, runOperation, reload: load, retry: save };
}

export type KitEditor = ReturnType<typeof useKitEditor>;
