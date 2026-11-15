/**
 * Appels des routes de collections et de tags (docs/organisation.md, § 4),
 * côté navigateur. Chaque fonction lève une `Error` au texte lisible, que
 * l'écran affiche à côté de l'action qui a échoué.
 */
import type {
  Collection,
  CollectionOrder,
  CollectionPreview,
  CollectionRules,
  CollectionSort,
  CollectionSummary,
  Tag,
} from "@/lib/organization/types";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function serverMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

async function request(input: string, init: RequestInit | undefined, fallback: string): Promise<unknown> {
  const response = await fetch(input, { cache: "no-store", ...init }).catch(() => null);
  if (!response) throw new Error(`${fallback} Vérifiez votre connexion.`);
  const data = await readJson(response);
  if (!response.ok) throw new Error(serverMessage(data, fallback));
  return data;
}

/** Une liste rendue nue (`[...]`) ou enveloppée (`{ collections: [...] }`). */
function listFrom<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, T[]>)[key];
  }
  return [];
}

function collectionFrom(data: unknown): Collection {
  if (data && typeof data === "object" && "collection" in data) {
    return (data as { collection: Collection }).collection;
  }
  return data as Collection;
}

export async function fetchCollections(): Promise<CollectionSummary[]> {
  const data = await request("/api/collections", undefined, "Les collections n’ont pas pu être chargées.");
  return listFrom<CollectionSummary>(data, "collections");
}

/** Une collection du compte, par id ou par slug ; `null` si elle n'existe pas (ou appartient à un autre compte). */
export async function fetchCollection(idOrSlug: number | string): Promise<CollectionSummary | null> {
  const response = await fetch(`/api/collections/${encodeURIComponent(String(idOrSlug))}`, { cache: "no-store" }).catch(
    () => null,
  );
  if (!response) throw new Error("La collection n’a pas pu être chargée. Vérifiez votre connexion.");
  if (response.status === 404) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error(serverMessage(data, "La collection n’a pas pu être chargée."));
  return collectionFrom(data) as CollectionSummary;
}

export async function fetchTags(): Promise<Tag[]> {
  const data = await request("/api/tags", undefined, "Les tags n’ont pas pu être chargés.");
  return listFrom<Tag>(data, "tags");
}

/** Nombre de fichiers et quatre premiers noms des règles en cours d'écriture, dans l'ordre choisi. */
export async function previewRules(
  rules: CollectionRules,
  options: { sort?: CollectionSort; order?: CollectionOrder; signal?: AbortSignal } = {},
): Promise<CollectionPreview> {
  const { sort, order, signal } = options;
  const response = await fetch("/api/collections/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules, sort, order }),
    signal,
  });
  const data = (await readJson(response)) as Partial<CollectionPreview> | null;
  if (!response.ok) throw new Error(serverMessage(data, "L’aperçu n’a pas pu être calculé."));
  return {
    fileCount: typeof data?.fileCount === "number" ? data.fileCount : 0,
    cover: Array.isArray(data?.cover) ? data.cover : [],
  };
}

export interface CollectionInput {
  name: string;
  description: string | null;
  rules: CollectionRules;
  sort: CollectionSort;
  order: CollectionOrder;
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const data = await request(
    "/api/collections",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    "La collection n’a pas pu être créée.",
  );
  return collectionFrom(data);
}

export async function updateCollection(
  id: number,
  changes: Partial<CollectionInput> & { pinned?: boolean },
): Promise<Collection> {
  const data = await request(
    `/api/collections/${id}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) },
    "La collection n’a pas pu être modifiée.",
  );
  return collectionFrom(data);
}

export async function deleteCollection(id: number): Promise<void> {
  await request(`/api/collections/${id}`, { method: "DELETE" }, "La collection n’a pas pu être supprimée.");
}

/**
 * Épinglées d'abord ; l'ordre du serveur est gardé à l'intérieur de chaque
 * groupe. Le serveur rend déjà cet ordre : la liste le rétablit après un
 * épinglage fait sur place.
 */
export function sortCollections<T extends Pick<Collection, "pinned">>(collections: T[]): T[] {
  return collections
    .map((collection, index) => ({ collection, index }))
    .sort((a, b) => Number(b.collection.pinned) - Number(a.collection.pinned) || a.index - b.index)
    .map(({ collection }) => collection);
}

/** « 1 fichier », « 1 284 fichiers ». */
export function fileCountLabel(count: number): string {
  return `${count.toLocaleString("fr-FR")} ${count > 1 ? "fichiers" : "fichier"}`;
}

export const collectionHref = (slug: string) => `/organization/collections/${encodeURIComponent(slug)}`;
