"use client";

/**
 * Fenêtres propres à la page « Comptes connectés » (renommage, déconnexion).
 * Les pièces communes (avatar, état, logos, parcours de connexion) vivent
 * dans `src/components/connections/`, que les modules ouvrent aussi.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { FormStatus, useFeedback } from "@/components/feedback";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AccountSummary } from "@/lib/connections/types";
import { disconnectAccountAction, renameAccountAction } from "./actions";

// ─── Renommer, déconnecter ────────────────────────────────────────

export function RenameDialog({
  account,
  onOpenChange,
  onRenamed,
}: {
  account: AccountSummary | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: (account: AccountSummary) => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  // L'erreur s'affiche dans la fenêtre ; une réussite la ferme et le nouveau
  // nom se lit aussitôt dans la page.
  const feedback = useFeedback();
  const { clear } = feedback;
  useEffect(() => {
    setLabel(account?.label ?? "");
    clear();
  }, [account, clear]);
  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renommer le compte</DialogTitle>
          <DialogDescription>Nom affiché dans ShareX Manager seulement ; vide, c’est le nom chez le service qui s’affiche.</DialogDescription>
        </DialogHeader>
        <form
          id="rename-account-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!account) return;
            setBusy(true);
            feedback.clear();
            const result = await renameAccountAction(account.id, label);
            setBusy(false);
            if (!result.ok) return void feedback.error(result.error);
            onRenamed(result.data);
          }}
        >
          <Input
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              feedback.clear();
            }}
            placeholder={account?.name}
            maxLength={100}
            autoFocus
          />
          <FormStatus state={feedback.state} className="pt-3" />
        </form>
        <DialogFooter>
          <Button type="submit" form="rename-account-form" loading={busy} className="gap-2">
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisconnectDialog({
  account,
  connectorLabel,
  onOpenChange,
  onDisconnected,
}: {
  account: AccountSummary | null;
  connectorLabel?: string;
  onOpenChange: (open: boolean) => void;
  onDisconnected: (accountId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // Un échec s'affiche dans la fenêtre, qui reste ouverte. Une réussite la
  // ferme (et, depuis la fiche du compte, ramène à la liste) : son bilan,
  // parfois accompagné d'une marche à suivre, part donc dans un toast.
  const feedback = useFeedback();
  const { clear } = feedback;
  useEffect(() => clear(), [account, clear]);
  return (
    <AlertDialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Déconnecter « {account?.displayName} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            L’accès est révoqué chez {connectorLabel ?? account?.connectorLabel}. Les publications déjà faites restent en ligne ; les envois en attente
            pour ce compte sont annulés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Enveloppe toujours présente : sa marge négative compense l'écart
            de la grille, et l'espacement s'ouvre avec le message. */}
        <div className="-mt-4">
          <FormStatus state={feedback.state} className="pt-4" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!account) return;
              setBusy(true);
              feedback.clear();
              const result = await disconnectAccountAction(account.id);
              setBusy(false);
              if (!result.ok) return void feedback.error(result.error);
              if (result.data.revoked) toast.success("Compte déconnecté");
              else if (result.data.remaining > 0) toast.success(`Compte retiré ; l’accès reste ouvert pour les ${result.data.remaining} autres comptes de la même autorisation`);
              else if (result.data.help) toast.success("Compte retiré", { description: result.data.help, duration: 15_000 });
              else toast.success("Compte retiré ; la révocation chez le service n’a pas été confirmée");
              onDisconnected(account.id);
            }}
          >
            {busy ? <Spinner className="mr-2 size-4" /> : null}
            Déconnecter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
