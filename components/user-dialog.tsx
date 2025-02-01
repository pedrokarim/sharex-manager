"use client";

import {
  Dialog,
  DialogContent,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {user ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}
          </DialogTitle>
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
