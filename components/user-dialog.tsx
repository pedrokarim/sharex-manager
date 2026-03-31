"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserForm } from "./user-form";
import { useState } from "react";

interface UserDialogProps {
  user?: {
    id: string;
    username: string;
    role: "admin" | "user";
  };
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function UserDialog({ user, trigger, onSuccess }: UserDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant={user ? "outline" : "default"}>
            {user ? "Modifier" : "Ajouter un utilisateur"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <DialogTitle>
            {user ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Renseignez les informations du compte et son niveau d’accès dans un
            panneau compact.
          </DialogDescription>
        </DialogHeader>
        <UserForm
          user={user}
          onSuccess={() => {
            setOpen(false);
            if (onSuccess) onSuccess();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
