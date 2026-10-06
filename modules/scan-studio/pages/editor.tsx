"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditorSkeleton } from "../components/editor/editor-skeleton";
import { Workshop } from "../components/editor/workshop";
import { MODULE_PATH, api } from "../lib/client";
import { isId, type PageView } from "../lib/types";

/**
 * Atelier d'une page : `/m/scan-studio/edit?page=<identifiant>`.
 *
 * Cette page ne fait que lire la page demandée ; tout l'atelier est dans
 * `components/editor/`. Pendant la lecture, une silhouette de l'atelier tient
 * la place.
 */
export default function EditorPage() {
  const params = useSearchParams();
  const pageId = params.get("page");
  /** Incrémenté pour relire la page après un conflit de révision. */
  const [reloadToken, setReloadToken] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; view: PageView | null }>();
  const requestKey = `${pageId ?? ""}:${reloadToken}`;
  const valid = isId(pageId);

  useEffect(() => {
    if (!valid || !pageId) return;
    let cancelled = false;
    api
      .getPage(pageId)
      .then((view) => {
        if (!cancelled) setLoaded({ key: requestKey, view });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof Error && error.message ? error.message : "Lecture de la page impossible");
        setLoaded({ key: requestKey, view: null });
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, valid, requestKey]);

  // La réponse d'une autre page, encore en mémoire, ne vaut pas pour celle-ci.
  const current = loaded?.key === requestKey ? loaded : undefined;

  if (valid && !current) return <EditorSkeleton />;
  if (!current?.view) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <p className="text-sm text-muted-foreground">Cette page est introuvable.</p>
        <Button asChild variant="outline" size="sm">
          <Link href={MODULE_PATH}>Retour à la bibliothèque</Link>
        </Button>
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <Workshop key={requestKey} view={current.view} onReload={() => setReloadToken((token) => token + 1)} />
    </MotionConfig>
  );
}
