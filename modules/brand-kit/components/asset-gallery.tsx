"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, ImagePlus, Loader2, Pencil, RefreshCw, Trash2, Circle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ImagePickerDialog, type PickedImage } from "@/components/gallery/image-picker-dialog";
import { Attachment, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { ActionStatus, FormStatus, useFeedback, type FeedbackState } from "@/components/feedback";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropZone } from "@/components/ui/drop-zone";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api, errorMessage } from "../lib/client";
import { KIT_LIMITS, kitAssetUrl, type AssetKind, type BrandAsset, type BrandKit } from "../lib/types";
import { ASSET_KIND_LABELS, addPickedToKit, addSvgToKit } from "./asset-intake";
import { CHECKERBOARD } from "./asset-chooser";
import { ConfirmDialog } from "./fields";
import { ObjectContextMenu, ObjectMenuButton, type MenuEntry } from "./object-menu";
import type { FileSectionProps } from "./sections/types";

/** Rôles qu'une image peut tenir dans la marque, attribués depuis son menu. */
export type AssetRole = "logo" | "mark" | "watermark" | "end-pose";

const ROLE_LABELS: Record<AssetRole, string> = {
  logo: "logo principal",
  mark: "marque réduite",
  watermark: "filigrane",
  "end-pose": "carton de fin",
};

const ROLE_MENU: Record<AssetRole, string> = {
  logo: "Logo principal",
  mark: "Marque réduite",
  watermark: "Filigrane des vidéos",
  "end-pose": "Pose du carton de fin",
};

function holds(kit: BrandKit, asset: BrandAsset, role: AssetRole): boolean {
  switch (role) {
    case "logo":
      return kit.logoAssetId === asset.id;
    case "mark":
      return kit.markAssetId === asset.id;
    case "watermark":
      return kit.watermark?.assetId === asset.id;
    case "end-pose":
      return kit.endCard.poseAssetId === asset.id;
  }
}

/** Donne (ou retire) un rôle à une image. Le filigrane s'active avec ses réglages habituels. */
function assignRole(draft: BrandKit, asset: BrandAsset, role: AssetRole): BrandKit {
  const on = !holds(draft, asset, role);
  switch (role) {
    case "logo":
      return { ...draft, logoAssetId: on ? asset.id : undefined };
    case "mark":
      return { ...draft, markAssetId: on ? asset.id : undefined };
    case "watermark":
      if (!on) return { ...draft, watermark: undefined };
      return {
        ...draft,
        watermark: draft.watermark
          ? { ...draft.watermark, assetId: asset.id }
          : { assetId: asset.id, anchor: "bottom-right", size: 0.14, opacity: 0.85, margin: 0.035, startSeconds: 0 },
      };
    case "end-pose":
      return { ...draft, endCard: { ...draft.endCard, poseAssetId: on ? asset.id : undefined } };
  }
}

const CHECKS: Record<"ok" | "failed" | "unchecked", { label: string; icon: LucideIcon; className: string; title: string }> = {
  ok: { label: "vérifiée", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400", title: "Le contrôle de cohérence a validé ce personnage." },
  failed: { label: "à relire", icon: AlertTriangle, className: "text-amber-700 dark:text-amber-400", title: "Le contrôle de cohérence a refusé cette image deux fois : relisez-la." },
  unchecked: { label: "non vérifiée", icon: CircleDashed, className: "text-muted-foreground", title: "Codex n’était pas disponible pour contrôler cette image." },
};

const isImageFile = (file: File) => file.type.startsWith("image/") || /\.svg$/i.test(file.name);

interface AssetGalleryProps extends FileSectionProps {
  /** Types montrés ici. */
  kinds: AssetKind[];
  /** Type donné aux images ajoutées ici. */
  addKind: AssetKind;
  /** Rôles proposés dans le menu de chaque image. */
  roles?: AssetRole[];
  /** Phrase sous la grille quand elle est vide. */
  emptyText: string;
  /** Titre du sélecteur d'image. */
  pickerTitle: string;
  /** Filtre de la grille (bibliothèque de poses) ; l'ajout reste toujours possible. */
  filter?: (asset: BrandAsset) => boolean;
  /** Phrase quand le filtre ne laisse rien. */
  filteredEmptyText?: string;
  /** Contenu ajouté sous le libellé de chaque vignette (étiquettes d'une pose). */
  renderExtra?: (asset: BrandAsset) => ReactNode;
}

/**
 * Images de la marque en pièces jointes : vignette, aperçu agrandi au
 * survol, menu au clic droit (rôle dans la marque, renommer, refaire,
 * supprimer) et dépôt de fichiers par glisser. L'ajout passe par le
 * sélecteur commun ; le dépôt reste un raccourci.
 */
export function AssetGallery({ kit, update, runOperation, kinds, addKind, roles = [], emptyText, pickerTitle, filter, filteredEmptyText, renderExtra }: AssetGalleryProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(0);
  const [busyAsset, setBusyAsset] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<BrandAsset | null>(null);
  const [redoing, setRedoing] = useState<BrandAsset | null>(null);
  // Un ajout refusé s'écrit sous la grille ; une suppression refusée, sur sa vignette.
  const addFeedback = useFeedback();
  const removeFeedback = useFeedback();
  const [failedAsset, setFailedAsset] = useState<string | null>(null);

  const ofKind = kit.assets.filter((asset) => kinds.includes(asset.kind));
  const assets = filter ? ofKind.filter(filter) : ofKind;
  const full = kit.assets.length >= KIT_LIMITS.assets;

  const add = async (task: () => Promise<BrandKit>) => {
    setAdding((count) => count + 1);
    addFeedback.clear();
    try {
      await runOperation(task);
    } catch (error) {
      addFeedback.error(errorMessage(error, "Cette image n’a pas pu être ajoutée. Essayez un autre fichier."));
    } finally {
      setAdding((count) => count - 1);
    }
  };

  const addPicked = (picked: PickedImage) => void add(() => addPickedToKit(kit.id, picked, addKind));

  const addFiles = (files: File[]) => {
    for (const file of files.slice(0, Math.max(0, KIT_LIMITS.assets - kit.assets.length))) {
      if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml") void add(() => addSvgToKit(kit.id, file, addKind));
      else void add(() => addPickedToKit(kit.id, { kind: "file", file }, addKind));
    }
  };

  const remove = async (asset: BrandAsset) => {
    setBusyAsset(asset.id);
    removeFeedback.clear();
    try {
      await runOperation(() => api.removeKitAsset(kit.id, asset.id));
    } catch (error) {
      setFailedAsset(asset.id);
      removeFeedback.error(errorMessage(error, "L’image n’a pas pu être supprimée. Réessayez."));
    } finally {
      setBusyAsset(null);
    }
  };

  const regenerate = async (asset: BrandAsset, note: string) => {
    setBusyAsset(asset.id);
    try {
      await runOperation(() => api.regenerateAsset(kit.id, asset.id, note.trim() || undefined));
      // L'assistant redessine pendant de longues secondes : sa fin se notifie, où que l'on soit dans la page.
      toast.success(`« ${asset.label} » refait.`);
    } catch (error) {
      toast.error(errorMessage(error, "Le visuel n’a pas pu être refait. Réessayez dans un instant."));
    } finally {
      setBusyAsset(null);
    }
  };

  const setLabel = (asset: BrandAsset, label: string) =>
    update((draft) => ({ ...draft, assets: draft.assets.map((entry) => (entry.id === asset.id ? { ...entry, label } : entry)) }));

  return (
    <DropZone onFiles={addFiles} accept={isImageFile} disabled={full} label={`Déposer pour ajouter : ${ASSET_KIND_LABELS[addKind].toLocaleLowerCase("fr")}`} className="rounded-lg">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5">
        <AnimatePresence initial={false}>
          {assets.map((asset) => (
            <motion.li
              key={asset.id}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.16 }}
              className="min-w-0"
            >
              <AssetTile
                kit={kit}
                asset={asset}
                roles={roles}
                busy={busyAsset === asset.id}
                renaming={renaming === asset.id}
                onRename={() => setRenaming(asset.id)}
                onRenamed={() => setRenaming(null)}
                onLabel={(label) => setLabel(asset, label)}
                onRole={(role) => update((draft) => assignRole(draft, asset, role))}
                onDelete={() => setDoomed(asset)}
                onRedo={() => setRedoing(asset)}
                status={failedAsset === asset.id ? removeFeedback.state : null}
                extra={renderExtra?.(asset)}
              />
            </motion.li>
          ))}
          {Array.from({ length: adding }, (_, index) => (
            <motion.li key={`adding-${index}`} layout className="min-w-0">
              <Attachment state="uploading" orientation="vertical" className="w-full has-data-[slot=attachment-content]:w-full">
                <AttachmentMedia>
                  <Loader2 aria-hidden className="animate-spin text-muted-foreground" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>Ajout…</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            </motion.li>
          ))}
        </AnimatePresence>
        {!full && (
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-2 text-center text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ImagePlus aria-hidden className="size-5" />
              <span className="text-xs">Ajouter</span>
            </button>
          </li>
        )}
      </ul>
      {assets.length === 0 && adding === 0 && (
        <p className="pt-2 text-xs text-muted-foreground">{ofKind.length > 0 ? (filteredEmptyText ?? "Aucune image pour ce filtre.") : emptyText}</p>
      )}
      <FormStatus state={addFeedback.state} className="pt-2" />

      <ImagePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={addPicked} title={pickerTitle} description={ASSET_KIND_LABELS[addKind]} />

      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(open) => !open && setDoomed(null)}
        title={`Supprimer « ${doomed?.label ?? ""} » ?`}
        description="L’image quitte la marque ; les réglages qui la désignaient (logo, filigrane, carton de fin) se replient sur une autre image ou s’effacent."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (doomed) void remove(doomed);
          setDoomed(null);
        }}
      />

      <RedoDialog
        asset={redoing}
        onClose={() => setRedoing(null)}
        onConfirm={(note) => {
          if (redoing) void regenerate(redoing, note);
          setRedoing(null);
        }}
      />
    </DropZone>
  );
}

function AssetTile({
  kit,
  asset,
  roles,
  busy,
  renaming,
  onRename,
  onRenamed,
  onLabel,
  onRole,
  onDelete,
  onRedo,
  status,
  extra,
}: {
  kit: BrandKit;
  asset: BrandAsset;
  roles: AssetRole[];
  busy: boolean;
  renaming: boolean;
  onRename: () => void;
  onRenamed: () => void;
  onLabel: (label: string) => void;
  onRole: (role: AssetRole) => void;
  onDelete: () => void;
  onRedo: () => void;
  /** Échec d'une action sur cette image. */
  status?: FeedbackState | null;
  extra?: ReactNode;
}) {
  const url = kitAssetUrl(kit.id, asset.file);
  const held = (["logo", "mark", "watermark", "end-pose"] as AssetRole[]).filter((role) => holds(kit, asset, role));
  const check = asset.generated?.check ? CHECKS[asset.generated.check] : null;
  const entries: MenuEntry[] = [
    ...roles.map((role) => ({
      key: `role-${role}`,
      label: ROLE_MENU[role],
      icon: holds(kit, asset, role) ? CheckCircle2 : Circle,
      onSelect: () => onRole(role),
    })),
    { key: "rename", label: "Renommer", icon: Pencil, onSelect: onRename, separatorBefore: roles.length > 0 },
    { key: "open", label: "Ouvrir l’image", icon: ExternalLink, href: url, newTab: true },
    ...(asset.generated ? [{ key: "redo", label: "Refaire ce visuel", icon: RefreshCw, onSelect: onRedo, disabled: busy }] : []),
    { key: "delete", label: "Supprimer", icon: Trash2, onSelect: onDelete, destructive: true, separatorBefore: true, disabled: busy },
  ];
  // Le rôle dans la marque compte plus que la taille, montrée à l'aperçu agrandi.
  const details = held.length > 0 ? held.map((role) => ROLE_LABELS[role]).join(", ") : `${asset.width} × ${asset.height}`;

  return (
    <ObjectContextMenu entries={entries}>
      <Attachment state={busy ? "processing" : "done"} orientation="vertical" className="w-full has-data-[slot=attachment-content]:w-full">
        <AttachmentMedia style={{ background: CHECKERBOARD }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- image de la marque, servie par le module */}
          <img src={url} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain p-1.5" />
          <HoverCard openDelay={350} closeDelay={80}>
            {/* Le déclencheur couvre la vignette sans lui prendre son rôle (data-slot) : l'aperçu agrandi vient au survol. */}
            <HoverCardTrigger asChild>
              <span aria-hidden className="absolute inset-0 cursor-zoom-in" />
            </HoverCardTrigger>
            <HoverCardContent side="bottom" align="start" collisionPadding={16} className="w-72 max-w-[calc(100vw-2rem)] p-2">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border" style={{ background: CHECKERBOARD }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- image de la marque, servie par le module */}
                <img src={url} alt={asset.label} className="max-h-full max-w-full object-contain" />
              </div>
              <p className="mt-2 truncate px-0.5 text-sm font-medium" title={asset.label}>
                {asset.label}
              </p>
              <p className="px-0.5 text-xs text-muted-foreground">
                {ASSET_KIND_LABELS[asset.kind]} · {asset.width}&nbsp;×&nbsp;{asset.height}
              </p>
            </HoverCardContent>
          </HoverCard>
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 aria-label="Opération en cours" className="size-5 animate-spin" />
            </span>
          )}
        </AttachmentMedia>
        <AttachmentContent className="w-full">
          {renaming ? (
            <Input
              autoFocus
              aria-label="Libellé de l’image"
              defaultValue={asset.label}
              maxLength={KIT_LIMITS.label}
              onBlur={(event) => {
                const label = event.target.value.replace(/\s+/g, " ").trim();
                if (label && label !== asset.label) onLabel(label);
                onRenamed();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = asset.label;
                  event.currentTarget.blur();
                }
              }}
              className="h-6 px-1.5 text-xs"
            />
          ) : (
            <AttachmentTitle title={asset.label} onDoubleClick={onRename}>
              {asset.label}
            </AttachmentTitle>
          )}
          <AttachmentDescription title={details} className={cn("line-clamp-2 whitespace-normal", held.length > 0 && "text-primary")}>
            {details}
          </AttachmentDescription>
          {check && (
            <span className={cn("mt-0.5 flex items-center gap-1 text-[11px]", check.className)} title={check.title}>
              <check.icon aria-hidden className="size-3 shrink-0" />
              {check.label}
            </span>
          )}
          {extra}
          <ActionStatus state={status ?? null} className="max-w-full text-[11px] empty:hidden" />
        </AttachmentContent>
        <AttachmentActions>
          <ObjectMenuButton
            entries={entries}
            label={`Actions de ${asset.label}`}
            className="bg-background/85 shadow-xs backdrop-blur md:opacity-0 md:group-hover/attachment:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          />
        </AttachmentActions>
      </Attachment>
    </ObjectContextMenu>
  );
}

function RedoDialog({ asset, onClose, onConfirm }: { asset: BrandAsset | null; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={asset !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setNote("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-words">Refaire « {asset?.label} »</DialogTitle>
          <DialogDescription>L’assistant reprend la consigne d’origine, la collection et la feuille de la mascotte. Une note peut préciser ce qui doit changer.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="brand-kit-redo-note">Note (facultative)</Label>
          <Textarea id="brand-kit-redo-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} rows={3} placeholder="Plus de contraste, fond uni…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            className="gap-2"
            onClick={() => {
              onConfirm(note);
              setNote("");
            }}
          >
            <RefreshCw className="size-4" />
            Refaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
