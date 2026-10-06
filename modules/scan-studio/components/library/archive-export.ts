"use client";

/**
 * Export d'un chapitre en `.cbz`, dans le navigateur : les pages sont lues une
 * à une chez le serveur (avec la session) et rangées au fur et à mesure dans
 * l'archive. La mise en archive elle-même est dans `lib/library-archive.ts`.
 */

import { createBlobSink, planChapterArchive, writeArchive, type ChapterArchivePlan } from "../../lib/library-archive";
import { archiveFileName } from "../../lib/library-helpers";
import type { ChapterView } from "../../lib/types";

export interface ChapterArchive {
  fileName: string;
  blob: Blob;
  plan: ChapterArchivePlan;
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Une page n’a pas pu être lue (HTTP ${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Construit l'archive d'un chapitre : ses pages exportées dans l'ordre de
 * lecture, et telles quelles les pages « laissées telles quelles ». Lève s'il
 * n'y a rien à ranger.
 */
export async function buildChapterArchive(
  view: ChapterView,
  options: { signal?: AbortSignal; onPage?: (done: number, total: number) => void } = {}
): Promise<ChapterArchive> {
  const plan = planChapterArchive(view.pages);
  if (plan.pages.length === 0) throw new Error("Aucune page exportée dans ce chapitre.");

  const sink = createBlobSink();
  await writeArchive(
    plan.pages.map((page) => ({ name: page.name, read: () => fetchBytes(page.url, options.signal) })),
    sink,
    { signal: options.signal, onEntry: (index) => options.onPage?.(index + 1, plan.pages.length) }
  );
  return { fileName: archiveFileName(view.folder.name, view.chapter), blob: sink.finish(), plan };
}

/** Propose un fichier au téléchargement, puis libère son adresse. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Le navigateur a besoin de l'adresse le temps de lancer le téléchargement.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
