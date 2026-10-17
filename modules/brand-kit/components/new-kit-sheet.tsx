"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, FileArchive, FilePlus2, ImagePlus, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { ThinkingStatus } from "@/components/loading";
import { Spinner } from "@/components/ui/spinner";
import { ImagePickerDialog, type PickedImage } from "@/components/gallery/image-picker-dialog";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropZone } from "@/components/ui/drop-zone";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api, errorMessage, type KitAssistantJob } from "../lib/client";
import { KIT_LIMITS, type BrandKit, type KitSummary } from "../lib/types";
import { galleryThumbnail, uploadPicked } from "./asset-intake";
import { AssistantJobProgress } from "./assistant-jobs";
import { CountedInput, CountedTextarea } from "./fields";

const MAX_REFERENCES = 6;
const BRIEF_MAX = 2000;

export type CreateTab = "manual" | "assistant";
type Start = "blank" | "duplicate" | "archive";

interface Reference {
  id: string;
  kind: "upload" | "gallery";
  name: string;
  label: string;
  preview: string;
  /** Adresse d'objet à libérer en retirant la référence. */
  revoke?: boolean;
}

interface NewKitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Onglet montré à l'ouverture. */
  tab: CreateTab;
  kits: KitSummary[];
  /** Marque proposée au départ dans « Dupliquer ». */
  duplicateFrom?: string;
  /** Travaux de l'assistant, pour suivre celui qu'on vient de lancer. */
  jobs: KitAssistantJob[];
  onCreated: (kit: BrandKit) => void;
  onAssistantStarted: () => void;
  onCancelJob: (id: string) => void;
}

/**
 * « Nouvelle image de marque » dans un tiroir latéral : à la main (un nom
 * suffit, la maquette est prête à remplir) ou avec l'assistant, dont on suit
 * ensuite les étapes sans quitter le tiroir.
 */
export function NewKitSheet({ open, onOpenChange, tab: initialTab, kits, duplicateFrom, jobs, onCreated, onAssistantStarted, onCancelJob }: NewKitSheetProps) {
  const [tab, setTab] = useState<CreateTab>(initialTab);
  const [busy, setBusy] = useState(false);

  // À la main
  const [name, setName] = useState("");
  const [start, setStart] = useState<Start>("blank");
  const [source, setSource] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const archiveInput = useRef<HTMLInputElement>(null);

  // Avec l'assistant
  const [brief, setBrief] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [mascot, setMascot] = useState(false);
  const [references, setReferences] = useState<Reference[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);

  const referencesRef = useRef(references);
  useEffect(() => {
    referencesRef.current = references;
  }, [references]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setName("");
    setStart(duplicateFrom ? "duplicate" : "blank");
    setSource(duplicateFrom ?? (kits.find((kit) => kit.isDefault) ?? kits[0])?.id ?? "");
    setArchive(null);
    setBrief("");
    setAssistantName("");
    setMascot(false);
    setReferences([]);
    setLaunched(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remise à zéro à l'ouverture seulement
  }, [open]);

  // Les aperçus de fichiers locaux sont libérés à la fermeture.
  useEffect(() => {
    if (open) return;
    for (const reference of referencesRef.current) if (reference.revoke) URL.revokeObjectURL(reference.preview);
  }, [open]);

  const manualReady = start === "archive" ? Boolean(archive) : Boolean(name.trim()) && (start === "blank" || Boolean(source));
  const assistantReady = brief.trim().length >= 5 && uploading === 0;
  const job = launched ? jobs.find((entry) => entry.id === launched) : undefined;

  const submitManual = async () => {
    if (!manualReady || busy) return;
    setBusy(true);
    try {
      let kit: BrandKit;
      if (start === "archive" && archive) {
        kit = await api.importKit(archive);
        const wanted = name.replace(/\s+/g, " ").trim();
        // Un nom saisi remplace celui de l'archive.
        if (wanted && wanted !== kit.name) kit = await api.saveKit({ ...kit, name: wanted }, kit.updatedAt);
      } else {
        kit = await api.createKit({ name: name.trim(), from: start === "duplicate" ? source : undefined });
      }
      onOpenChange(false);
      onCreated(kit);
    } catch (error) {
      toast.error(errorMessage(error, "Création impossible."));
    } finally {
      setBusy(false);
    }
  };

  const submitAssistant = async () => {
    if (!assistantReady || busy) return;
    setBusy(true);
    try {
      const started = await api.startKitAssistant({
        brief: brief.trim(),
        name: assistantName.trim() || undefined,
        references: references.map(({ kind, name: file }) => ({ kind, name: file })),
        mascot,
      });
      setLaunched(started.id);
      onAssistantStarted();
    } catch (error) {
      toast.error(errorMessage(error, "L’assistant n’a pas pu démarrer."));
    } finally {
      setBusy(false);
    }
  };

  const addReference = async (picked: PickedImage) => {
    if (referencesRef.current.length + uploading >= MAX_REFERENCES) return;
    setUploading((count) => count + 1);
    try {
      const uploaded = await uploadPicked(picked);
      const preview = picked.kind === "gallery" ? galleryThumbnail(picked.name) : picked.kind === "file" ? URL.createObjectURL(picked.file) : picked.url;
      setReferences((previous) => [
        ...previous,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: uploaded.kind, name: uploaded.name, label: uploaded.label, preview, revoke: picked.kind === "file" },
      ]);
    } catch (error) {
      toast.error(errorMessage(error, "Cette image n’a pas pu être jointe."));
    } finally {
      setUploading((count) => count - 1);
    }
  };

  const removeReference = (reference: Reference) => {
    if (reference.revoke) URL.revokeObjectURL(reference.preview);
    setReferences((previous) => previous.filter((entry) => entry.id !== reference.id));
  };

  const roomForReferences = MAX_REFERENCES - references.length - uploading;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden sm:max-w-xl">
          <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
            <div className="grid min-w-0 flex-1 gap-1">
              <SheetTitle>{launched ? "L’assistant crée la marque" : "Nouvelle image de marque"}</SheetTitle>
              <SheetDescription>
                {launched
                  ? "Vous pouvez fermer ce tiroir : la création continue et reste suivie dans la liste."
                  : "Palette, polices, logos et ton d’une chaîne, appliqués ensuite aux vidéos et aux captures."}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={() => onOpenChange(false)}>
              <X />
            </Button>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {launched ? (
              job ? (
                <AssistantJobProgress job={job} onCancel={() => onCancelJob(job.id)} onOpen={() => onOpenChange(false)} />
              ) : (
                <ThinkingStatus messages="Démarrage de l’assistant…" state="composing" />
              )
            ) : (
              <Tabs value={tab} onValueChange={(value) => setTab(value as CreateTab)} className="gap-4">
                <TabsList className="w-full">
                  <TabsTrigger value="manual">À la main</TabsTrigger>
                  <TabsTrigger value="assistant">
                    <Sparkles />
                    Avec l’assistant
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="manual">
                  <form
                    id="brand-kit-manual"
                    className="grid gap-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitManual();
                    }}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor="brand-kit-name">Nom{start === "archive" ? " (facultatif)" : ""}</Label>
                      <CountedInput
                        id="brand-kit-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={KIT_LIMITS.name}
                        placeholder={start === "archive" ? "Celui de l’archive" : "Nom de la chaîne ou de la marque"}
                        autoComplete="off"
                        autoFocus
                      />
                      {start === "blank" && <p className="text-xs text-muted-foreground">Un nom suffit : palette, polices et carton de fin sont prêts, à remplacer pièce par pièce.</p>}
                    </div>
                    <fieldset className="grid gap-2">
                      <legend className="mb-2 text-sm font-medium">Point de départ</legend>
                      <RadioGroup value={start} onValueChange={(value) => setStart(value as Start)} className="gap-2">
                        <StartOption value="blank" icon={FilePlus2} title="Vierge" text="Une maquette prête à remplir." />
                        <StartOption value="duplicate" icon={Copy} title="Copie d’une marque" text="Toute la fiche, ses images et ses polices, sous un nouveau nom." disabled={kits.length === 0} />
                        <StartOption value="archive" icon={FileArchive} title="Archive ZIP" text="Un brand.json et ses fichiers, exportés depuis ShareX Manager." />
                      </RadioGroup>
                    </fieldset>
                    {start === "duplicate" && kits.length > 0 && (
                      <div className="grid gap-1.5">
                        <span className="text-sm font-medium">Marque à copier</span>
                        <Command className="rounded-lg border">
                          {kits.length > 6 && <CommandInput placeholder="Chercher une marque…" />}
                          <CommandList className="max-h-56">
                            <CommandEmpty>Aucune marque de ce nom.</CommandEmpty>
                            <CommandGroup>
                              {kits.map((kit) => (
                                <CommandItem
                                  key={kit.id}
                                  value={`${kit.name} ${kit.id}`}
                                  onSelect={() => setSource(kit.id)}
                                  aria-selected={kit.id === source}
                                  className={cn(kit.id === source && "bg-primary/10 data-[selected=true]:bg-primary/15")}
                                >
                                  <span aria-hidden className="flex shrink-0 -space-x-1">
                                    {[kit.palette.background, kit.palette.accent, kit.palette.ink].map((color, index) => (
                                      <span key={index} className="size-3.5 rounded-full border border-background ring-1 ring-border" style={{ backgroundColor: color }} />
                                    ))}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate" title={kit.name}>
                                    {kit.name}
                                  </span>
                                  {kit.isDefault && <Star aria-label="par défaut" className="size-3.5 fill-current" />}
                                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", kit.id === source ? "bg-primary" : "bg-transparent")} />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </div>
                    )}
                    {start === "archive" && (
                      <DropZone
                        onFiles={(files) => setArchive(files[0] ?? null)}
                        accept={(file) => /\.zip$/i.test(file.name)}
                        label="Déposer l’archive"
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4"
                      >
                        <input
                          ref={archiveInput}
                          type="file"
                          accept=".zip,application/zip"
                          className="hidden"
                          onChange={(event) => {
                            setArchive(event.target.files?.[0] ?? null);
                            event.target.value = "";
                          }}
                        />
                        <Button type="button" variant="outline" className="gap-2" onClick={() => archiveInput.current?.click()}>
                          <FileArchive className="size-4" />
                          Choisir une archive
                        </Button>
                        <span className="min-w-0 flex-1 basis-40 text-sm break-all text-muted-foreground" title={archive?.name}>
                          {archive ? archive.name : "ou la déposer ici, 15 Mo au plus"}
                        </span>
                      </DropZone>
                    )}
                  </form>
                </TabsContent>

                <TabsContent value="assistant">
                  <form
                    id="brand-kit-assistant"
                    className="grid gap-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitAssistant();
                    }}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor="brand-kit-brief">Demande</Label>
                      <CountedTextarea
                        id="brand-kit-brief"
                        value={brief}
                        onChange={(event) => setBrief(event.target.value)}
                        maxLength={BRIEF_MAX}
                        rows={5}
                        placeholder="Une chaîne de shorts sur l’anime et le jeu vidéo, style impression risographie rose et bleu…"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="brand-kit-assistant-name">Nom (facultatif)</Label>
                      <CountedInput
                        id="brand-kit-assistant-name"
                        value={assistantName}
                        onChange={(event) => setAssistantName(event.target.value)}
                        maxLength={KIT_LIMITS.name}
                        placeholder="L’assistant en propose un"
                        autoComplete="off"
                      />
                    </div>
                    <label className="flex items-start gap-2.5 text-sm">
                      <Switch checked={mascot} onCheckedChange={setMascot} className="mt-0.5" />
                      <span>
                        Créer une mascotte
                        <span className="block text-xs text-muted-foreground">Une feuille de modèle, puis une pose contrôlée contre elle.</span>
                      </span>
                    </label>
                    <div className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">Références</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {references.length}/{MAX_REFERENCES}
                        </span>
                      </div>
                      <DropZone
                        onFiles={(files) => files.slice(0, Math.max(0, roomForReferences)).forEach((file) => void addReference({ kind: "file", file }))}
                        accept={(file) => file.type.startsWith("image/")}
                        disabled={roomForReferences <= 0}
                        label="Déposer pour joindre"
                        className="rounded-lg"
                      >
                        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                          <AnimatePresence initial={false}>
                            {references.map((reference) => (
                              <motion.li key={reference.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} className="min-w-0">
                                <Attachment className="w-full">
                                  <AttachmentMedia variant="image">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local ou vignette de la galerie */}
                                    <img src={reference.preview} alt="" />
                                  </AttachmentMedia>
                                  <AttachmentContent>
                                    <AttachmentTitle title={reference.label}>{reference.label}</AttachmentTitle>
                                    <AttachmentDescription>{reference.kind === "gallery" ? "Galerie" : "Envoyée"}</AttachmentDescription>
                                  </AttachmentContent>
                                  <AttachmentActions>
                                    <AttachmentAction aria-label={`Retirer ${reference.label}`} onClick={() => removeReference(reference)}>
                                      <X />
                                    </AttachmentAction>
                                  </AttachmentActions>
                                </Attachment>
                              </motion.li>
                            ))}
                            {Array.from({ length: uploading }, (_, index) => (
                              <motion.li key={`uploading-${index}`} layout className="min-w-0">
                                <Attachment state="uploading" className="w-full">
                                  <AttachmentMedia>
                                    <Spinner aria-hidden />
                                  </AttachmentMedia>
                                  <AttachmentContent>
                                    <AttachmentTitle>Envoi de l’image…</AttachmentTitle>
                                  </AttachmentContent>
                                </Attachment>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                          {roomForReferences > 0 && (
                            <li className="min-w-0">
                              <button
                                type="button"
                                onClick={() => setPickerOpen(true)}
                                className="flex h-full min-h-14 w-full items-center gap-2.5 rounded-xl border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                              >
                                <ImagePlus aria-hidden className="size-5 shrink-0" />
                                Joindre une image
                              </button>
                            </li>
                          )}
                        </ul>
                      </DropZone>
                      <p className="text-xs text-muted-foreground">Logo existant, captures, planches : transmis tels quels à l’assistant. Les fichiers se déposent aussi ici.</p>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
            {launched ? (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                {tab === "manual" ? (
                  <Button type="submit" form="brand-kit-manual" loading={busy} disabled={!manualReady} className="gap-2">
                    {start === "archive" ? "Importer" : "Créer et ouvrir"}
                  </Button>
                ) : (
                  <Button type="submit" form="brand-kit-assistant" loading={busy} disabled={!assistantReady} className="gap-2">
                    <Sparkles className="size-4" />
                    Lancer l’assistant
                  </Button>
                )}
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(image) => void addReference(image)}
        title="Image de référence"
        description="Elle guide l’assistant : style, couleurs, personnage."
      />
    </>
  );
}

function StartOption({ value, icon: Icon, title, text, disabled }: { value: Start; icon: typeof Copy; title: string; text: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
      <RadioGroupItem value={value} disabled={disabled} className="mt-0.5" />
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {/* Un cran plus foncé que d'habitude : le fond teinté de l'option choisie mangerait le contraste. */}
        <span className="text-xs text-foreground/70">{text}</span>
      </span>
    </label>
  );
}
