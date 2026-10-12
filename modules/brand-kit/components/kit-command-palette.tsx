"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandIcon, Palette, Plus, Sparkles, Star, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { api, editorHref } from "../lib/client";
import { MODULE_PATH, type KitSummary } from "../lib/types";

export interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Raccourci rappelé à droite : « 3 ». */
  shortcut?: string;
  onSelect: () => void;
}

/** `Ctrl K` (ou `⌘ K`) ouvre la palette, sauf quand une fenêtre est déjà ouverte. */
export function usePaletteShortcut(setOpen: (update: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

/** Le bouton qui rappelle le raccourci, dans l'en-tête. */
export function PaletteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={onClick} aria-label="Palette de commandes (Ctrl K)">
      <CommandIcon className="size-4" />
      <span className="hidden sm:inline">Aller à…</span>
      <KbdGroup className="hidden md:inline-flex">
        <Kbd className="text-foreground/75">Ctrl</Kbd>
        <Kbd className="text-foreground/75">K</Kbd>
      </KbdGroup>
    </Button>
  );
}

/**
 * Palette de commandes du module : ouvrir une marque par son nom, en créer
 * une, lancer l'assistant ; dans l'éditeur, aller à une section. Tout se
 * fait au clavier, sans revenir à la liste.
 */
export function KitCommandPalette({
  open,
  onOpenChange,
  kits,
  currentKitId,
  actions = [],
  actionsHeading = "Actions",
  onCreate,
  onAssistant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Marques déjà chargées ; sinon la palette les charge à l'ouverture. */
  kits?: KitSummary[] | null;
  currentKitId?: string;
  actions?: PaletteAction[];
  actionsHeading?: string;
  onCreate: () => void;
  onAssistant: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<KitSummary[] | null>(null);
  const list = kits ?? loaded;

  useEffect(() => {
    if (!open || kits || loaded) return;
    api.listKits().then(setLoaded, () => setLoaded([]));
  }, [open, kits, loaded]);

  const run = (task: () => void) => {
    onOpenChange(false);
    task();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Titre et description dans la fenêtre (lus par les lecteurs d'écran), pas à côté comme le ferait CommandDialog. */}
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>
        <DialogDescription className="sr-only">Ouvrir une image de marque, en créer une, aller à une section.</DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 **:data-[slot=command-input-wrapper]:h-12">
          <CommandInput placeholder="Chercher une marque ou une commande…" />
          <CommandList className="max-h-[min(420px,60svh)]">
            <CommandEmpty>Rien ne correspond.</CommandEmpty>
            {actions.length > 0 && (
              <>
                <CommandGroup heading={actionsHeading}>
                  {actions.map((action) => (
                    <CommandItem key={action.id} value={`${action.label} ${action.id}`} onSelect={() => run(action.onSelect)}>
                      <action.icon />
                      <span className="min-w-0 truncate">{action.label}</span>
                      {action.shortcut && (
                        <CommandShortcut>
                          <Kbd className="text-foreground/75">{action.shortcut}</Kbd>
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Images de marque">
              {list === null ? (
                <CommandItem disabled value="chargement">
                  Chargement…
                </CommandItem>
              ) : (
                list
                  .filter((kit) => kit.id !== currentKitId)
                  .map((kit) => (
                    <CommandItem key={kit.id} value={`${kit.name} ${kit.tagline ?? ""} ${kit.id}`} onSelect={() => run(() => router.push(editorHref(kit.id)))}>
                      <span aria-hidden className="flex shrink-0 -space-x-1">
                        {[kit.palette.background, kit.palette.accent, kit.palette.ink].map((color, index) => (
                          <span key={index} className="size-3.5 rounded-full border border-background ring-1 ring-border" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={kit.name}>
                        {kit.name}
                      </span>
                      {kit.isDefault && <Star aria-label="par défaut" className="size-3.5 fill-current" />}
                    </CommandItem>
                  ))
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Créer">
              <CommandItem value="nouvelle image de marque créer" onSelect={() => run(onCreate)}>
                <Plus />
                Nouvelle image de marque
              </CommandItem>
              <CommandItem value="assistant créer avec l’assistant ia" onSelect={() => run(onAssistant)}>
                <Sparkles />
                Créer avec l’assistant
              </CommandItem>
            </CommandGroup>
            {currentKitId && (
              <CommandGroup heading="Aller à">
                <CommandItem value="toutes les images de marque liste retour" onSelect={() => run(() => router.push(MODULE_PATH))}>
                  <Palette />
                  Toutes les images de marque
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
