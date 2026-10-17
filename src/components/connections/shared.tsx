"use client";

/**
 * Petites pièces communes aux écrans des comptes connectés (page
 * d'administration, parcours de connexion, publication depuis un module).
 * Elles ne connaissent aucun service : tout vient de la description des
 * connecteurs.
 */

import { useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { BrandLogo, isBrand } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CAPABILITY_LABELS, type AccountSummary, type ConnectionCapability, type ConnectorInfo } from "@/lib/connections/types";

// ─── Logos et avatars ─────────────────────────────────────────────

/** Logo officiel du service ; un service sans logo connu garde une icône neutre plutôt qu'un vide. */
export function ServiceLogo({ logo, className }: { logo: string; className?: string }) {
  return isBrand(logo) ? <BrandLogo brand={logo} className={cn("size-4 shrink-0", className)} /> : <Link2 aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}

/**
 * Avatar du compte, avec le logo de son service en pastille : deux chaînes de
 * deux services différents ne se confondent pas.
 */
export function AccountAvatar({
  account,
  className,
  withService = false,
}: {
  account: Pick<AccountSummary, "avatarUrl" | "displayName"> & Partial<Pick<AccountSummary, "logo">>;
  className?: string;
  withService?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initial = account.displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={cn("relative inline-flex size-9 shrink-0", className)}>
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-foreground">
        {account.avatarUrl && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar servi par le service, sans intérêt pour next/image
          <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(true)} />
        ) : (
          initial
        )}
      </span>
      {withService && account.logo ? (
        <span className="absolute -right-1 -bottom-1 flex rounded-full bg-background p-0.5 shadow-xs">
          <ServiceLogo logo={account.logo} className="size-3.5" />
        </span>
      ) : null}
    </span>
  );
}

// ─── État d'un compte ─────────────────────────────────────────────

export type AccountTone = "ok" | "warning" | "error";

export interface AccountHealth {
  tone: AccountTone;
  label: string;
  reason?: string;
  /** Geste qui règle la situation : reconnecter, ou retenter la prolongation du jeton. */
  action: "reconnect" | "extend" | null;
}

/**
 * Ce que l'administration doit savoir d'un compte, en un mot et un geste. Le
 * jeton peut expirer avant que le compte soit marqué : on le dit avant.
 */
export function accountHealth(account: Pick<AccountSummary, "status" | "statusReason" | "tokenState" | "tokenStateReason" | "tokenRenewal">): AccountHealth {
  if (account.status !== "connected") return { tone: "error", label: "À reconnecter", reason: account.statusReason, action: "reconnect" };
  if (account.tokenState === "expired") return { tone: "error", label: "À reconnecter", reason: account.tokenStateReason, action: "reconnect" };
  if (account.tokenState === "expiring-soon") {
    // Un renouvellement en échec se retente ; un jeton que le service ne prolonge pas ne se règle qu'en reconnectant.
    const renewable = account.tokenRenewal === "automatic";
    return { tone: "warning", label: "Expire bientôt", reason: account.tokenStateReason, action: renewable ? "extend" : "reconnect" };
  }
  return { tone: "ok", label: "Connecté", action: null };
}

const TONE_DOT: Record<AccountTone, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

/** État en point coloré et en texte (jamais la couleur seule). */
export function StatusDot({ tone, label, reason, className }: { tone: AccountTone; label: string; reason?: string; className?: string }) {
  const content = (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
  if (!reason) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex min-w-0 cursor-help">{content}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function AccountStatus({ account, className }: { account: Parameters<typeof accountHealth>[0]; className?: string }) {
  const health = accountHealth(account);
  return <StatusDot tone={health.tone} label={health.label} reason={health.reason} className={className} />;
}

// ─── Textes ───────────────────────────────────────────────────────

const upperFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** « a, b et c ». */
export function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} et ${words[words.length - 1]}`;
}

export function capabilitiesText(capabilities: ConnectionCapability[]): string {
  return capabilities.length ? upperFirst(joinWords(capabilities.map((capability) => CAPABILITY_LABELS[capability]))) : "Aucun droit";
}

/** Noms de compte féminins connus ; les autres prennent « un ». */
const FEMININE_NOUNS = new Set(["chaîne", "page", "boutique", "chaine"]);

/** « une page », « un compte ». */
export function withArticle(noun: string): string {
  return `${FEMININE_NOUNS.has(noun.toLowerCase()) ? "une" : "un"} ${noun}`;
}

const PUBLISH_WORDS: Partial<Record<ConnectionCapability, string>> = {
  "publish.video": "des vidéos",
  "publish.image": "des images",
  "publish.text": "des messages",
};

/**
 * Ce qu'un service permet, en une phrase : « Publier des vidéos sur une
 * chaîne ; gérer les publications, changer la bannière et le filigrane. »
 * Tiré des capacités du connecteur, sans nom de service en dur.
 */
export function connectorPhrase(connector: Pick<ConnectorInfo, "capabilities" | "accountNoun">): string {
  const publish = connector.capabilities.map((capability) => PUBLISH_WORDS[capability]).filter((word): word is string => Boolean(word));
  const others = connector.capabilities.filter((capability) => !PUBLISH_WORDS[capability] && capability !== "posts.list").map((capability) => CAPABILITY_LABELS[capability]);
  const first = publish.length ? `Publier ${joinWords(publish)} sur ${withArticle(connector.accountNoun.one)}` : "";
  const second = others.length ? joinWords(others) : "";
  if (first && second) return `${first} ; ${second}.`;
  return `${upperFirst(first || second)}.`;
}

/** « 2 chaînes », « 1 compte ». */
export function countLabel(count: number, noun: { one: string; many: string }) {
  return `${count.toLocaleString("fr-FR")} ${count > 1 ? noun.many : noun.one}`;
}

export function formatDateTime(value: number | string | undefined): string {
  if (value === undefined || value === "") return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const RELATIVE = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/** « il y a 3 heures », « dans 2 jours » ; au-delà d'un mois, la date. */
export function formatRelative(value: number | string | undefined, now = Date.now()): string {
  if (value === undefined || value === "") return "–";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "–";
  const seconds = Math.round((at - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "à l’instant";
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86_400) return RELATIVE.format(Math.round(seconds / 86_400), "day");
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Instant relatif (« il y a 3 heures »), la date complète en infobulle. Le
 * texte dépend de l'heure du rendu : celui du serveur peut différer d'une
 * minute de celui du navigateur, sans que ce soit une erreur.
 */
export function RelativeTime({ value, className, prefix = "" }: { value: number | string | undefined; className?: string; prefix?: string }) {
  return (
    <span className={className} title={formatDateTime(value)} suppressHydrationWarning>
      {prefix}
      {formatRelative(value)}
    </span>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  return `${Math.max(1, Math.ceil(bytes / 1024)).toLocaleString("fr-FR")} Ko`;
}

// ─── Copier une valeur ────────────────────────────────────────────

/**
 * Valeur à recopier ailleurs (adresse de retour…) : affichée entière, coupée
 * où il faut, avec son bouton de copie. Une adresse tronquée par le bord du
 * champ se recopie mal à la main.
 */
export function CopyField({ value, label = "Copier" }: { value: string; label?: string }) {
  // Le retour se lit sur le bouton : une coche, ou une croix si le navigateur
  // refuse (la valeur reste sélectionnable d'un clic pour la copier à la main).
  const { hasCopied, copyFailed, copyToClipboard } = useCopyToClipboard({ resetAfter: 1500 });
  const failedLabel = "Copie impossible : sélectionnez le texte et copiez-le à la main.";
  return (
    <div className="flex min-h-9 w-full min-w-0 items-start gap-1 rounded-md border border-input py-0.5 pr-0.5 pl-3 dark:bg-input/30">
      <code className="min-w-0 flex-1 py-1.5 font-mono text-xs leading-5 break-all select-all">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label={copyFailed ? failedLabel : label}
        title={copyFailed ? failedLabel : label}
        onClick={() => void copyToClipboard(value)}
      >
        {hasCopied ? (
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
        ) : copyFailed ? (
          <X className="size-4 text-destructive" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
    </div>
  );
}

/** Coupe un texte en morceaux et rend les adresses web cliquables (ouvertes dans un nouvel onglet). */
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)»"]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-2 hover:text-foreground">
            {part.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}
