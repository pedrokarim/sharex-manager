"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  Ban,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  EyeOff,
  ImageDown,
  Layers,
  Maximize,
  PenLine,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Type,
  Undo2,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  callModule,
  downloadImage,
  imageUrl,
  type Collection,
  type HistoryItem,
  type Job,
} from "../lib/client";

/** Ce que le studio sait faire d'une génération, fourni par la page. */
export interface StudioActions {
  collections: Collection[];
  collectionsById: Map<string, Collection>;
  onOpen: (item: HistoryItem, fileIndex: number) => void;
  /** Remet la demande dans le compositeur : tout, ou le prompt seul. */
  onRestore: (item: HistoryItem, mode: "full" | "prompt") => void;
  /** Relance immédiatement la même demande, images de départ comprises. */
  onRerun: (item: HistoryItem) => void;
  onEdit: (item: HistoryItem, file: string) => void;
  onInspire: (item: HistoryItem, file: string) => void;
  onVariants: (item: HistoryItem, file: string) => void;
  onRetry: (job: Job) => void;
  onDismiss: (job: Job) => void;
  onMutate: () => void;
}

// ─── État partagé d'une génération ───────────────────────────────

export interface RenderActions {
  busy: boolean;
  favorite: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
  toggleFavorite: () => void;
}

export function useRenderActions(item: HistoryItem, onMutate: () => void): RenderActions {
  const [busy, setBusy] = useState(false);
  const [favorite, setFavorite] = useState(Boolean(item.favorite));

  useEffect(() => setFavorite(Boolean(item.favorite)), [item.favorite]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error: any) {
      toast.error(error?.message ?? "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = () =>
    run(async () => {
      const result = await callModule<{ favorite: boolean }>("toggleFavorite", item.id);
      setFavorite(result.favorite);
      onMutate();
    });

  return { busy, favorite, run, toggleFavorite };
}

// ─── Kits : menu contextuel ou menu déroulant ────────────────────

/**
 * Les deux familles de menus partagent la même API. Les actions sont écrites
 * une fois et rendues avec l'une ou l'autre : clic droit et bouton « … »
 * proposent exactement la même chose.
 */
export interface MenuKit {
  Item: ComponentType<any>;
  Label: ComponentType<any>;
  Separator: ComponentType<any>;
  Sub: ComponentType<any>;
  SubTrigger: ComponentType<any>;
  SubContent: ComponentType<any>;
}

export const contextMenuKit: MenuKit = {
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

export const dropdownMenuKit: MenuKit = {
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

function SectionLabel({ kit, children }: { kit: MenuKit; children: ReactNode }) {
  return (
    <kit.Label className="text-[11px] font-normal text-muted-foreground">{children}</kit.Label>
  );
}

// ─── Actions d'une génération terminée ───────────────────────────

export function GenerationMenuItems({
  kit,
  item,
  file,
  actions,
  studio,
}: {
  kit: MenuKit;
  item: HistoryItem;
  /** Image visée par un clic droit, pour ajouter les actions qui la concernent. */
  file?: string;
  actions: RenderActions;
  studio: StudioActions;
}) {
  const { Item, Separator, Sub, SubTrigger, SubContent } = kit;
  const { run } = actions;
  const index = file ? item.imageFiles.indexOf(file) : -1;
  const hasSources = Boolean(item.sourceImages?.length);

  return (
    <>
      {file && (
        <>
          <SectionLabel kit={kit}>Cette image</SectionLabel>
          <Item onClick={() => studio.onOpen(item, Math.max(0, index))}>
            <Maximize className="mr-2 h-4 w-4" />
            Ouvrir en grand
          </Item>
          <Item onClick={() => studio.onEdit(item, file)}>
            <PenLine className="mr-2 h-4 w-4" />
            Retoucher cette image
          </Item>
          <Item onClick={() => studio.onInspire(item, file)}>
            <Sparkles className="mr-2 h-4 w-4" />
            S&apos;en inspirer
          </Item>
          <Item onClick={() => studio.onVariants(item, file)}>
            <Wand2 className="mr-2 h-4 w-4" />
            Décliner en variantes
          </Item>
          <Item
            disabled={actions.busy}
            onClick={() =>
              run(async () => {
                const result = await callModule<{ file?: string }>("upscale", item.id, file, 2);
                toast.success(`Agrandie : ${result?.file}`);
                studio.onMutate();
              })
            }
          >
            <ZoomIn className="mr-2 h-4 w-4" />
            Agrandir ×2
          </Item>
          <Separator />
          <Item onClick={() => void copyImage(imageUrl(file))}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copier l&apos;image
          </Item>
          <Item onClick={() => downloadImage(imageUrl(file), file)}>
            <Download className="mr-2 h-4 w-4" />
            Télécharger
          </Item>
          <Item
            disabled={actions.busy || Boolean(item.savedToGallery?.[file])}
            onClick={() =>
              run(async () => {
                const result = await callModule<{ fileName?: string }>("sendToGallery", item.id, file);
                toast.success(`Ajoutée à la galerie : ${result?.fileName ?? file}`);
                studio.onMutate();
              })
            }
          >
            <ImageDown className="mr-2 h-4 w-4" />
            {item.savedToGallery?.[file] ? "Déjà dans la galerie" : "Envoyer dans la galerie"}
          </Item>
          {item.imageFiles.length > 1 && (
            <Item
              variant="destructive"
              onClick={() =>
                run(async () => {
                  await callModule("deleteImage", item.id, file);
                  toast.success("Image supprimée");
                  studio.onMutate();
                })
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer cette image
            </Item>
          )}
          <Separator />
          <SectionLabel kit={kit}>Cette génération</SectionLabel>
        </>
      )}

      <Item onClick={() => studio.onRestore(item, "full")}>
        <Undo2 className="mr-2 h-4 w-4" />
        <span className="flex-1">Reprendre</span>
        <span className="ml-3 text-[10px] text-muted-foreground">
          {hasSources ? "texte, réglages, images" : "texte, réglages"}
        </span>
      </Item>
      <Item onClick={() => studio.onRestore(item, "prompt")}>
        <Type className="mr-2 h-4 w-4" />
        Reprendre le texte seul
      </Item>
      <Item onClick={() => studio.onRerun(item)}>
        <Play className="mr-2 h-4 w-4" />
        Relancer à l&apos;identique
      </Item>
      <Item onClick={() => copyText(item.prompt)}>
        <Copy className="mr-2 h-4 w-4" />
        Copier le prompt
      </Item>

      <Separator />

      <Item onClick={actions.toggleFavorite} disabled={actions.busy}>
        <Star className={actions.favorite ? "mr-2 h-4 w-4 fill-amber-400 text-amber-400" : "mr-2 h-4 w-4"} />
        {actions.favorite ? "Retirer des favoris" : "Mettre en favori"}
      </Item>
      {studio.collections.length > 0 && (
        <Sub>
          <SubTrigger>
            <Layers className="mr-2 h-4 w-4" />
            Série
          </SubTrigger>
          <SubContent className="w-52">
            {studio.collections.map((collection) => (
              <Item
                key={collection.id}
                onClick={() =>
                  run(async () => {
                    await callModule("assignCollection", item.id, collection.id);
                    toast.success(`Ajoutée à « ${collection.name} »`);
                    studio.onMutate();
                  })
                }
              >
                <span className="flex-1 truncate">{collection.name}</span>
                {item.collectionId === collection.id && <Check className="ml-2 h-3.5 w-3.5" />}
              </Item>
            ))}
            {item.collectionId && (
              <>
                <Separator />
                <Item
                  onClick={() =>
                    run(async () => {
                      await callModule("assignCollection", item.id, null);
                      toast.success("Retirée de la série");
                      studio.onMutate();
                    })
                  }
                >
                  Retirer de la série
                </Item>
              </>
            )}
          </SubContent>
        </Sub>
      )}
      <Item
        onClick={() =>
          run(async () => {
            await callModule("sendAllToGallery", item.id);
            toast.success("Lot envoyé dans la galerie");
            studio.onMutate();
          })
        }
      >
        <ImageDown className="mr-2 h-4 w-4" />
        {item.imageFiles.length > 1 ? "Tout envoyer dans la galerie" : "Envoyer dans la galerie"}
      </Item>

      <Separator />

      <Item
        variant="destructive"
        onClick={() =>
          run(async () => {
            await callModule("deleteHistoryItem", item.id);
            toast.success("Génération supprimée");
            studio.onMutate();
          })
        }
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Supprimer la génération
      </Item>
    </>
  );
}

// ─── Actions d'un travail en cours ou échoué ─────────────────────

export function JobMenuItems({
  kit,
  job,
  studio,
}: {
  kit: MenuKit;
  job: Job;
  studio: StudioActions;
}) {
  const { Item, Separator } = kit;
  const failed = job.status === "error";
  return (
    <>
      <Item onClick={() => studio.onRetry(job)}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Reprendre la demande
      </Item>
      <Item onClick={() => copyText(job.request.prompt)}>
        <Copy className="mr-2 h-4 w-4" />
        Copier le prompt
      </Item>
      <Separator />
      {failed ? (
        <Item onClick={() => studio.onDismiss(job)}>
          <EyeOff className="mr-2 h-4 w-4" />
          Masquer cet échec
        </Item>
      ) : (
        <Item
          variant="destructive"
          onClick={async () => {
            await callModule("cancelGeneration", job.id);
            toast.info("Génération annulée");
            studio.onMutate();
          }}
        >
          <Ban className="mr-2 h-4 w-4" />
          Annuler la génération
        </Item>
      )}
    </>
  );
}

// ─── Presse-papiers ──────────────────────────────────────────────

export function copyText(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success("Prompt copié");
}

/**
 * Copie une image dans le presse-papiers. Les navigateurs n'y acceptent que
 * du PNG : un JPEG ou un WebP est redessiné au passage.
 */
async function copyImage(url: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const png =
      blob.type === "image/png"
        ? blob
        : await new Promise<Blob>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              canvas.getContext("2d")?.drawImage(image, 0, 0);
              canvas.toBlob((result) => (result ? resolve(result) : reject(new Error())), "image/png");
            };
            image.onerror = () => reject(new Error());
            image.src = URL.createObjectURL(blob);
          });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    toast.success("Image copiée");
  } catch {
    toast.error("Copie de l'image impossible dans ce navigateur");
  }
}
