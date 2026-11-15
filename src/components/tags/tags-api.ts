"use client";

/**
 * Accès aux routes des tags depuis l'interface (docs/organisation.md, § 4).
 * Les erreurs remontent avec le message du serveur quand il en donne un.
 */
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/utils/chunk";
import { slugify, type Tag, type TagRef } from "@/lib/organization/types";

/** La liste `{ tags }` d'une réponse (tags complets ou `TagRef`, selon la route). */
export function readTagList<T extends TagRef = Tag>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const tags = (data as { tags?: unknown } | null)?.tags;
  return Array.isArray(tags) ? (tags as T[]) : [];
}

/** Un tag seul, que la route le rende nu ou sous `{ tag }`. */
export function readTag(data: unknown): Tag | null {
  const wrapped = (data as { tag?: unknown } | null)?.tag;
  const tag = (wrapped ?? data) as Tag | null;
  return tag && typeof tag.id === "number" ? tag : null;
}

async function request<T>(url: string, init: RequestInit | undefined, fallback: string, read: (data: unknown) => T): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(await readApiError(response, fallback));
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return read(data);
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const tagsApi = {
  list: () => request("/api/tags", undefined, "Les tags n’ont pas pu être chargés.", (data) => readTagList<Tag>(data)),
  create: (name: string, description?: string) =>
    request("/api/tags", jsonInit("POST", { name, ...(description ? { description } : {}) }), "Le tag n’a pas pu être créé.", readTag),
  update: (id: number, patch: { name?: string; description?: string | null }) =>
    request(`/api/tags/${id}`, jsonInit("PATCH", patch), "Le tag n’a pas pu être modifié.", readTag),
  remove: (id: number) => request(`/api/tags/${id}`, { method: "DELETE" }, "Le tag n’a pas pu être supprimé.", () => undefined),
  merge: (id: number, into: number) =>
    request(`/api/tags/${id}/merge`, jsonInit("POST", { into }), "Les tags n’ont pas pu être fusionnés.", readTag),
  ofFile: (fileName: string) =>
    request(`/api/files/${encodeURIComponent(fileName)}/tags`, undefined, "Les tags du fichier n’ont pas pu être chargés.", (data) =>
      readTagList<TagRef>(data),
    ),
  setOfFile: (fileName: string, names: string[]) =>
    request(
      `/api/files/${encodeURIComponent(fileName)}/tags`,
      jsonInit("PUT", { tags: names }),
      "Les tags n’ont pas été enregistrés.",
      (data) => readTagList<TagRef>(data),
    ),
  batch: (files: string[], change: { add?: string[]; remove?: string[] }) =>
    request("/api/files/tags/batch", jsonInit("POST", { files, ...change }), "Les tags n’ont pas pu être modifiés.", () => undefined),
};

/** Adresse de la galerie filtrée par un tag. */
export function galleryTagHref(slug: string): string {
  return `/gallery?tag=${encodeURIComponent(slug)}`;
}

/**
 * Le slug d'un nom de tag : celui du tag connu qui porte ce nom (un tag
 * renommé garde son ancien slug), sinon celui que le nom donnerait.
 */
export function slugOfName(name: string, known: TagRef[]): string {
  const match = known.find((tag) => tag.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
  return match?.slug ?? slugify(name);
}

/** Tous les tags de l'instance, chargés au montage. */
export function useTagList({ enabled = true }: { enabled?: boolean } = {}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await tagsApi.list());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les tags n’ont pas pu être chargés.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { tags, setTags, loading, error, reload };
}
