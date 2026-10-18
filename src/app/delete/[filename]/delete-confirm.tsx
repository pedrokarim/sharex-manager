"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";

import { DISPLAY } from "@/components/front/fonts";
import { PILL_SOFT, PILL_SOLID } from "@/components/front/styles";
import { FormStatus, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bouton de la page de suppression d'un lien ShareX. La page s'ouvre par un
 * simple GET qui ne supprime rien ; seule une action ici envoie la demande.
 */
export function DeleteConfirm({ filename, token }: { filename: string; token: string }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const feedback = useFeedback();

  async function handleDelete() {
    setPending(true);
    feedback.clear();
    try {
      const response = await fetch(
        `/api/files/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        setDone(true);
        return;
      }
      feedback.error(
        response.status === 403
          ? "Ce lien de suppression n’est plus valable."
          : response.status === 404
            ? "Ce fichier n’existe plus."
            : "La suppression n’a pas abouti. Réessayez dans un instant."
      );
    } catch {
      feedback.error("La suppression n’a pas abouti. Vérifiez votre réseau, puis réessayez.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div>
        <h1 className={cn(DISPLAY, "text-4xl leading-[1.05] text-balance sm:text-5xl")}>
          Fichier <em className="text-emerald-700 dark:text-emerald-400">supprimé</em>
        </h1>
        <p className="mt-5 text-pretty break-all text-muted-foreground">
          {filename} n’est plus en ligne. Son lien ne mène plus nulle part.
        </p>
        <Link href="/" className={cn(PILL_SOFT, "group mt-8 w-fit")}>
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Retour au site
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className={cn(DISPLAY, "text-4xl leading-[1.05] text-balance sm:text-5xl")}>
        Supprimer <em className="text-emerald-700 dark:text-emerald-400">ce fichier ?</em>
      </h1>
      <p className="mt-5 text-pretty text-muted-foreground">
        <span className="break-all font-medium text-foreground">{filename}</span> sera effacé du serveur et son lien
        cessera de fonctionner. Cette action est définitive.
      </p>
      <div className="mt-8 grid gap-3">
        <FormStatus state={feedback.state} />
        <Button
          type="button"
          onClick={handleDelete}
          loading={pending}
          className={cn(PILL_SOLID, "w-full justify-center")}
        >
          <Trash2 className="size-4" />
          Supprimer définitivement
        </Button>
      </div>
    </div>
  );
}
