"use client";

import type { PublishField, TextCount } from "@/lib/connections/types";
import type { BrandKit, BrandTheme, HashtagRule, KitSummary } from "./types";
import { MODULE_NAME, MODULE_PATH } from "./types";

export { MODULE_NAME, MODULE_PATH };

export interface FormatExport {
  format: string;
  file: string;
  url: string;
  size: number;
  updatedAt: number;
}

export interface KitAssistantJob {
  id: string;
  status: "running" | "done" | "error" | "canceled";
  brief: string;
  kitId?: string;
  steps: { id: string; label: string; state: "pending" | "running" | "done" | "error" | "skipped"; detail?: string }[];
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface PublishAccount {
  id: string;
  connector: string;
  connectorLabel: string;
  logo: string;
  name: string;
  label?: string;
  avatarUrl?: string;
  status: "connected" | "needs-reconnect";
}

/** Un service où publier une vidéo, avec ses champs (onglets « par service » de la section Publication). */
export interface PublishService {
  id: string;
  label: string;
  logo: string;
  fields: PublishField[];
  /** Où vont les hashtags si la marque ne choisit pas. */
  defaultHashtagRule: HashtagRule;
  /** Premier commentaire possible (suite de publication), et sa limite. */
  comment?: { maxLength: number; count?: TextCount };
}

export async function callAnyModule<T = unknown>(moduleName: string, functionName: string, ...args: unknown[]): Promise<T> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName, functionName, args }),
  });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Réponse illisible du serveur (HTTP ${response.status})`);
  }
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || `Échec de ${functionName}`);
  return payload?.data as T;
}

const call = <T>(name: string, ...args: unknown[]) => callAnyModule<T>(MODULE_NAME, name, ...args);

/** Un fichier binaire passe par `call-function` en base64, désigné comme tel. */
async function asBufferArg(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { type: "buffer", data: btoa(binary) };
}

async function asBase64(blob: Blob) {
  return (await asBufferArg(blob)).data;
}

export const api = {
  listKits: () => call<KitSummary[]>("listKits"),
  getKit: (id: string) => call<{ kit: BrandKit; exports: FormatExport[] }>("getKit", id),
  createKit: (input: { name: string; from?: string }) => call<BrandKit>("createKit", input),
  saveKit: (kit: BrandKit, expectedUpdatedAt: number) => call<BrandKit>("saveKit", kit, expectedUpdatedAt),
  deleteKit: (id: string) => call<{ success: boolean }>("deleteKit", id),
  setDefaultKit: (id: string) => call<KitSummary[]>("setDefaultKit", id),
  getBrandTheme: (id: string) => call<BrandTheme>("getBrandTheme", id),
  registerKitAsset: (kitId: string, input: { file: string; kind: string; label?: string }) => call<{ kit: BrandKit }>("registerKitAsset", kitId, input),
  importGalleryAsset: (kitId: string, input: { name: string; kind: string }) => call<{ kit: BrandKit }>("importGalleryAsset", kitId, input),
  importSvgAsset: (kitId: string, input: { svg: string; kind: string; label?: string }) => call<{ kit: BrandKit }>("importSvgAsset", kitId, input),
  removeKitAsset: (kitId: string, assetId: string) => call<BrandKit>("removeKitAsset", kitId, assetId),
  importFont: async (kitId: string, file: File) => call<BrandKit>("importFont", kitId, { name: file.name, data: await asBase64(file) }),
  removeFont: (kitId: string, fontId: string) => call<BrandKit>("removeFont", kitId, fontId),
  saveFormatExport: async (kitId: string, format: string, png: Blob) => call<FormatExport>("saveFormatExport", kitId, format, await asBufferArg(png)),
  sendFormatToGallery: (kitId: string, format: string) => call<{ fileName: string }>("sendFormatToGallery", kitId, format),
  exportKit: (kitId: string) => call<{ fileName: string; data: string }>("exportKit", kitId),
  importKit: async (archive: File) => call<BrandKit>("importKit", await asBufferArg(archive)),
  startKitAssistant: (input: { brief: string; name?: string; references?: { kind: "upload" | "gallery"; name: string }[]; mascot?: boolean }) =>
    call<KitAssistantJob>("startKitAssistant", input),
  getKitAssistantJob: (id: string) => call<KitAssistantJob | null>("getKitAssistantJob", id),
  listAssistantJobs: () => call<KitAssistantJob[]>("listAssistantJobs"),
  cancelKitAssistantJob: (id: string) => call<{ success: boolean }>("cancelKitAssistantJob", id),
  regenerateAsset: (kitId: string, assetId: string, note?: string) => call<BrandKit>("regenerateAsset", kitId, assetId, note),
  listPublishAccounts: () => call<PublishAccount[]>("listPublishAccounts"),
  listPublishServices: () => call<PublishService[]>("listPublishServices"),
};

/** Dépose une image dans le dépôt du module (route d'upload des modules), avant de la ranger dans une marque. */
export async function uploadImage(file: Blob, name: string): Promise<{ file: string }> {
  const form = new FormData();
  form.append("file", file, name);
  const response = await fetch(`/api/modules/${MODULE_NAME}/upload`, { method: "POST", body: form });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    // Réponse non JSON : proxy qui refuse un fichier trop lourd, par exemple.
  }
  if (!response.ok || !payload?.file) {
    throw new Error(response.status === 413 ? "Image trop lourde (20 Mo au plus)" : payload?.error ?? `Envoi impossible (HTTP ${response.status})`);
  }
  return { file: payload.file };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function editorHref(kitId: string) {
  return `${MODULE_PATH}/edit?kit=${encodeURIComponent(kitId)}`;
}

/** Télécharge un fichier reçu en base64. */
export function downloadBase64(fileName: string, base64: string, type = "application/zip") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  downloadBlob(fileName, new Blob([bytes], { type }));
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
