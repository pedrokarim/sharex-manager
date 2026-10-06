"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "../../lib/library-helpers";

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel: string;
  /** Lève en cas d'échec : la fenêtre reste ouverte et l'erreur est affichée. */
  onSubmit: (name: string) => Promise<void>;
}

/** Fenêtre à un seul champ : créer ou renommer un dossier. */
export function NameDialog({ open, onOpenChange, title, description, label, placeholder, initialValue = "", submitLabel, onSubmit }: NameDialogProps) {
  const [name, setName] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(initialValue);
  }, [open, initialValue]);

  const trimmed = name.trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="scan-studio-name">{label}</Label>
            <Input
              id="scan-studio-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholder}
              maxLength={120}
              autoFocus
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!trimmed || busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ChapterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialNumber?: string;
  initialTitle?: string;
  submitLabel: string;
  onSubmit: (input: { number: string; title?: string }) => Promise<void>;
}

/** Créer ou renommer un chapitre : un numéro libre, un titre facultatif. */
export function ChapterDialog({ open, onOpenChange, title, description, initialNumber = "", initialTitle = "", submitLabel, onSubmit }: ChapterDialogProps) {
  const [number, setNumber] = useState(initialNumber);
  const [chapterTitle, setChapterTitle] = useState(initialTitle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumber(initialNumber);
    setChapterTitle(initialTitle);
  }, [open, initialNumber, initialTitle]);

  const trimmedNumber = number.trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmedNumber || busy) return;
    setBusy(true);
    try {
      await onSubmit({ number: trimmedNumber, title: chapterTitle.trim() || undefined });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ChapterFields number={number} title={chapterTitle} onNumberChange={setNumber} onTitleChange={setChapterTitle} autoFocus />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!trimmedNumber || busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Les deux champs d'un chapitre, repris par la fenêtre d'accueil des images de la galerie. */
export function ChapterFields({
  number,
  title,
  onNumberChange,
  onTitleChange,
  autoFocus = false,
}: {
  number: string;
  title: string;
  onNumberChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
      <div className="grid gap-2">
        <Label htmlFor="scan-studio-chapter-number">Numéro</Label>
        <Input
          id="scan-studio-chapter-number"
          value={number}
          onChange={(event) => onNumberChange(event.target.value)}
          placeholder="12.5"
          maxLength={24}
          autoFocus={autoFocus}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="scan-studio-chapter-title">Titre (facultatif)</Label>
        <Input
          id="scan-studio-chapter-title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Le retour"
          maxLength={160}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Ce qui sera perdu, en clair. */
  description: string;
  onConfirm: () => void;
}

/** Confirmation d'une suppression : elle dit ce qui part avec l'objet. */
export function ConfirmDeleteDialog({ open, onOpenChange, title, description, onConfirm }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-white hover:bg-destructive/90">
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
