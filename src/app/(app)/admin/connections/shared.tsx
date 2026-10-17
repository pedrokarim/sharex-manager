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
  useEffect(() => setLabel(account?.label ?? ""), [account]);
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
            const result = await renameAccountAction(account.id, label);
            setBusy(false);
            if (!result.ok) return void toast.error(result.error);
            onRenamed(result.data);
          }}
        >
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={account?.name} maxLength={100} autoFocus />
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
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!account) return;
              setBusy(true);
              const result = await disconnectAccountAction(account.id);
              setBusy(false);
              if (!result.ok) return void toast.error(result.error);
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
