"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import type { FileKind } from "@/lib/media-kind";
import { describeRules, tagNameMap } from "@/lib/organization/describe-rules";
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_NAME_MAX,
  hasAnyRule,
  type Collection,
  type CollectionOrder,
  type CollectionRules,
  type CollectionSort,
  type Tag,
} from "@/lib/organization/types";
import { cn } from "@/lib/utils";
import { CollectionCover } from "./collection-cover";
import { createCollection, fileCountLabel, previewRules, updateCollection } from "./collection-api";
import { draftFromRules, rulesFromDraft, type PeriodMode, type RulesDraft, type TriState } from "./rules-draft";
import { TagRuleField } from "./tag-rule-field";

/** Retard entre la dernière frappe et la demande d'aperçu. */
export const PREVIEW_DELAY_MS = 300;

const NO_RULE_MESSAGE =
  "Ajoutez au moins une règle : sans règle, la collection reprendrait toute la galerie.";

const SORT_LABELS: Record<CollectionSort, string> = { date: "Date", name: "Nom", size: "Taille" };
const ORDER_LABELS: Record<CollectionSort, Record<CollectionOrder, string>> = {
  date: { desc: "Récents d’abord", asc: "Anciens d’abord" },
  name: { asc: "De A à Z", desc: "De Z à A" },
  size: { desc: "Plus lourds d’abord", asc: "Plus légers d’abord" },
};

const TOGGLE_ITEM = "h-8 px-3 data-[state=on]:border-foreground/30 data-[state=on]:bg-muted data-[state=on]:text-foreground";

interface CollectionEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Collection à modifier ; absente pour en créer une. */
  collection?: Collection | null;
  tags: Tag[];
  onSaved: (collection: Collection) => void;
}

/**
 * Éditeur d'une collection, dans un panneau latéral borné à l'écran : nom,
 * description, règles et tri, avec le nombre de fichiers retenus et leur
 * aperçu recalculés pendant la saisie.
 */
export function CollectionEditor({ open, onOpenChange, collection, tags, onSaved }: CollectionEditorProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-4xl">
        {open ? (
          <EditorForm
            key={collection?.id ?? "new"}
            collection={collection ?? null}
            tags={tags}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type PreviewState =
  | { status: "empty" }
  | { status: "loading" | "ready" | "error"; fileCount: number | null; cover: string[] };

function EditorForm({
  collection,
  tags,
  onCancel,
  onSaved,
}: {
  collection: Collection | null;
  tags: Tag[];
  onCancel: () => void;
  onSaved: (collection: Collection) => void;
}) {
  const formId = useId();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [draft, setDraft] = useState<RulesDraft>(() => draftFromRules(collection?.rules));
  const [sort, setSort] = useState<CollectionSort>(collection?.sort ?? "date");
  const [order, setOrder] = useState<CollectionOrder>(collection?.order ?? "desc");
  const [saving, setSaving] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const feedback = useFeedback();

  const rules = useMemo(() => rulesFromDraft(draft), [draft]);
  const summary = useMemo(() => describeRules(rules, tagNameMap(tags)), [rules, tags]);
  // L'aperçu suit aussi le tri : ses quatre fichiers sont les premiers de la collection.
  const preview = useRulesPreview(JSON.stringify({ rules, sort, order }));

  const update = (changes: Partial<RulesDraft>) => {
    feedback.clear();
    setDraft((current) => ({ ...current, ...changes }));
  };

  const taken = (except: "tagsAll" | "tagsAny" | "tagsNone") =>
    new Set((["tagsAll", "tagsAny", "tagsNone"] as const).filter((key) => key !== except).flatMap((key) => draft[key]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    feedback.clear();
    const cleanName = name.replace(/\s+/g, " ").trim();
    if (!cleanName) {
      setNameMissing(true);
      feedback.error("Donnez un nom à la collection.");
      return;
    }
    if (!hasAnyRule(rules)) {
      feedback.error(NO_RULE_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: cleanName,
        description: description.trim() || null,
        rules,
        sort,
        order,
      };
      const saved = collection ? await updateCollection(collection.id, input) : await createCollection(input);
      onSaved(saved);
    } catch (error) {
      feedback.error(errorMessage(error, "La collection n’a pas pu être enregistrée."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b px-5 py-4 pr-12">
        <SheetTitle className="text-lg">{collection ? "Modifier la collection" : "Nouvelle collection"}</SheetTitle>
        <SheetDescription>
          Une collection se remplit d’elle-même&nbsp;: chaque fichier qui répond à toutes ses règles y entre.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-8 p-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <PreviewPanel preview={preview} summary={summary} />

          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${formId}-name`}>Nom</Label>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  maxLength={COLLECTION_NAME_MAX}
                  aria-invalid={nameMissing || undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameMissing(false);
                    feedback.clear();
                  }}
                  placeholder="Clips Valorant du mois"
                  autoComplete="off"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${formId}-description`}>
                  Description <span className="font-normal text-muted-foreground">(facultative)</span>
                </Label>
                <Textarea
                  id={`${formId}-description`}
                  value={description}
                  maxLength={COLLECTION_DESCRIPTION_MAX}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  className="min-h-16 resize-y"
                />
              </div>
            </div>

            <Section title="Tags">
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun tag pour l’instant. Posez-en sur vos fichiers depuis la galerie, ou créez-les dans{" "}
                  <Link href="/organization/tags" className="font-medium text-foreground underline underline-offset-4">
                    Tags
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <TagRuleField
                    id={`${formId}-tags-all`}
                    label="Avec tous ces tags"
                    hint="Chaque fichier les porte tous"
                    value={draft.tagsAll}
                    onChange={(tagsAll) => update({ tagsAll })}
                    tags={tags}
                    taken={taken("tagsAll")}
                  />
                  <TagRuleField
                    id={`${formId}-tags-any`}
                    label="Avec au moins un de ces tags"
                    hint="Un seul suffit"
                    value={draft.tagsAny}
                    onChange={(tagsAny) => update({ tagsAny })}
                    tags={tags}
                    taken={taken("tagsAny")}
                  />
                  <TagRuleField
                    id={`${formId}-tags-none`}
                    label="Sans ces tags"
                    hint="Un fichier qui en porte un est écarté"
                    value={draft.tagsNone}
                    onChange={(tagsNone) => update({ tagsNone })}
                    tags={tags}
                    taken={taken("tagsNone")}
                  />
                </>
              )}
            </Section>

            <Section title="Fichiers">
              <Choice label="Types">
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  className="flex-wrap"
                  value={draft.kinds}
                  onValueChange={(kinds) => update({ kinds: kinds as FileKind[] })}
                  aria-label="Types de fichier"
                >
                  <ToggleGroupItem value="image" className={TOGGLE_ITEM}>Images</ToggleGroupItem>
                  <ToggleGroupItem value="video" className={TOGGLE_ITEM}>Vidéos</ToggleGroupItem>
                  <ToggleGroupItem value="file" className={TOGGLE_ITEM}>Autres fichiers</ToggleGroupItem>
                </ToggleGroup>
              </Choice>
              <TriChoice
                label="Favoris"
                value={draft.starred}
                onChange={(starred) => update({ starred })}
                only="Favoris seulement"
                exclude="Hors favoris"
              />
              <TriChoice
                label="Sécurisés"
                value={draft.secure}
                onChange={(secure) => update({ secure })}
                only="Sécurisés seulement"
                exclude="Hors sécurisés"
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`${formId}-search`}>Texte dans le nom du fichier</Label>
                <Input
                  id={`${formId}-search`}
                  value={draft.search}
                  onChange={(event) => update({ search: event.target.value })}
                  placeholder="facture"
                  autoComplete="off"
                />
              </div>
            </Section>

            <Section title="Période">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                className="flex-wrap"
                value={draft.periodMode}
                onValueChange={(value) => value && update({ periodMode: value as PeriodMode })}
                aria-label="Période"
              >
                <ToggleGroupItem value="any" className={TOGGLE_ITEM}>Toute la galerie</ToggleGroupItem>
                <ToggleGroupItem value="last" className={TOGGLE_ITEM}>Derniers jours</ToggleGroupItem>
                <ToggleGroupItem value="range" className={TOGGLE_ITEM}>Entre deux dates</ToggleGroupItem>
              </ToggleGroup>
              {draft.periodMode === "last" ? (
                <div className="flex min-w-0 items-center gap-2">
                  <Label htmlFor={`${formId}-days`} className="sr-only">
                    Nombre de jours
                  </Label>
                  <Input
                    id={`${formId}-days`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3650}
                    value={draft.lastDays}
                    onChange={(event) => update({ lastDays: event.target.value })}
                    className="w-24 tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">derniers jours</span>
                </div>
              ) : null}
              {draft.periodMode === "range" ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`${formId}-from`}>Du</Label>
                    <Input
                      id={`${formId}-from`}
                      type="date"
                      value={draft.from}
                      max={draft.to || undefined}
                      onChange={(event) => update({ from: event.target.value })}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`${formId}-to`}>Au</Label>
                    <Input
                      id={`${formId}-to`}
                      type="date"
                      value={draft.to}
                      min={draft.from || undefined}
                      onChange={(event) => update({ to: event.target.value })}
                    />
                  </div>
                </div>
              ) : null}
            </Section>

            <Section title="Ordre">
              <Choice label="Trier par">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  className="flex-wrap"
                  value={sort}
                  onValueChange={(value) => value && setSort(value as CollectionSort)}
                  aria-label="Trier par"
                >
                  {(Object.keys(SORT_LABELS) as CollectionSort[]).map((key) => (
                    <ToggleGroupItem key={key} value={key} className={TOGGLE_ITEM}>
                      {SORT_LABELS[key]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Choice>
              <Choice label="Sens">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  className="flex-wrap"
                  value={order}
                  onValueChange={(value) => value && setOrder(value as CollectionOrder)}
                  aria-label="Sens du tri"
                >
                  {(["desc", "asc"] as const).map((key) => (
                    <ToggleGroupItem key={key} value={key} className={TOGGLE_ITEM}>
                      {ORDER_LABELS[sort][key]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Choice>
            </Section>
          </div>
        </div>
      </div>

      <div className="border-t px-5 py-4">
        <FormStatus state={feedback.state} className="pb-3" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" loading={saving}>
            {collection ? "Enregistrer" : "Créer la collection"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Demande l'aperçu des règles, {@link PREVIEW_DELAY_MS} après leur dernier changement. */
function useRulesPreview(requestKey: string): PreviewState {
  const [preview, setPreview] = useState<PreviewState>({ status: "empty" });

  useEffect(() => {
    const { rules, sort, order } = JSON.parse(requestKey) as {
      rules: CollectionRules;
      sort: CollectionSort;
      order: CollectionOrder;
    };
    if (!hasAnyRule(rules)) {
      setPreview({ status: "empty" });
      return;
    }
    // Le résultat précédent reste affiché, atténué, pendant le calcul : le
    // panneau ne change pas de taille à chaque frappe.
    setPreview((current) =>
      current.status === "empty"
        ? { status: "loading", fileCount: null, cover: [] }
        : { ...current, status: "loading" },
    );
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewRules(rules, { sort, order, signal: controller.signal })
        .then((result) => setPreview({ status: "ready", ...result }))
        .catch(() => {
          if (controller.signal.aborted) return;
          setPreview((current) =>
            current.status === "empty"
              ? { status: "error", fileCount: null, cover: [] }
              : { ...current, status: "error" },
          );
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey]);

  return preview;
}

function PreviewPanel({ preview, summary }: { preview: PreviewState; summary: string }) {
  const empty = preview.status === "empty";
  const loading = preview.status === "loading";
  const fileCount = empty ? null : preview.fileCount;

  return (
    <section
      aria-label="Aperçu"
      aria-busy={loading || undefined}
      className="flex min-w-0 gap-4 self-start lg:sticky lg:top-0 lg:order-last lg:flex-col"
    >
      <CollectionCover
        files={empty ? [] : preview.cover}
        emptyLabel={empty ? "Aperçu" : "Aucun fichier"}
        className={cn("w-28 shrink-0 transition-opacity sm:w-36 lg:w-full", loading && "opacity-60")}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex h-8 min-w-0 items-center gap-2">
          <span
            data-testid="preview-count"
            className={cn("text-xl font-semibold tabular-nums transition-opacity", loading && "opacity-60")}
          >
            {fileCount === null ? "–" : fileCountLabel(fileCount)}
          </span>
          {loading ? <Spinner label="Calcul de l’aperçu" className="size-4 text-muted-foreground" /> : null}
        </div>
        {empty ? (
          <p className="text-sm text-muted-foreground">Ajoutez une règle pour voir les fichiers qu’elle retient.</p>
        ) : preview.status === "error" ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            L’aperçu n’a pas pu être calculé. Il reviendra à la prochaine modification.
          </p>
        ) : (
          <p className="text-sm break-words text-muted-foreground">{summary}</p>
        )}
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-3 text-base font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function TriChoice({
  label,
  value,
  onChange,
  only,
  exclude,
}: {
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
  only: string;
  exclude: string;
}) {
  return (
    <Choice label={label}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        value={value}
        onValueChange={(next) => next && onChange(next as TriState)}
        aria-label={label}
      >
        <ToggleGroupItem value="any" className={TOGGLE_ITEM}>Indifférent</ToggleGroupItem>
        <ToggleGroupItem value="only" className={TOGGLE_ITEM}>{only}</ToggleGroupItem>
        <ToggleGroupItem value="exclude" className={TOGGLE_ITEM}>{exclude}</ToggleGroupItem>
      </ToggleGroup>
    </Choice>
  );
}
