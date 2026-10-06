/**
 * État des sources sur le disque : activation, dernier usage, dernière erreur,
 * icône.
 *
 *   data/sources/settings.json     un bloc par adaptateur
 *   data/sources/icons/<id>.png    icône du site, servie par la route des données
 *   data/sources/jobs.json         derniers imports par lien (voir `jobs.ts`)
 *
 * Un adaptateur absent du fichier est activé : c'est le réglage par défaut.
 */

import path from "path";
import { dataRoot, readJson, writeJson } from "../../store";
import { MODULE_NAME, type SourceErrorKind, type SourceStatus } from "../../types";
import { SOURCE_ERROR_LEADS } from "../../library-helpers";
import type { SourceAdapter } from "./adapter";

// `dataRoot()` peut être déplacé par les tests : le build ne peut pas borner ce chemin.
export const sourcesDir = () => path.join(/* turbopackIgnore: true */ dataRoot(), "sources");
const settingsFile = () => path.join(sourcesDir(), "settings.json");

export const iconFile = (id: string) => path.join(sourcesDir(), "icons", `${id}.png`);
const iconUrl = (id: string, version: number) => `/api/modules/${MODULE_NAME}/data/sources/icons/${id}.png?v=${version}`;

export interface SourceState {
  enabled: boolean;
  lastUsedAt?: number;
  lastError?: { kind: SourceErrorKind; message: string; at: number };
  /** Quand l'icône a été récupérée, et quand la dernière tentative a échoué. */
  icon?: { fetchedAt?: number; failedAt?: number };
}

interface StoredSettings {
  adapters?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const stamp = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);

function readAll(): Record<string, unknown> {
  const stored = readJson<StoredSettings>(settingsFile());
  return stored && isRecord(stored.adapters) ? stored.adapters : {};
}

/** Ce qui est lu sur le disque est contrôlé : un fichier abîmé rend les réglages par défaut. */
export function readSourceState(id: string): SourceState {
  const raw = readAll()[id];
  const stored = isRecord(raw) ? raw : {};
  const state: SourceState = { enabled: stored.enabled !== false };

  const lastUsedAt = stamp(stored.lastUsedAt);
  if (lastUsedAt) state.lastUsedAt = lastUsedAt;

  const error = stored.lastError;
  if (isRecord(error) && typeof error.kind === "string" && error.kind in SOURCE_ERROR_LEADS && typeof error.message === "string") {
    state.lastError = { kind: error.kind as SourceErrorKind, message: error.message.slice(0, 500), at: stamp(error.at) ?? 0 };
  }

  if (isRecord(stored.icon)) {
    const fetchedAt = stamp(stored.icon.fetchedAt);
    const failedAt = stamp(stored.icon.failedAt);
    if (fetchedAt || failedAt) state.icon = { ...(fetchedAt ? { fetchedAt } : {}), ...(failedAt ? { failedAt } : {}) };
  }
  return state;
}

/** Lit, modifie et réécrit l'état d'un adaptateur d'une traite, sans `await` entre les deux. */
export function updateSourceState(id: string, change: (state: SourceState) => void): SourceState {
  const all = readAll();
  const state = readSourceState(id);
  change(state);
  writeJson(settingsFile(), { adapters: { ...all, [id]: state } });
  return state;
}

/** L'adaptateur tel que l'interface le montre. */
export function sourceStatus(adapter: SourceAdapter): SourceStatus {
  const state = readSourceState(adapter.id);
  const status: SourceStatus = {
    id: adapter.id,
    name: adapter.name,
    homepage: adapter.homepage,
    hosts: [...adapter.hosts],
    example: adapter.example,
    enabled: state.enabled,
  };
  if (state.icon?.fetchedAt) status.iconUrl = iconUrl(adapter.id, state.icon.fetchedAt);
  if (adapter.notes) status.notes = adapter.notes;
  if (state.lastUsedAt) status.lastUsedAt = state.lastUsedAt;
  if (state.lastError) status.lastError = state.lastError;
  return status;
}
