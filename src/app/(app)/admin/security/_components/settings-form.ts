"use client";

/**
 * Formulaire d'une section de réglages (`sessions`, `apiKeys`, `logs`…) :
 * un brouillon par-dessus la valeur enregistrée, « modifié » seulement s'il
 * en diffère, et un enregistrement qui n'envoie que cette section. La
 * réponse du serveur remplace les réglages de tout l'écran : les autres
 * panneaux voient aussitôt la nouvelle valeur.
 */

import { useState } from "react";
import { errorMessage, useFeedback } from "@/components/feedback";
import type { SecuritySection, SecuritySettings, SecuritySettingsPatch } from "@/lib/security/settings-schema";
import { requestJson, type SettingsPayload } from "./api";
import { SETTINGS_URL, useSettings } from "./data";

/** Mêmes champs, mêmes valeurs (une section n'a que des valeurs simples). */
export function sameValues(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!Object.is(left[key], right[key])) return false;
  return true;
}

/** Ce qui part au serveur : la section seule, telle que le brouillon la donne. */
export function sectionPatch<S extends SecuritySection>(section: S, draft: SecuritySettings[S]): SecuritySettingsPatch {
  return { [section]: { ...draft } } as SecuritySettingsPatch;
}

export function useSectionForm<S extends SecuritySection>(section: S, settings: ReturnType<typeof useSettings>) {
  const saved = settings.state.status === "ready" ? settings.state.data.settings[section] : null;
  const [draft, setDraft] = useState<SecuritySettings[S] | null>(null);
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback({ successDuration: 4000 });
  const value = draft ?? saved;
  const dirty = Boolean(draft && saved && !sameValues(draft, saved));

  const update = (patch: Partial<SecuritySettings[S]>) => {
    if (!value) return;
    feedback.clear();
    setDraft({ ...value, ...patch });
  };

  const reset = () => {
    feedback.clear();
    setDraft(null);
  };

  const save = async (successMessage = "Enregistré") => {
    if (!draft || !dirty) return;
    setSaving(true);
    feedback.clear();
    try {
      const payload = await requestJson<SettingsPayload>(SETTINGS_URL, { method: "PUT", json: sectionPatch(section, draft) });
      settings.replace(payload);
      setDraft(null);
      feedback.success(successMessage);
    } catch (error) {
      feedback.error(errorMessage(error, "Les réglages n’ont pas pu être enregistrés."));
    } finally {
      setSaving(false);
    }
  };

  return { value, saved, dirty, saving, feedback, update, reset, save };
}

export type SectionForm<S extends SecuritySection> = ReturnType<typeof useSectionForm<S>>;
