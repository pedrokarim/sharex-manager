"use client";

/**
 * Textes de publication d'un export (dossier 01 ter, § 4), par onglet :
 * le texte commun, puis un onglet par service. Dans l'onglet d'un service,
 * chaque champ montre la valeur héritée du texte commun ; la modifier crée
 * une variante pour ce service seulement (« Personnalisé pour Instagram –
 * revenir au texte commun »). Les compteurs mesurent le texte tel qu'il
 * partira (hashtags ajoutés selon la règle du service), comme le service le
 * compte.
 *
 * Le composant ne fait qu'afficher et modifier le jeu reçu : l'écran qui
 * l'utilise décide quand l'enregistrer.
 */

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, KeyRound, Loader2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LimitCounter, measureField } from "@/components/connections/publish-field-input";
import { ServiceLogo } from "@/components/connections/shared";
import { countText } from "@/lib/connections/limits";
import type { AccountSummary, ConnectorInfo, PublishField, TextCount } from "@/lib/connections/types";
import { cn } from "@/lib/utils";
import {
  HASHTAG_RULE_LABELS,
  SERVICE_TEXT_RULES,
  checkPostTexts,
  cleanHashtags,
  fieldValuesFor,
  firstCommentFor,
  measureTags,
  type PostRules,
  type PostTextProblem,
} from "../lib/post-texts";
import { POST_TEXT_FIELDS, type ExportPost, type PostTextField, type PostTexts } from "../lib/post-types";
import { isCustomized, markReviewed, resetPostField, reviewKey, setPostField, textsOf } from "../lib/export-screens";

/** Un service visé, avec ce qu'il faut pour mesurer ses textes. */
export interface ServiceTarget {
  connector: ConnectorInfo;
  /** Champs du service qui valent pour une vidéo. */
  fields: PublishField[];
  rules: PostRules;
  /**
   * Comptes cochés de ce service qui ne peuvent pas encore commenter mais
   * peuvent l'obtenir : le premier commentaire propose « Autoriser… ».
   */
  commentAuthorize?: { account: AccountSummary; href: string }[];
  /** Aucun compte coché de ce service ne peut poser le premier commentaire. */
  commentBlocked?: boolean;
}

export const KIND_LABELS: Record<PostTextField, string> = {
  title: "Titre",
  description: "Description",
  caption: "Texte court",
  firstComment: "Premier commentaire",
  hashtags: "Hashtags",
  tags: "Tags cachés",
};

const KIND_HELP: Record<PostTextField, string> = {
  title: "Titre de la vidéo.",
  description: "Texte long sous la vidéo : liens, crédits, chapitres.",
  caption: "Affiché avec la vidéo dans un fil : légende, message.",
  firstComment: "Posé par le compte juste après la publication.",
  hashtags: "Mots-dièse visibles, sans « # ».",
  tags: "Mots-clés cachés, pour la recherche.",
};

const roleOf = (field: PublishField) => field.role as string | undefined;

/** Mesure des textes d'un service : la sienne, sinon celle des règles connues. */
export function textCountOf(connector: ConnectorInfo): TextCount | undefined {
  return connector.limits?.text?.count ?? SERVICE_TEXT_RULES[connector.id]?.count;
}

/** Les sortes de textes qu'un service publie. */
export function serviceKinds(target: ServiceTarget): PostTextField[] {
  const roles = new Set(target.fields.map(roleOf));
  return POST_TEXT_FIELDS.filter((kind) => {
    switch (kind) {
      case "firstComment":
        return roles.has("firstComment") || Boolean(target.connector.followUps?.comment);
      case "hashtags":
        return (target.rules.hashtagRule ?? "none") !== "none";
      default:
        return roles.has(kind);
    }
  });
}

/** Le champ du service où atterrit une sorte de texte. */
function fieldFor(fields: PublishField[], kind: PostTextField): PublishField | undefined {
  const byRole = (role: string) => fields.find((field) => roleOf(field) === role);
  if (kind === "caption") return byRole("caption") ?? byRole("description");
  if (kind === "description") return byRole("description") ?? byRole("caption");
  return byRole(kind);
}

interface Measure {
  used: number;
  max: number;
  unit?: "chars" | "bytes";
  label?: string;
}

/** Mesure d'une sorte de texte telle qu'elle partira chez un service ; `null` s'il n'a pas de limite. */
export function measureKind(target: ServiceTarget, texts: PostTexts, kind: PostTextField, values?: Record<string, unknown>): Measure | null {
  const count = textCountOf(target.connector);
  if (kind === "firstComment") {
    const comment = target.connector.followUps?.comment;
    const field = fieldFor(target.fields, "firstComment");
    const text = firstCommentFor(texts, target.rules);
    if (field) return measureField(field, text, count);
    return comment ? { used: countText(text, comment.count ?? count ?? "characters"), max: comment.maxLength } : null;
  }
  if (kind === "hashtags") {
    const max = target.rules.maxHashtags;
    return max !== undefined ? { used: cleanHashtags(texts.hashtags).length, max, label: "hashtags" } : null;
  }
  if (kind === "tags") {
    const field = fieldFor(target.fields, "tags");
    return field?.kind === "tags" ? { used: measureTags(texts.tags, SERVICE_TEXT_RULES[target.connector.id]?.quotedTags), max: field.maxTotal } : null;
  }
  const field = fieldFor(target.fields, kind);
  if (!field) return null;
  const resolved = values ?? fieldValuesFor(target.fields, texts, target.rules);
  const text = resolved[field.key];
  return measureField(field, typeof text === "string" ? text : "", count);
}

/** Dépassements d'un service pour un jeu : ceux des champs, plus le premier commentaire. */
export function serviceProblems(target: ServiceTarget, post: ExportPost): PostTextProblem[] {
  const texts = textsOf(post, target.connector.id);
  const values = fieldValuesFor(target.fields, texts, target.rules);
  const problems = checkPostTexts(target.fields, values, { connectorId: target.connector.id, count: textCountOf(target.connector) });
  const comment = measureKind(target, texts, "firstComment", values);
  if (comment && comment.used > comment.max && !fieldFor(target.fields, "firstComment")) {
    problems.push({ field: "firstComment", message: `Premier commentaire : ${comment.used.toLocaleString("fr-FR")} caractères, ${comment.max.toLocaleString("fr-FR")} au plus.` });
  }
  return problems;
}

export function PostTextsEditor({
  post,
  onChange,
  services,
  showBase,
  tab,
  onTabChange,
  regenerating,
  onRegenerate,
  disabled,
  idPrefix,
}: {
  post: ExportPost;
  onChange: (post: ExportPost) => void;
  services: ServiceTarget[];
  /** Onglet « Texte commun » en tête (fiche d'un export). */
  showBase: boolean;
  tab?: string;
  onTabChange?: (tab: string) => void;
  /** Champs en cours de rédaction par l'assistant (`base.title`…). */
  regenerating?: Set<string>;
  /** « Régénérer ce champ » ; absent : pas de bouton. */
  onRegenerate?: (connectorId: string | null, field: PostTextField) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const problems = useMemo(() => Object.fromEntries(services.map((service) => [service.connector.id, serviceProblems(service, post)])), [services, post]);
  const first = showBase ? "base" : (services[0]?.connector.id ?? "base");
  const active = tab && (tab === "base" ? showBase : services.some((service) => service.connector.id === tab)) ? tab : first;

  if (!showBase && services.length === 0) {
    return <p className="text-sm text-muted-foreground">Cochez au moins un compte : ses textes s’affichent ici, service par service.</p>;
  }

  return (
    <Tabs value={active} onValueChange={onTabChange} className="min-w-0 gap-4">
      {/* Onglets sur plusieurs lignes : hauteur fixe, sinon la hauteur en pourcentage des onglets s'étire et ils passent sur les champs. */}
      <TabsList className="h-auto w-full min-w-0 flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto *:data-[slot=tabs-trigger]:h-7.5">
        {showBase ? (
          <TabsTrigger value="base" className="min-w-0 flex-none px-3">
            Texte commun
          </TabsTrigger>
        ) : null}
        {services.map((service) => {
          const count = problems[service.connector.id]?.length ?? 0;
          return (
            <TabsTrigger key={service.connector.id} value={service.connector.id} className="min-w-0 flex-none gap-1.5 px-3">
              <ServiceLogo logo={service.connector.logo} />
              <span className="min-w-0 truncate">{service.connector.label}</span>
              {count > 0 ? <CircleAlert className="size-3.5 text-destructive" aria-label={`${count} point${count > 1 ? "s" : ""} à régler`} /> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {showBase ? (
        <TabsContent value="base" className="grid min-w-0 gap-5">
          {POST_TEXT_FIELDS.map((kind) => (
            <TextField
              key={kind}
              id={`${idPrefix}-base-${kind}`}
              kind={kind}
              texts={post.base}
              onValue={(value) => onChange(setPostField(post, null, kind, value as never))}
              unreviewed={(post.unreviewed ?? []).includes(reviewKey(null, kind))}
              onReviewed={() => onChange(markReviewed(post, reviewKey(null, kind)))}
              regenerating={regenerating?.has(reviewKey(null, kind))}
              onRegenerate={onRegenerate ? () => onRegenerate(null, kind) : undefined}
              disabled={disabled}
              footer={<ServiceCounters services={services} post={post} kind={kind} />}
            />
          ))}
        </TabsContent>
      ) : null}

      {services.map((service) => {
        const id = service.connector.id;
        const texts = textsOf(post, id);
        const values = fieldValuesFor(service.fields, texts, service.rules);
        const kinds = serviceKinds(service);
        const list = problems[id] ?? [];
        return (
          <TabsContent key={id} value={id} className="grid min-w-0 gap-5">
            <AnimatePresence initial={false}>
              {list.length > 0 ? (
                <motion.ul key="problems" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid min-w-0 gap-1 overflow-hidden" aria-label="Points à régler">
                  {list.map((problem) => (
                    <li key={`${problem.field}-${problem.message}`} className="flex min-w-0 items-start gap-1.5 text-xs text-destructive">
                      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{problem.message}</span>
                    </li>
                  ))}
                </motion.ul>
              ) : null}
            </AnimatePresence>
            {kinds.length === 0 ? <p className="text-sm text-muted-foreground">{service.connector.label} ne prend aucun texte avec une vidéo.</p> : null}
            {kinds.map((kind) => {
              const customized = isCustomized(post, id, kind);
              const commentOff = kind === "firstComment" && service.commentBlocked;
              return (
                <TextField
                  key={kind}
                  id={`${idPrefix}-${id}-${kind}`}
                  kind={kind}
                  texts={texts}
                  onValue={(value) => onChange(setPostField(post, id, kind, value as never))}
                  measure={measureKind(service, texts, kind, values)}
                  help={kind === "hashtags" ? `${HASHTAG_RULE_LABELS[service.rules.hashtagRule ?? "none"]}.` : undefined}
                  unreviewed={(post.unreviewed ?? []).includes(reviewKey(id, kind))}
                  onReviewed={() => onChange(markReviewed(post, reviewKey(id, kind)))}
                  regenerating={regenerating?.has(reviewKey(id, kind))}
                  onRegenerate={onRegenerate ? () => onRegenerate(id, kind) : undefined}
                  disabled={disabled || commentOff}
                  footer={
                    <div className="grid min-w-0 gap-1">
                      {customized ? (
                        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span>Personnalisé pour {service.connector.label}</span>
                          <span aria-hidden>–</span>
                          <Button type="button" variant="link" size="sm" className="h-auto gap-1 p-0 text-xs" disabled={disabled} onClick={() => onChange(resetPostField(post, id, kind))}>
                            <Undo2 className="size-3" />
                            revenir au texte commun
                          </Button>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Texte commun : le modifier ici crée une variante pour {service.connector.label}.</p>
                      )}
                      {kind === "firstComment" && (service.commentAuthorize?.length || service.commentBlocked) ? (
                        <CommentAccess service={service} />
                      ) : null}
                    </div>
                  }
                />
              );
            })}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

/** Compteurs d'une sorte de texte, service par service (onglet du texte commun). */
function ServiceCounters({ services, post, kind }: { services: ServiceTarget[]; post: ExportPost; kind: PostTextField }) {
  const rows = services.flatMap((service) => {
    if (!serviceKinds(service).includes(kind)) return [];
    const measure = measureKind(service, textsOf(post, service.connector.id), kind);
    return [{ service, measure, custom: isCustomized(post, service.connector.id, kind) }];
  });
  if (rows.length === 0) return null;
  return (
    <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1" aria-label="Par service">
      {rows.map(({ service, measure, custom }) => (
        <li key={service.connector.id} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center">
                <ServiceLogo logo={service.connector.logo} className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{service.connector.label}</TooltipContent>
          </Tooltip>
          {custom ? <span>personnalisé</span> : measure ? <LimitCounter used={measure.used} max={measure.max} unit={measure.unit} /> : <span>sans limite</span>}
        </li>
      ))}
    </ul>
  );
}

/** Premier commentaire : comptes qui n'ont pas encore la permission, avec « Autoriser… ». */
function CommentAccess({ service }: { service: ServiceTarget }) {
  return (
    <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
      {service.commentBlocked && !service.commentAuthorize?.length ? <p className="text-pretty">Aucun compte coché ne peut commenter chez {service.connector.label}.</p> : null}
      {(service.commentAuthorize ?? []).map(({ account, href }) => (
        <p key={account.id} className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          {/* La phrase passe à la ligne : coupée, elle perdrait sa fin, qui dit ce qui manque. */}
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="text-foreground">{account.displayName}</span> n’a pas encore autorisé les commentaires
          </span>
          <a href={href} className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline underline-offset-2">
            <KeyRound className="size-3" />
            Autoriser les commentaires…
          </a>
        </p>
      ))}
    </div>
  );
}

function TextField({
  id,
  kind,
  texts,
  onValue,
  measure,
  help,
  unreviewed,
  onReviewed,
  regenerating,
  onRegenerate,
  disabled,
  footer,
}: {
  id: string;
  kind: PostTextField;
  texts: PostTexts;
  onValue: (value: string | string[]) => void;
  measure?: Measure | null;
  help?: string;
  unreviewed?: boolean;
  onReviewed: () => void;
  regenerating?: boolean;
  onRegenerate?: () => void;
  disabled?: boolean;
  footer?: React.ReactNode;
}) {
  const value = texts[kind];
  const over = Boolean(measure && measure.used > measure.max);
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Label htmlFor={id}>{KIND_LABELS[kind]}</Label>
          {unreviewed ? (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
              <Sparkles className="size-3" />à relire
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {unreviewed ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReviewed} disabled={disabled}>
              Relu
            </Button>
          ) : null}
          {onRegenerate ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onRegenerate} disabled={disabled || regenerating} aria-label={`Rédiger à nouveau : ${KIND_LABELS[kind].toLowerCase()}`}>
                  {regenerating ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rédiger à nouveau avec l’assistant</TooltipContent>
            </Tooltip>
          ) : null}
          {measure ? (
            measure.label ? (
              <span className={cn("text-xs text-muted-foreground tabular-nums", over && "font-medium text-destructive")}>
                {measure.used}/{measure.max} {measure.label}
              </span>
            ) : (
              <LimitCounter used={measure.used} max={measure.max} unit={measure.unit} />
            )
          ) : null}
        </div>
      </div>
      {kind === "hashtags" || kind === "tags" ? (
        <TagInput
          id={id}
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onValue(next)}
          disabled={disabled}
          placeholder="Entrée ou virgule pour ajouter"
          normalize={(tag) => (kind === "hashtags" ? tag.replace(/^#+/, "").replace(/\s+/g, "") : tag.replace(/\s+/g, " ").trim())}
        />
      ) : kind === "title" ? (
        <Input id={id} value={String(value ?? "")} onChange={(event) => onValue(event.target.value)} disabled={disabled} aria-invalid={over || undefined} />
      ) : (
        <Textarea
          id={id}
          value={String(value ?? "")}
          onChange={(event) => onValue(event.target.value)}
          disabled={disabled}
          aria-invalid={over || undefined}
          rows={kind === "description" ? 7 : 3}
          className="max-h-96 min-h-20 [overflow-wrap:anywhere]"
        />
      )}
      <p className="text-xs text-pretty text-muted-foreground">{help ? `${KIND_HELP[kind]} ${help}` : KIND_HELP[kind]}</p>
      {footer}
    </div>
  );
}
