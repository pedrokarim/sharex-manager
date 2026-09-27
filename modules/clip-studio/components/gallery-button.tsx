"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ClipExport } from "../engine/types";
import { sendExportToGallery } from "../lib/client";

/**
 * Envoie un clip exporté dans la galerie. Une fois envoyé, le bouton mène à
 * la galerie, où le clip se lit comme n'importe quel fichier.
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
    <Button
      variant={variant}
      className="gap-2"
      disabled={sending}
      onClick={async () => {
        setSending(true);
        try {
          const { fileName } = await sendExportToGallery(entry.id);
          setSentFile(fileName);
          onSent?.(fileName);
          toast.success("Clip ajouté à la galerie");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Envoi impossible");
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
      Envoyer dans la galerie
    </Button>
  );
}
