"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { BrandLogo, isBrand } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { CharacterCount } from "@/components/ui/character-count";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagInput } from "@/components/ui/tag-input";
import { TemplateInput, type TemplateVariable } from "@/components/ui/template-input";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_COUNTRIES, countryLabel, languageLabel } from "@/lib/connections/profile";
import { cn } from "@/lib/utils";
import { renderTemplate, type TemplateVariables } from "@/lib/connections/templates";
import type { PublishField } from "@/lib/connections/types";
import { HASHTAG_RULE_LABELS, appendHashtags, fieldValuesFor, firstCommentFor, postFromBrand, resolvePostTexts } from "@/modules/clip-studio/lib/post-texts";
import { api, type PublishService } from "../../lib/client";
import { KIT_LIMITS, type BrandKit, type BrandPublishing, type BrandServiceTemplates, type HashtagRule } from "../../lib/types";
import { cleanLinkUrl } from "../../lib/validate";
import { Field, FieldGroup } from "../fields";

type TemplateKey = "titleTemplate" | "descriptionTemplate" | "captionTemplate" | "firstCommentTemplate";
type TextRoleName = "title" | "description" | "caption" | "firstComment";

/** Les quatre modèles, dans l'ordre où on les lit sous une vidéo. */
const TEXT_KINDS: { key: TemplateKey; role: TextRoleName; label: string; hint?: string; rows?: number; max: number; placeholder?: string }[] = [
  { key: "titleTemplate", role: "title", label: "Titre", max: KIT_LIMITS.titleTemplate, placeholder: "{title}" },
  { key: "descriptionTemplate", role: "description", label: "Description", hint: "Texte long sous la vidéo : résumé, liens, crédits.", rows: 5, max: KIT_LIMITS.descriptionTemplate },
  { key: "captionTemplate", role: "caption", label: "Légende", hint: "Texte court affiché avec le média dans un fil : légende Instagram, texte Threads.", rows: 3, max: KIT_LIMITS.captionTemplate },
  {
    key: "firstCommentTemplate",
    role: "firstComment",
    label: "Premier commentaire",
    hint: "Posté juste après la publication, là où le service le permet. Vide : aucun commentaire.",
    rows: 3,
    max: KIT_LIMITS.firstCommentTemplate,
  },
];

const SAMPLE_TITLE = "Top 5 des sorties de la semaine";
const SAMPLE_HOOK = "Trois annonces que personne n’attendait";
const SAMPLE_SUMMARY = "Cinq sorties à ne pas manquer cette semaine, de la plus attendue à la plus surprenante.";
const SAMPLE_CREDIT = "« Sunrise » par Artiste, CC BY 4.0";

/** Variables d'exemple de l'aperçu : celles de la marque quand elle les a, sinon des valeurs parlantes. */
function sampleVariables(kit: BrandKit): TemplateVariables {
  const publishing = kit.publishing;
  return {
    title: SAMPLE_TITLE,
    hook: kit.tagline || SAMPLE_HOOK,
    summary: SAMPLE_SUMMARY,
    cta: kit.endCard.callToAction || "",
    tags: publishing.tags,
    hashtags: publishing.hashtags,
    links: publishing.links.filter((link) => cleanLinkUrl(link.url)),
    credits: [SAMPLE_CREDIT],
    brand: kit.name,
    language: kit.language,
  };
}

function templateVariables(kit: BrandKit, sample: TemplateVariables): TemplateVariable[] {
  const firstLink = sample.links?.[0];
  return [
    { name: "title", label: "Titre du clip", sample: SAMPLE_TITLE },
    { name: "hook", label: "Accroche de la marque", sample: sample.hook ?? "" },
    { name: "summary", label: "Résumé du clip", sample: SAMPLE_SUMMARY },
    { name: "cta", label: "Appel à l’action du carton de fin", sample: kit.endCard.callToAction || "Abonne-toi" },
    { name: "hashtags", label: "Hashtags en mots-dièse", sample: kit.publishing.hashtags.map((tag) => `#${tag}`).join(" ") || "#anime" },
    { name: "tags", label: "Tags en mots-dièse", sample: kit.publishing.tags.map((tag) => `#${tag.replace(/[#\s]+/g, "")}`).join(" ") || "#anime" },
    { name: "links", label: "Liens, un par ligne", sample: firstLink ? `${firstLink.label} : ${firstLink.url}` : "Site : https://exemple.fr" },
    { name: "credits", label: "Crédits du clip", sample: `Crédits : – ${SAMPLE_CREDIT}` },
    { name: "date", label: "Date du jour", sample: new Date().toLocaleDateString(kit.language || "fr") },
    { name: "brand", label: "Nom de la marque", sample: kit.name },
  ];
}

/** Rôle de texte qu'un service accepte, et sa limite. */
function serviceKinds(service: PublishService): { role: TextRoleName; field?: PublishField; limit?: { max: number; unit?: "chars" | "bytes" } }[] {
  const out: { role: TextRoleName; field?: PublishField; limit?: { max: number; unit?: "chars" | "bytes" } }[] = [];
  for (const kind of TEXT_KINDS) {
    if (kind.role === "firstComment") {
      if (service.comment) out.push({ role: kind.role, limit: { max: service.comment.maxLength } });
      continue;
    }
    const field = service.fields.find((entry) => entry.role === kind.role && (entry.kind === "text" || entry.kind === "textarea"));
    if (!field || (field.kind !== "text" && field.kind !== "textarea")) continue;
    out.push({ role: kind.role, field, limit: field.maxBytes ? { max: field.maxBytes, unit: "bytes" } : { max: field.maxLength } });
  }
  return out;
}

/** Règles des hashtags qui ont un sens pour ce service. */
function rulesFor(service: PublishService): HashtagRule[] {
  const roles = new Set(service.fields.map((field) => field.role as string | undefined));
  const rules: HashtagRule[] = [];
  if (roles.has("hashtags")) rules.push("field");
  if (roles.has("topic")) rules.push("topic");
  if (roles.has("caption")) rules.push("caption");
  if (roles.has("description")) rules.push("description");
  if (service.comment) rules.push("firstComment");
  rules.push("none");
  return rules;
}

// ─── Textes de publication ───────────────────────────────────────

export function PostTemplatesGroup({ kit, setPublishing }: { kit: BrandKit; setPublishing: (patch: Partial<BrandPublishing>) => void }) {
  const [services, setServices] = useState<PublishService[] | null>(null);
  const [tab, setTab] = useState("common");
  const publishing = kit.publishing;

  useEffect(() => {
    let cancelled = false;
    // Sans service prêt (ou sans droit de les lire), seul l'onglet « Commun » reste : rien ne casse.
    api.listPublishServices().then(
      (list) => !cancelled && setServices(list),
      () => !cancelled && setServices([])
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const sample = useMemo(() => sampleVariables(kit), [kit]);
  const variables = useMemo(() => templateVariables(kit, sample), [kit, sample]);
  const render = useMemo(() => (template: string) => renderTemplate(template, sample), [sample]);

  const setServiceTemplates = (connectorId: string, patch: Partial<BrandServiceTemplates>, remove: (keyof BrandServiceTemplates)[] = []) => {
    const current = { ...(publishing.serviceTemplates[connectorId] ?? {}), ...patch };
    for (const key of remove) delete current[key];
    const next = { ...publishing.serviceTemplates };
    if (Object.keys(current).length > 0) next[connectorId] = current;
    else delete next[connectorId];
    setPublishing({ serviceTemplates: next });
  };

  return (
    <FieldGroup
      title="Textes de publication"
      text="Ils préremplissent les textes de chaque export. Cliquez une variable pour l’insérer au curseur ; une variable vide disparaît avec sa ligne."
    >
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
        {/* Onglets sur plusieurs lignes : hauteur fixe, sinon la hauteur en pourcentage des onglets s'étire et ils passent sur les champs. */}
        <TabsList className="h-auto w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
          <TabsTrigger value="common" className="flex-none">
            Commun
          </TabsTrigger>
          {services === null ? (
            <Skeleton className="mx-1 h-6 w-24" aria-hidden />
          ) : (
            services.map((service) => {
              const custom = Boolean(publishing.serviceTemplates[service.id]);
              return (
                <TabsTrigger key={service.id} value={service.id} className="max-w-full min-w-0 flex-none">
                  {isBrand(service.logo) && <BrandLogo brand={service.logo} className="size-3.5" />}
                  <span className="truncate">{service.label}</span>
                  {custom && (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Modèles propres à ce service">
                      <span className="sr-only">, personnalisé</span>
                    </span>
                  )}
                </TabsTrigger>
              );
            })
          )}
        </TabsList>

        <TabsContent value="common" className="grid min-w-0 gap-4">
          {TEXT_KINDS.map((kind) => (
            <Field key={kind.key} label={kind.label} htmlFor={`kit-${kind.key}`} hint={kind.hint}>
              <TemplateInput
                id={`kit-${kind.key}`}
                multiline={kind.role !== "title"}
                rows={kind.rows}
                value={publishing[kind.key]}
                onChange={(value) => setPublishing({ [kind.key]: value } as Partial<BrandPublishing>)}
                variables={variables}
                render={render}
                maxLength={kind.max}
                placeholder={kind.placeholder}
              />
            </Field>
          ))}
        </TabsContent>

        {(services ?? []).map((service) => (
          <TabsContent key={service.id} value={service.id} className="grid min-w-0 gap-4">
            <ServiceTemplates
              kit={kit}
              service={service}
              variables={variables}
              render={render}
              sample={sample}
              onChange={(patch, remove) => setServiceTemplates(service.id, patch, remove)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </FieldGroup>
  );
}

/** Onglet d'un service : chaque texte reprend le modèle commun ou a le sien, avec l'aperçu tel qu'il partira. */
function ServiceTemplates({
  kit,
  service,
  variables,
  render,
  sample,
  onChange,
}: {
  kit: BrandKit;
  service: PublishService;
  variables: TemplateVariable[];
  render: (template: string) => string;
  sample: TemplateVariables;
  onChange: (patch: Partial<BrandServiceTemplates>, remove?: (keyof BrandServiceTemplates)[]) => void;
}) {
  const own = kit.publishing.serviceTemplates[service.id] ?? {};
  const kinds = serviceKinds(service);
  const rules = rulesFor(service);
  const rule = own.hashtagRule && rules.includes(own.hashtagRule) ? own.hashtagRule : undefined;

  // Ce qui partira chez ce service : la même résolution que la publication, avec les valeurs d'exemple.
  const published = useMemo(() => {
    const post = postFromBrand(kit.publishing, sample);
    const texts = resolvePostTexts(post, service.id);
    const rules = { hashtagRule: rule ?? service.defaultHashtagRule };
    const values = fieldValuesFor(service.fields, texts, rules);
    const byRole = (role: string) => {
      const field = service.fields.find((entry) => entry.role === role);
      const value = field ? values[field.key] : undefined;
      return typeof value === "string" ? value : "";
    };
    // Hashtags « dans leur champ » : le service les ajoute lui-même en fin de légende (Instagram).
    const caption = rules.hashtagRule === "field" ? appendHashtags(byRole("caption"), texts.hashtags) : byRole("caption");
    return {
      title: byRole("title"),
      description: byRole("description"),
      caption,
      firstComment: firstCommentFor(texts, rules),
    } satisfies Record<TextRoleName, string>;
  }, [kit.publishing, sample, service, rule]);

  if (kinds.length === 0) {
    return <p className="text-sm text-muted-foreground">{service.label} ne prend aucun texte pour une vidéo.</p>;
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Chaque texte reprend le modèle commun tant que vous ne le personnalisez pas pour {service.label}. L’aperçu montre le texte tel qu’il partira, hashtags compris.
      </p>
      {kinds.map(({ role, limit }) => {
        const kind = TEXT_KINDS.find((entry) => entry.role === role)!;
        const custom = typeof own[kind.key] === "string";
        const preview = published[role];
        const id = `kit-${service.id}-${kind.key}`;
        return (
          <div key={role} className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <label htmlFor={custom ? id : undefined} className="min-w-0 text-xs font-medium">
                {kind.label}
                <span className="font-normal text-muted-foreground"> · {custom ? `propre à ${service.label}` : "modèle commun"}</span>
              </label>
              {custom ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => onChange({}, [kind.key])}>
                  <RotateCcw aria-hidden />
                  Reprendre le modèle commun
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="xs" onClick={() => onChange({ [kind.key]: kit.publishing[kind.key] })}>
                  Personnaliser
                </Button>
              )}
            </div>
            {custom && (
              <TemplateInput
                id={id}
                multiline={role !== "title"}
                rows={kind.rows}
                value={own[kind.key] ?? ""}
                onChange={(value) => onChange({ [kind.key]: value })}
                variables={variables}
                render={render}
                maxLength={kind.max}
                preview={false}
              />
            )}
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">Aperçu sur {service.label}</span>
                {limit && <CharacterCount value={preview} max={limit.max} unit={limit.unit} />}
              </div>
              <p
                className={cn(
                  "max-h-40 min-h-9 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-sm break-words whitespace-pre-wrap",
                  !preview.trim() && "text-muted-foreground italic"
                )}
              >
                {preview.trim() ? preview : role === "firstComment" ? "Aucun commentaire" : "Vide"}
              </p>
            </div>
          </div>
        );
      })}
      <Field label="Hashtags sur ce service" htmlFor={`kit-${service.id}-hashtags`}>
        <Select
          value={rule ?? "default"}
          onValueChange={(value) => (value === "default" ? onChange({}, ["hashtagRule"]) : onChange({ hashtagRule: value as HashtagRule }))}
        >
          <SelectTrigger id={`kit-${service.id}-hashtags`} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Par défaut : {HASHTAG_RULE_LABELS[service.defaultHashtagRule].toLocaleLowerCase("fr")}</SelectItem>
            {rules
              .filter((entry) => entry !== service.defaultHashtagRule)
              .map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {HASHTAG_RULE_LABELS[entry]}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

// ─── Profil des comptes ──────────────────────────────────────────

/** Variables qui ont un sens pour un profil : rien de propre à un clip (titre, résumé, crédits). */
const PROFILE_VARIABLES = new Set(["hook", "cta", "hashtags", "tags", "links", "date", "brand"]);

/**
 * Ce que la marque apporte au profil des comptes connectés (onglet « Chaîne
 * / Profil » d'un compte) : description de la chaîne, bio courte, pays. Les
 * mots-clés reprennent les tags, la langue celle de la marque.
 */
export function ProfileTextsGroup({ kit, setPublishing }: { kit: BrandKit; setPublishing: (patch: Partial<BrandPublishing>) => void }) {
  const publishing = kit.publishing;
  const sample = useMemo(() => ({ ...sampleVariables(kit), title: "", summary: "", credits: [] }), [kit]);
  const variables = useMemo(() => templateVariables(kit, sample).filter((variable) => PROFILE_VARIABLES.has(variable.name)), [kit, sample]);
  const render = useMemo(() => (template: string) => renderTemplate(template, sample), [sample]);
  const countries = useMemo(() => PROFILE_COUNTRIES.map((code) => ({ code, label: countryLabel(code) })).sort((a, b) => a.label.localeCompare(b.label, "fr")), []);

  return (
    <FieldGroup
      title="Profil des comptes"
      text="Préremplit l’onglet « Chaîne / Profil » de chaque compte connecté : ce que le service permet part de là, le reste se copie en un clic."
    >
      <Field label="Description de la chaîne" htmlFor="kit-channel-description" hint="YouTube en accepte 1 000 caractères. Les mots-clés de la chaîne reprennent les tags.">
        <TemplateInput
          id="kit-channel-description"
          multiline
          rows={4}
          value={publishing.channelDescriptionTemplate}
          onChange={(channelDescriptionTemplate) => setPublishing({ channelDescriptionTemplate })}
          variables={variables}
          render={render}
          maxLength={KIT_LIMITS.channelDescriptionTemplate}
          limit={{ max: 1000 }}
        />
      </Field>
      <Field label="Bio courte" htmlFor="kit-bio" hint="Instagram, Threads, Description de la Page Facebook (100 caractères là-bas).">
        <div className="grid min-w-0 gap-1">
          <Textarea
            id="kit-bio"
            rows={3}
            value={publishing.bio}
            maxLength={KIT_LIMITS.bio}
            onChange={(event) => setPublishing({ bio: event.target.value })}
            placeholder={kit.tagline || "Une phrase qui dit qui vous êtes."}
            className="min-w-0 resize-y"
          />
          <div className="flex justify-end">
            <CharacterCount value={publishing.bio} max={KIT_LIMITS.bio} />
          </div>
        </div>
      </Field>
      <Field label="Pays" htmlFor="kit-country" hint={`Langue du profil : celle de la marque (${languageLabel(kit.language)}).`}>
        <Select value={publishing.country || "none"} onValueChange={(value) => setPublishing({ country: value === "none" ? "" : value })}>
          <SelectTrigger id="kit-country" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="none">Aucun</SelectItem>
            {countries.map((country) => (
              <SelectItem key={country.code} value={country.code}>
                {country.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

// ─── Mots-dièse, tags et liens ───────────────────────────────────

export function HashtagsLinksGroup({ kit, setPublishing }: { kit: BrandKit; setPublishing: (patch: Partial<BrandPublishing>) => void }) {
  const publishing = kit.publishing;
  const links = publishing.links;
  const setLink = (index: number, patch: Partial<{ label: string; url: string }>) =>
    setPublishing({ links: links.map((link, position) => (position === index ? { ...link, ...patch } : link)) });

  return (
    <FieldGroup title="Mots-dièse, tags et liens" text="Écrits une fois, repris par les variables {hashtags}, {tags} et {links}.">
      <Field label="Hashtags" htmlFor="kit-hashtags" hint="Visibles : ajoutés aux textes selon la règle de chaque service. Sans « # ».">
        <TagInput
          id="kit-hashtags"
          value={publishing.hashtags}
          onChange={(hashtags) => setPublishing({ hashtags })}
          max={KIT_LIMITS.hashtags}
          maxTagLength={KIT_LIMITS.tag}
          normalize={(tag) => tag.replace(/^#+/, "").replace(/[\s#]+/g, "")}
          showCount
          placeholder="anime, jeuvidéo…"
        />
      </Field>
      <Field label="Tags" htmlFor="kit-tags" hint="Cachés : mots-clés de recherche de YouTube. Entrée ou virgule pour ajouter.">
        <TagInput
          id="kit-tags"
          value={publishing.tags}
          onChange={(tags) => setPublishing({ tags })}
          max={KIT_LIMITS.tags}
          maxTagLength={KIT_LIMITS.tag}
          showCount
          placeholder="anime, jeu vidéo…"
        />
      </Field>
      <div className="grid min-w-0 gap-1.5">
        <span className="text-xs font-medium">Liens</span>
        {links.length === 0 && <p className="text-xs text-muted-foreground">Aucun lien : la variable {"{links}"} reste vide et sa ligne disparaît.</p>}
        <ul className="grid min-w-0 gap-2">
          {links.map((link, index) => {
            const invalid = link.url.trim() !== "" && !cleanLinkUrl(link.url);
            const errorId = `kit-link-${index}-error`;
            return (
              <li key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5 @md/form:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
                <Input
                  aria-label={`Libellé du lien ${index + 1}`}
                  value={link.label}
                  maxLength={KIT_LIMITS.linkLabel}
                  placeholder="Site, Discord…"
                  onChange={(event) => setLink(index, { label: event.target.value })}
                  className="col-span-2 min-w-0 @md/form:col-span-1"
                />
                <Input
                  aria-label={`Adresse du lien ${index + 1}`}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errorId : undefined}
                  type="url"
                  inputMode="url"
                  value={link.url}
                  maxLength={KIT_LIMITS.linkUrl}
                  placeholder="https://…"
                  onChange={(event) => setLink(index, { url: event.target.value })}
                  className="min-w-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Retirer le lien ${index + 1}`}
                  onClick={() => setPublishing({ links: links.filter((_, position) => position !== index) })}
                >
                  <X aria-hidden />
                </Button>
                {invalid && (
                  <p id={errorId} className="col-span-full text-xs text-destructive">
                    Adresse complète en http:// ou https:// attendue : celle-ci ne sera pas enregistrée.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {links.length < KIT_LIMITS.links && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPublishing({ links: [...links, { label: "", url: "" }] })}>
              <Plus aria-hidden />
              Ajouter un lien
            </Button>
          </div>
        )}
      </div>
    </FieldGroup>
  );
}
