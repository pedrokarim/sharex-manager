"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionStatus, errorMessage, useFeedback } from "@/components/feedback";
import type { ClipExport } from "../engine/types";
import { sendExportToGallery } from "../lib/client";

/**
 * Envoie un clip exporté dans la galerie. Une fois envoyé, le bouton mène à
 * la galerie, où le clip se lit comme n'importe quel fichier : ce changement
 * de bouton suffit comme confirmation ; un échec s'affiche à côté de lui.
 */
export function SendToGalleryButton({
  entry,
  onSent,
  variant = "outline",
}: {
  entry: ClipExport;
  onSent?: (fileName: string) => void;
  variant?: "outline" | "secondary";
}) {
  const [sending, setSending] = useState(false);
  const [sentFile, setSentFile] = useState(entry.galleryFile);
  const feedback = useFeedback();

  if (sentFile) {
    return (
      <Button asChild variant={variant} className="gap-2">
        <Link href="/gallery">
          <Check className="h-4 w-4" />
          Voir dans la galerie
        </Link>
      </Button>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Button
        variant={variant}
        className="gap-2"
        loading={sending}
        onClick={async () => {
          setSending(true);
          feedback.clear();
          try {
            const { fileName } = await sendExportToGallery(entry.id);
            setSentFile(fileName);
            onSent?.(fileName);
          } catch (error) {
            feedback.error(errorMessage(error, "L’envoi dans la galerie a échoué. Réessayez."));
          } finally {
            setSending(false);
          }
        }}
      >
        <ImageUp className="h-4 w-4" />
        Envoyer dans la galerie
      </Button>
      {/* Vide, l'emplacement disparaît : pas d'écart parasite dans la rangée. */}
      <ActionStatus state={feedback.state} className="max-w-56 empty:hidden" />
    </span>
  );
}
