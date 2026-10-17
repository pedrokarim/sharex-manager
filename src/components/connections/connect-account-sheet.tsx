"use client";

/**
 * Parcours « Connecter un compte » (dossier 07 bis, « Comptes connectés »).
 *
 * Le geste visé : « je veux publier sur ce service », et en sortir avec un
 * compte prêt à publier, sans quitter ce qu'on faisait ni recopier deux fois
 * la même chose. Un seul tiroir qui avance par étapes visibles en haut, avec
 * retour possible :
 *
 * 1. le service (logo, ce qu'il permet, prêt / à configurer / bientôt, et les
 *    comptes déjà reliés pour ne pas reconnecter par erreur) ;
 * 2. la configuration de son application, seulement si elle manque ;
 * 3. le niveau d'accès, rédigé en clair, seulement s'il y a un choix ;
 * 4. l'autorisation chez le service dans une fenêtre surgissante : le tiroir
 *    reste ouvert et attend le message de la page de retour (limité à
 *    l'origine de l'application, doublé d'un `BroadcastChannel`) ; fenêtre
 *    bloquée : redirection classique, qui ramène ici (`useConnectionReturn`) ;
 * 5. les comptes trouvés, quand une autorisation en rend plusieurs ;
 * 6. « C'est prêt », avec les suites naturelles.
 *
 * Il s'ouvre de partout où le besoin apparaît : la page « Comptes
 * connectés », la fenêtre « Publier » d'un module, la section « Publication »
 * d'une image de marque (`ConnectAccountButton`). L'appelant reçoit les
 * nouveaux comptes (`onConnected`) pour les cocher d'avance.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Minus,
  Palette,
  Plus,
  RefreshCw,
  Settings2,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Orb, ShimmerText } from "@/components/loading";
import { cn } from "@/lib/utils";
import {
  CAPABILITY_LABELS,
  CONNECTION_CHANNEL,
  CONNECTION_MESSAGE_TYPE,
  type AccountSummary,
  type ConnectionCapability,
  type ConnectionResultMessage,
} from "@/lib/connections/types";
import type { PendingAuthorizationView } from "@/lib/connections/pending";
import {
  cancelPendingAuthorizationAction,
  finalizePendingAuthorizationAction,
  getOverviewAction,
  getPendingAuthorizationAction,
} from "@/app/(app)/admin/connections/actions";
import type { ConnectionsOverview, ConnectorView } from "./types";
import { AppConfigForm } from "./app-config-form";
import { AccountAvatar, CopyField, ServiceLogo, capabilitiesText, connectorPhrase, countLabel, withArticle } from "./shared";

// ─── Étapes ───────────────────────────────────────────────────────

export type ConnectStepId = "service" | "configure" | "access" | "authorize" | "accounts" | "ready";

const STEPS: { id: ConnectStepId; label: string }[] = [
  { id: "service", label: "Service" },
  { id: "configure", label: "Configuration" },
  { id: "access", label: "Accès" },
  { id: "authorize", label: "Autorisation" },
  { id: "accounts", label: "Comptes" },
  { id: "ready", label: "Prêt" },
];

/** Résultat d'une connexion revenue par redirection (fenêtre surgissante bloquée). */
export type ConnectFlowResult =
  | { state: "connected"; ids: string[] }
  | { state: "pending"; pendingId: string }
  | { state: "error"; code: string; message: string };

/** Où et comment ouvrir le parcours. */
export interface ConnectFlowStart {
  connectorId?: string;
  /** Jeu de portées choisi d'avance (reconnexion). */
  scopeSet?: string;
  /** Reconnexion d'un compte : le parcours va droit à l'autorisation. */
  reconnect?: { accountId: string; accountName: string };
  /** Étape d'entrée ; par défaut le choix du service. */
  step?: "service" | "configure" | "authorize";
  /** Retour par redirection : le parcours reprend là où il en était. */
  result?: ConnectFlowResult;
}

export interface ConnectAccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start?: ConnectFlowStart | null;
  /** Seuls les services qui ont cette capacité sont proposés (« publish.video » depuis Clip Studio). */
  capability?: ConnectionCapability;
  /**
   * Chemin interne où revenir si la fenêtre surgissante est bloquée ; par
   * défaut, la page courante. La page doit alors appeler
   * `useConnectionReturn` pour rouvrir le parcours.
   */
  returnTo?: string;
  /** Libellé du retour à ce qu'on faisait (« Revenir à la publication ») ; absent : « Fermer ». */
  returnLabel?: string;
  /** Les nouveaux comptes, dès qu'ils sont enregistrés (pour les cocher d'avance). */
  onConnected?: (accounts: AccountSummary[]) => void;
  /** Données déjà chargées par la page ; sinon le parcours les lit à l'ouverture. */
  overview?: ConnectionsOverview | null;
  onOverviewChange?: (overview: ConnectionsOverview) => void;
  /** Lien vers les images de marque (suite « Lier à une image de marque ») ; `null` pour la masquer. */
  brandKitHref?: string | null;
}

/** Paramètres d'adresse posés par le retour du service ; retirés une fois lus. */
const FLOW_PARAMS = ["sxmConnect", "connected", "pending", "error", "errorCode", "connector", "configure"];

function stripFlowParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of FLOW_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** Adresse de retour : la page courante (ou celle demandée), marquée pour reprendre le parcours. */
function flowReturnPath(returnTo?: string): string {
  const base = returnTo ?? `${window.location.pathname}${stripFlowParams(window.location.search)}`;
  const url = new URL(base, window.location.origin);
  url.searchParams.set("sxmConnect", "1");
  return `${url.pathname}${url.search}`;
}

function connectorState(connector: ConnectorView): "ready" | "setup" | "planned" {
  if (connector.status === "planned") return "planned";
  return connector.app?.configured ? "ready" : "setup";
}

const STATE_TEXT = { ready: "Prêt", setup: "À configurer une fois", planned: "Bientôt" } as const;
const STATE_DOT = { ready: "bg-emerald-500", setup: "bg-amber-500", planned: "bg-muted-foreground/40" } as const;

/** Jeu de portées qui redonne au moins les droits actuels d'un compte. */
export function scopeSetFor(connector: ConnectorView, capabilities: ConnectionCapability[]): string | undefined {
  return connector.scopeSets.find((set) => capabilities.every((capability) => set.capabilities.includes(capability)))?.id ?? connector.scopeSets[0]?.id;
}

// ─── Le tiroir ────────────────────────────────────────────────────

export function ConnectAccountSheet({
  open,
  onOpenChange,
  start,
  capability,
  returnTo,
  returnLabel,
  onConnected,
  overview: givenOverview,
  onOverviewChange,
  brandKitHref = "/m/brand-kit",
}: ConnectAccountSheetProps) {
  const [overview, setOverview] = useState<ConnectionsOverview | null>(givenOverview ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<ConnectStepId>("service");
  const [visited, setVisited] = useState<Set<ConnectStepId>>(new Set());
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [scopeSet, setScopeSet] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [connected, setConnected] = useState<AccountSummary[]>([]);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [reconnect, setReconnect] = useState<ConnectFlowStart["reconnect"]>(undefined);

  useEffect(() => {
    if (givenOverview) setOverview(givenOverview);
  }, [givenOverview]);

  const refresh = useCallback(async () => {
    const result = await getOverviewAction();
    if (!result.ok) {
      setLoadError(result.error);
      return null;
    }
    setLoadError(null);
    setOverview(result.data);
    onOverviewChange?.(result.data);
    return result.data;
  }, [onOverviewChange]);

  const connector = overview?.connectors.find((entry) => entry.id === connectorId) ?? null;

  const go = useCallback((next: ConnectStepId) => {
    setStep((current) => {
      setVisited((done) => new Set(done).add(current));
      return next;
    });
  }, []);

  /** Ce qui suit le choix du service : sa configuration si elle manque, le niveau d'accès s'il y a un choix, l'autorisation. */
  const afterService = useCallback(
    (target: ConnectorView, wanted?: string) => {
      setConnectorId(target.id);
      setFailure(null);
      setScopeSet(wanted && target.scopeSets.some((set) => set.id === wanted) ? wanted : (target.scopeSets[0]?.id ?? ""));
      if (!target.app?.configured) return go("configure");
      if (target.scopeSets.length > 1 && !wanted) return go("access");
      go("authorize");
    },
    [go]
  );

  const finishConnected = useCallback(
    (accounts: AccountSummary[]) => {
      setConnected(accounts);
      setFailure(null);
      go("ready");
      if (accounts.length > 0) onConnected?.(accounts);
    },
    [go, onConnected]
  );

  // Ouverture : on repart de zéro, ou de l'endroit demandé.
  const opened = useRef(false);
  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    setStep("service");
    setVisited(new Set());
    setConnectorId(start?.connectorId ?? null);
    setPendingId(null);
    setConnected([]);
    setFailure(null);
    setReconnect(start?.reconnect);
    void (async () => {
      const data = givenOverview ?? (await refresh());
      if (!data || !start) return;
      const target = data.connectors.find((entry) => entry.id === start.connectorId);
      const result = start.result;
      if (result?.state === "pending") {
        setVisited(new Set<ConnectStepId>(["service", "configure", "access", "authorize"]));
        setPendingId(result.pendingId);
        setStep("accounts");
        return;
      }
      if (result?.state === "connected") {
        const fresh = givenOverview ? ((await refresh()) ?? data) : data;
        const accounts = fresh.accounts.filter((account) => result.ids.includes(account.id) || (account.grantId !== undefined && result.ids.includes(account.grantId)));
        setVisited(new Set<ConnectStepId>(["service", "configure", "access", "authorize"]));
        finishConnected(accounts);
        return;
      }
      if (!target) return;
      setConnectorId(target.id);
      setScopeSet(start.scopeSet && target.scopeSets.some((set) => set.id === start.scopeSet) ? start.scopeSet : (target.scopeSets[0]?.id ?? ""));
      if (result?.state === "error") {
        setVisited(new Set<ConnectStepId>(["service", "configure", "access"]));
        if (result.code === "app_not_configured") return setStep("configure");
        setFailure({ code: result.code, message: result.message });
        setStep("authorize");
        return;
      }
      if (start.step === "configure" || (start.step === "authorize" && !target.app?.configured)) {
        setVisited(new Set<ConnectStepId>(["service"]));
        setStep("configure");
        return;
      }
      if (start.step === "authorize" || start.reconnect) {
        setVisited(new Set<ConnectStepId>(["service", "configure", "access"]));
        setStep("authorize");
        return;
      }
      afterService(target, start.scopeSet);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement à l'ouverture
  }, [open]);

  const choices = useMemo(() => {
    const list = overview?.connectors ?? [];
    return capability ? list.filter((entry) => entry.capabilities.includes(capability)) : list;
  }, [overview, capability]);

  // Étapes qui ne serviront pas pour ce service, montrées comme passées plutôt que cachées.
  const notNeeded = (id: ConnectStepId) =>
    Boolean(connector) &&
    ((id === "access" && (connector!.scopeSets.length <= 1 || Boolean(reconnect))) ||
      (id === "accounts" && !connector!.multipleAccounts && !pendingId) ||
      (id === "configure" && Boolean(connector!.app?.configured) && !visited.has("configure") && step !== "configure"));

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const canGoBack = step === "configure" || step === "access" || (step === "authorize" && !reconnect);

  const back = () => {
    setFailure(null);
    if (step === "authorize" && connector && connector.scopeSets.length > 1) return setStep("access");
    if ((step === "authorize" || step === "access") && connector && visited.has("configure") && !connector.app?.configured) return setStep("configure");
    setStep("service");
  };

  const title = reconnect ? `Reconnecter « ${reconnect.accountName} »` : "Connecter un compte";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="gap-1 border-b px-5 pt-5 pb-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex min-w-0 items-center gap-2 text-lg">
                {connector ? <ServiceLogo logo={connector.logo} className="size-5" /> : null}
                <span className="truncate">{title}</span>
              </SheetTitle>
              <SheetDescription className="text-pretty">
                {connector ? connectorPhrase(connector) : "Un compte relié sert à publier depuis Clip Studio, Image de marque et les modules à venir."}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Fermer">
              <X className="size-4" />
            </Button>
          </div>
          <FlowStepper
            current={stepIndex}
            stateOf={(id, index) =>
              index === stepIndex ? "current" : index < stepIndex ? (visited.has(id) && !notNeeded(id) ? "done" : "skipped") : notNeeded(id) ? "skipped" : "upcoming"
            }
            onJump={(id) => {
              if (!canGoBack && step !== "authorize") return;
              if (id === "service") setStep("service");
              else if (id === "configure" && connector?.status === "ready") setStep("configure");
              else if (id === "access" && connector && connector.scopeSets.length > 1 && !reconnect) setStep("access");
            }}
            jumpable={(id, index) => index < stepIndex && (canGoBack || (step === "authorize" && !reconnect)) && (id === "service" || id === "configure" || (id === "access" && !notNeeded("access")))}
          />
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!overview ? (
            loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : (
              <div className="grid gap-3" aria-busy>
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            )
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.16 }} className="min-w-0">
                {step === "service" ? (
                  <ServiceStep overview={overview} choices={choices} capability={capability} onChoose={(target) => afterService(target)} />
                ) : step === "configure" && connector ? (
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
                    <p className="text-sm text-pretty text-muted-foreground">
                      {connector.label} demande une application déclarée chez lui. Une seule fois : elle sert ensuite à tous les comptes {connector.label} de l’instance.
                    </p>
                    <AppConfigForm
                      connector={connector}
                      submitLabel="Enregistrer et continuer"
                      onSaved={(next) => {
                        setOverview(next);
                        onOverviewChange?.(next);
                        const updated = next.connectors.find((entry) => entry.id === connector.id);
                        if (updated?.app?.configured) {
                          setFailure(null);
                          go(updated.scopeSets.length > 1 && !reconnect ? "access" : "authorize");
                        }
                      }}
                    />
                  </div>
                ) : step === "access" && connector ? (
                  <AccessStep connector={connector} value={scopeSet} onChange={setScopeSet} />
                ) : step === "authorize" && connector ? (
                  <AuthorizeStep
                    connector={connector}
                    scopeSet={scopeSet}
                    reconnectName={reconnect?.accountName}
                    returnTo={returnTo}
                    failure={failure}
                    onFailure={setFailure}
                    onConfigure={() => setStep("configure")}
                    onResult={async (message) => {
                      if (!message.ok) {
                        if (message.error.code === "app_not_configured") {
                          await refresh();
                          return setStep("configure");
                        }
                        return setFailure(message.error);
                      }
                      if (message.state === "pending") {
                        setPendingId(message.pendingId);
                        return go("accounts");
                      }
                      const data = await refresh();
                      const ids = new Set(message.accountIds);
                      finishConnected((data?.accounts ?? []).filter((account) => ids.has(account.id)));
                    }}
                  />
                ) : step === "accounts" && pendingId ? (
                  <AccountsStep
                    pendingId={pendingId}
                    onCancelled={() => {
                      setPendingId(null);
                      setStep("service");
                    }}
                    onKept={async (accounts) => {
                      await refresh();
                      finishConnected(accounts);
                    }}
                  />
                ) : step === "ready" ? (
                  <ReadyStep
                    accounts={connected}
                    connector={connector ?? overview.connectors.find((entry) => entry.id === connected[0]?.connector) ?? null}
                    returnLabel={returnLabel}
                    brandKitHref={brandKitHref}
                    onReturn={() => onOpenChange(false)}
                    onAnother={() => {
                      setConnected([]);
                      setPendingId(null);
                      setReconnect(undefined);
                      setVisited(new Set());
                      setStep("service");
                    }}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t px-5 py-3">
          {canGoBack ? (
            <Button variant="ghost" onClick={back} className="gap-1.5">
              <ArrowLeft className="size-4" />
              Retour
            </Button>
          ) : (
            <span />
          )}
          {step === "access" ? (
            <Button onClick={() => go("authorize")} disabled={!scopeSet}>
              Continuer
            </Button>
          ) : step === "ready" ? (
            <Button variant={returnLabel ? "outline" : "default"} onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Fil des étapes ───────────────────────────────────────────────

type StepDisplay = "done" | "current" | "upcoming" | "skipped";

function FlowStepper({
  current,
  stateOf,
  onJump,
  jumpable,
}: {
  current: number;
  stateOf: (id: ConnectStepId, index: number) => StepDisplay;
  onJump: (id: ConnectStepId) => void;
  jumpable: (id: ConnectStepId, index: number) => boolean;
}) {
  return (
    <ol className="mt-3 flex min-w-0 items-center gap-1" aria-label="Étapes">
      {STEPS.map((entry, index) => {
        const state = stateOf(entry.id, index);
        const canJump = jumpable(entry.id, index);
        return (
          <li key={entry.id} className={cn("flex min-w-0 items-center gap-1", index === current ? "shrink-0" : "flex-1")}>
            <button
              type="button"
              disabled={!canJump}
              onClick={() => onJump(entry.id)}
              aria-current={state === "current" ? "step" : undefined}
              title={`${index + 1}. ${entry.label}${state === "skipped" ? " (sans objet)" : state === "done" ? " (fait)" : ""}`}
              className={cn("flex min-w-0 items-center gap-1.5 rounded-full text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", canJump && "cursor-pointer hover:text-foreground")}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums",
                  state === "current" && "border-primary bg-primary text-primary-foreground",
                  state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                  state === "upcoming" && "text-muted-foreground",
                  state === "skipped" && "border-dashed text-muted-foreground/60"
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : state === "skipped" ? <Minus className="size-3" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate",
                  // Seule l'étape en cours porte son nom : six libellés ne tiennent pas dans le tiroir, les autres l'ont en infobulle.
                  state === "current" ? "font-medium text-foreground" : "sr-only",
                  state === "skipped" && "text-muted-foreground/60"
                )}
              >
                {entry.label}
              </span>
            </button>
            {index < STEPS.length - 1 ? <span aria-hidden className={cn("h-px min-w-2 flex-1 bg-border", state === "done" && "bg-emerald-500/50")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

// ─── 1. Le service ────────────────────────────────────────────────

/** Une recherche ne se justifie qu'au-delà d'une poignée de services. */
const SEARCH_FROM = 7;

function ServiceStep({
  overview,
  choices,
  capability,
  onChoose,
}: {
  overview: ConnectionsOverview;
  choices: ConnectorView[];
  capability?: ConnectionCapability;
  onChoose: (connector: ConnectorView) => void;
}) {
  const blocked = overview.keySource === null
    ? "Ni CONNECTIONS_ENCRYPTION_KEY ni AUTH_SECRET ne sont définis sur le serveur : les jetons ne pourraient pas être chiffrés. Définissez l’une des deux, puis revenez."
    : !overview.authUrl
      ? "AUTH_URL n’est pas défini sur le serveur : les services ne sauraient pas où revenir après l’autorisation."
      : null;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {capability ? <p className="text-sm text-muted-foreground">Services qui savent {CAPABILITY_LABELS[capability]}.</p> : null}
      {blocked ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {blocked}
        </p>
      ) : null}
      <Command className="bg-transparent" loop>
        {choices.length >= SEARCH_FROM ? <CommandInput placeholder="Chercher un service" /> : null}
        <CommandList className="max-h-none overflow-visible">
          <CommandEmpty>Aucun service ne correspond.</CommandEmpty>
          <CommandGroup className="p-0 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:gap-2">
            {choices.map((entry) => {
              const state = connectorState(entry);
              const linked = overview.accounts.filter((account) => account.connector === entry.id);
              return (
                <CommandItem
                  key={entry.id}
                  value={`${entry.label} ${entry.id}`}
                  disabled={state === "planned" || Boolean(blocked)}
                  onSelect={() => onChoose(entry)}
                  className="items-start gap-3 rounded-lg border px-3 py-3 data-[disabled=true]:opacity-70 data-[selected=true]:border-primary/40"
                >
                  <ServiceLogo logo={entry.logo} className="mt-0.5 size-7" />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span className="truncate text-sm font-medium">{entry.label}</span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("size-2 rounded-full", STATE_DOT[state])} aria-hidden />
                        {STATE_TEXT[state]}
                      </span>
                    </div>
                    <p className="text-xs text-pretty text-muted-foreground">{connectorPhrase(entry)}</p>
                    {linked.length > 0 ? (
                      <div className="flex min-w-0 items-center gap-2 pt-1">
                        <span className="flex shrink-0 -space-x-1.5">
                          {linked.slice(0, 4).map((account) => (
                            <AccountAvatar key={account.id} account={account} className="size-5 text-[10px] ring-2 ring-background" />
                          ))}
                        </span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground" title={linked.map((account) => account.displayName).join(", ")}>
                          Déjà {linked.length > 1 ? "reliés" : "relié"} : {linked.slice(0, 2).map((account) => account.displayName).join(", ")}
                          {linked.length > 2 ? ` et ${linked.length - 2} autre${linked.length > 3 ? "s" : ""}` : ""}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
      <p className="text-xs text-muted-foreground">On peut relier autant de comptes que l’on veut, de chaque service.</p>
    </div>
  );
}

// ─── 3. Le niveau d'accès ─────────────────────────────────────────

function AccessStep({ connector, value, onChange }: { connector: ConnectorView; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <p className="text-sm text-pretty text-muted-foreground">Ce que ShareX Manager pourra faire avec {withArticle(connector.accountNoun.one)} {connector.label}. On peut changer d’avis en reconnectant le compte.</p>
      <RadioGroup value={value} onValueChange={onChange} className="gap-3">
        {connector.scopeSets.map((set) => {
          const missing = connector.capabilities.filter((capability) => !set.capabilities.includes(capability));
          return (
            <Label
              key={set.id}
              htmlFor={`access-${set.id}`}
              className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-primary"
            >
              <RadioGroupItem id={`access-${set.id}`} value={set.id} className="mt-0.5" />
              <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                <span className="text-sm font-medium">{set.label}</span>
                {set.description ? <span className="text-xs text-pretty text-muted-foreground">{set.description}</span> : null}
                <ul className="grid gap-1 text-xs">
                  {set.capabilities.map((capability) => (
                    <li key={capability} className="flex items-start gap-1.5">
                      <Check className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      <span className="min-w-0">{CAPABILITY_LABELS[capability].replace(/^./, (letter) => letter.toUpperCase())}</span>
                    </li>
                  ))}
                  {missing.map((capability) => (
                    <li key={capability} className="flex items-start gap-1.5 text-muted-foreground">
                      <Minus className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">Ne permet pas de {CAPABILITY_LABELS[capability]}</span>
                    </li>
                  ))}
                </ul>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

// ─── 4. L'autorisation ────────────────────────────────────────────

const POPUP_NAME = "sxm-connect";

function AuthorizeStep({
  connector,
  scopeSet,
  reconnectName,
  returnTo,
  failure,
  onFailure,
  onConfigure,
  onResult,
}: {
  connector: ConnectorView;
  scopeSet: string;
  reconnectName?: string;
  returnTo?: string;
  failure: { code: string; message: string } | null;
  onFailure: (failure: { code: string; message: string } | null) => void;
  onConfigure: () => void;
  onResult: (message: ConnectionResultMessage) => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "redirecting" | "finishing">("idle");
  const [popupGone, setPopupGone] = useState(false);
  const popup = useRef<Window | null>(null);
  const handled = useRef(false);
  const resultRef = useRef(onResult);
  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  // La page de retour prévient par `postMessage` (origine de l'application), répété sur un canal de secours.
  useEffect(() => {
    if (phase !== "waiting") return;
    handled.current = false;
    const accept = (data: unknown) => {
      const message = data as ConnectionResultMessage | null;
      if (!message || typeof message !== "object" || message.type !== CONNECTION_MESSAGE_TYPE || message.connector !== connector.id) return;
      if (handled.current) return;
      handled.current = true;
      setPhase("finishing");
      void Promise.resolve(resultRef.current(message)).finally(() => setPhase("idle"));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      accept(event.data);
    };
    window.addEventListener("message", onMessage);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CONNECTION_CHANNEL);
      channel.onmessage = (event) => accept(event.data);
    } catch {
      channel = null;
    }
    // Certains services coupent le lien avec la fenêtre : « fermée » n'est alors qu'une supposition, dite sans conclure.
    const watch = setInterval(() => {
      if (popup.current && popup.current.closed) setPopupGone(true);
    }, 800);
    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
      clearInterval(watch);
    };
  }, [phase, connector.id]);

  const connectUrl = (popupMode: boolean) => {
    const params = new URLSearchParams({ scopes: scopeSet, returnTo: flowReturnPath(returnTo) });
    if (popupMode) params.set("mode", "popup");
    return `/api/connections/${encodeURIComponent(connector.id)}/connect?${params.toString()}`;
  };

  const openPopup = () => {
    onFailure(null);
    setPopupGone(false);
    const width = 520;
    const height = 720;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const opened = window.open(connectUrl(true), POPUP_NAME, `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`);
    if (!opened) {
      // Fenêtre bloquée : redirection classique, le retour rouvre le parcours ici.
      setPhase("redirecting");
      window.location.assign(connectUrl(false));
      return;
    }
    popup.current = opened;
    opened.focus();
    setPhase("waiting");
  };

  const noun = withArticle(connector.accountNoun.one);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      {failure ? (
        <ConnectionErrorHelp
          failure={failure}
          connector={connector}
          onRetry={openPopup}
          onConfigure={onConfigure}
        />
      ) : (
        <>
          <div className="grid gap-2 text-sm text-pretty">
            <p>
              {connector.label} s’ouvre dans une petite fenêtre : choisissez {noun}
              {reconnectName ? <> (le même qu’avant, « {reconnectName} »)</> : null} et acceptez les droits demandés.
            </p>
            <p className="text-muted-foreground">Ce panneau reste ouvert et reprend tout seul quand {connector.label} a répondu.</p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {phase === "idle" ? (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button size="lg" onClick={openPopup} className="gap-2">
                  <ServiceLogo logo={connector.logo} />
                  Ouvrir {connector.label}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="grid gap-3"
                aria-live="polite"
              >
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Orb size="sm" state="connecting" className="text-primary" />
                  <ShimmerText className="min-w-0">
                    {phase === "redirecting"
                      ? `Fenêtre bloquée par le navigateur : passage par ${connector.label} dans cet onglet…`
                      : phase === "finishing"
                        ? "Enregistrement…"
                        : `En attente de ${connector.label}…`}
                  </ShimmerText>
                </p>
                {phase === "waiting" ? (
                  <>
                    {/* `closed` est aussi vrai quand le service coupe le lien avec sa fenêtre (Google le fait) : on ne conclut rien. */}
                    {popupGone ? (
                      <p className="text-xs text-pretty text-muted-foreground">
                        Cette page ne voit plus la fenêtre de {connector.label}. Si vous l’avez fermée sans terminer, rouvrez-la ; si elle affiche une erreur, voyez ci-dessous.
                      </p>
                    ) : null}
                    <details className="group text-xs text-pretty text-muted-foreground">
                      <summary className="cursor-pointer select-none font-medium text-foreground/80 hover:text-foreground">
                        {connector.label} affiche « Accès bloqué » ou une erreur ?
                      </summary>
                      <div className="mt-2 grid gap-1.5">
                        <p>
                          Tant que l’application déclarée chez {connector.label} est en mode test (ou développement), seuls les comptes ajoutés comme
                          testeurs peuvent se connecter. Ajoutez celui que vous utilisez dans la console du service :
                        </p>
                        <ul className="list-disc space-y-1 pl-4">
                          <li>Google (YouTube) : Google Auth Platform › Audience › Utilisateurs test ;</li>
                          <li>Meta (Facebook, Instagram, Threads) : Rôles de l’application › Testeurs, puis accepter l’invitation depuis le compte.</li>
                        </ul>
                        <p>Fermez ensuite la fenêtre d’erreur et cliquez sur « Rouvrir la fenêtre ».</p>
                      </div>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={openPopup}>
                        <SquareArrowOutUpRight className="size-4" />
                        Rouvrir la fenêtre
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          popup.current?.close();
                          setPhase("idle");
                        }}
                      >
                        Ne plus attendre
                      </Button>
                    </div>
                  </>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/** Ce que veut dire une erreur de connexion, et le geste qui la règle. */
export function describeConnectionError(code: string, label: string): { title: string; body: string; fix: "retry" | "configure" | "redirect" } {
  switch (code) {
    case "redirect_uri_mismatch":
      return {
        title: `${label} refuse l’adresse de retour`,
        body: `L’adresse ci-dessous doit figurer telle quelle parmi les adresses de redirection autorisées de l’application, dans la console de ${label}. Collez-la, enregistrez, puis recommencez.`,
        fix: "redirect",
      };
    case "access_denied":
      return { title: "Accès refusé", body: `La demande a été refusée ou annulée chez ${label}. Rien n’a été enregistré ; recommencez quand vous voulez.`, fix: "retry" };
    case "invalid_client":
    case "unauthorized_client":
      return {
        title: `${label} ne reconnaît pas l’application`,
        body: "L’identifiant ou le secret du client ne correspond pas à l’application déclarée chez le service. Recopiez-les depuis la console.",
        fix: "configure",
      };
    case "invalid_scope":
      return { title: "Droits refusés", body: `${label} n’accorde pas les droits demandés à cette application. Vérifiez dans la console que les API nécessaires sont activées.`, fix: "retry" };
    case "invalid_state":
    case "invalid_grant":
      return { title: "Connexion expirée", body: "La demande a expiré ou a été utilisée deux fois (dix minutes au plus). Recommencez.", fix: "retry" };
    case "no_accounts":
      return { title: `Aucun compte trouvé chez ${label}`, body: `Le compte choisi chez ${label} ne donne accès à aucun compte publiable. Choisissez-en un autre, ou vérifiez vos droits dessus.`, fix: "retry" };
    case "temporarily_unavailable":
    case "server_error":
      return { title: `${label} ne répond pas`, body: `${label} est momentanément indisponible. Réessayez dans un moment.`, fix: "retry" };
    default:
      return { title: "La connexion n’a pas abouti", body: "", fix: "retry" };
  }
}

function ConnectionErrorHelp({
  failure,
  connector,
  onRetry,
  onConfigure,
}: {
  failure: { code: string; message: string };
  connector: ConnectorView;
  onRetry: () => void;
  onConfigure: () => void;
}) {
  const help = describeConnectionError(failure.code, connector.label);
  return (
    <div role="alert" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <p className="flex items-start gap-2 text-sm font-medium text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        {help.title}
      </p>
      <p className="text-sm text-pretty text-muted-foreground">{help.body || failure.message}</p>
      {help.body && failure.message && failure.code !== "access_denied" ? (
        <p className="text-xs text-pretty [overflow-wrap:anywhere] text-muted-foreground">Réponse du service : {failure.message}</p>
      ) : null}
      {help.fix === "redirect" && connector.app?.redirectUri ? <CopyField value={connector.app.redirectUri} label="Copier l’adresse de retour" /> : null}
      <div className="flex flex-wrap gap-2">
        {help.fix === "configure" ? (
          <Button onClick={onConfigure} className="gap-1.5">
            <Settings2 className="size-4" />
            Revoir la configuration
          </Button>
        ) : null}
        {help.fix === "redirect" || help.fix === "configure" ? (
          <Button asChild variant="outline" className="gap-1.5">
            <a href={connector.consoleUrl} target="_blank" rel="noreferrer noopener">
              Ouvrir la console de {connector.label}
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
        <Button variant={help.fix === "retry" ? "default" : "outline"} onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-4" />
          Recommencer
        </Button>
      </div>
    </div>
  );
}

// ─── 5. Les comptes trouvés ───────────────────────────────────────

function AccountsStep({
  pendingId,
  onKept,
  onCancelled,
}: {
  pendingId: string;
  onKept: (accounts: AccountSummary[]) => void | Promise<void>;
  onCancelled: () => void;
}) {
  const [view, setView] = useState<PendingAuthorizationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"keep" | "cancel" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPendingAuthorizationAction(pendingId).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setError(result.error);
      setView(result.data);
      setKept(new Set(result.data.accounts.map((account) => account.externalId)));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingId]);

  if (error) {
    return (
      <div role="alert" className="grid gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <div>
          <Button variant="outline" onClick={onCancelled}>
            Recommencer
          </Button>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="grid gap-2" aria-busy>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const all = kept.size === view.accounts.length;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-pretty">
          {view.connectorLabel} donne accès à {countLabel(view.accounts.length, view.accountNoun)}. Décochez ceux à ne pas relier.
        </p>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setKept(all ? new Set() : new Set(view.accounts.map((account) => account.externalId)))}>
          {all ? "Tout décocher" : "Tout cocher"}
        </Button>
      </div>
      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {view.accounts.map((account) => {
          const checked = kept.has(account.externalId);
          return (
            <li key={account.externalId}>
              <label className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40", checked && "border-primary/60")}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    setKept((current) => {
                      const next = new Set(current);
                      if (value === true) next.add(account.externalId);
                      else next.delete(account.externalId);
                      return next;
                    })
                  }
                />
                <AccountAvatar account={{ avatarUrl: account.avatarUrl, displayName: account.name }} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium" title={account.name}>
                    {account.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {account.handle ?? account.externalId}
                    {account.existingAccountId ? " · déjà relié, sera mis à jour" : ""}
                  </span>
                  <span className="line-clamp-2 text-xs text-pretty text-muted-foreground">{capabilitiesText(account.capabilities)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Choix gardé jusqu’à {new Date(view.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Les comptes décochés ne sont pas enregistrés ; leur accès n’est pas révoqué pour autant.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("cancel");
            await cancelPendingAuthorizationAction(view.id);
            setBusy(null);
            onCancelled();
          }}
        >
          Ne rien relier
        </Button>
        <Button
          loading={busy === "keep"}
          disabled={kept.size === 0 || busy !== null}
          className="gap-2"
          onClick={async () => {
            setBusy("keep");
            const result = await finalizePendingAuthorizationAction(view.id, [...kept]);
            setBusy(null);
            if (!result.ok) return setError(result.error);
            // L'étape « C'est prêt » montre les comptes reliés : pas d'autre message.
            await onKept(result.data.accounts);
          }}
        >
          <Check className="size-4" />
          {kept.size > 1 ? `Relier ces ${kept.size} comptes` : "Relier ce compte"}
        </Button>
      </div>
    </div>
  );
}

// ─── 6. C'est prêt ────────────────────────────────────────────────

function ReadyStep({
  accounts,
  connector,
  returnLabel,
  brandKitHref,
  onReturn,
  onAnother,
}: {
  accounts: AccountSummary[];
  connector: ConnectorView | null;
  returnLabel?: string;
  brandKitHref: string | null;
  onReturn: () => void;
  onAnother: () => void;
}) {
  const canPublish = accounts.some((account) => account.capabilities.some((capability) => capability.startsWith("publish.")));
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <p className="flex items-center gap-2 text-base font-semibold">
        <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
        C’est prêt
      </p>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Le compte est relié. Il apparaît dans « Comptes connectés ».</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          {accounts.map((account) => (
            <motion.li key={account.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5">
              <AccountAvatar account={account} withService className="size-10" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium" title={account.displayName}>
                  {account.displayName}
                </span>
                <span className="truncate text-xs text-muted-foreground">{account.handle ?? account.externalId}</span>
                <span className="text-xs text-pretty text-muted-foreground">{capabilitiesText(account.capabilities)}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      )}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {returnLabel ? (
          <Button onClick={onReturn} className="h-auto min-h-9 justify-start gap-2 text-left whitespace-normal">
            <ArrowLeft className="size-4" />
            {returnLabel}
          </Button>
        ) : null}
        {brandKitHref && canPublish ? (
          <Button asChild variant="outline" className="h-auto min-h-9 justify-start gap-2 text-left whitespace-normal">
            <Link href={brandKitHref}>
              <Palette className="size-4" />
              Lier à une image de marque
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-auto min-h-9 justify-start gap-2 text-left whitespace-normal">
          <Link href={accounts.length === 1 ? `/admin/connections/${accounts[0].id}` : "/admin/connections"}>
            <SquareArrowOutUpRight className="size-4" />
            {accounts.length === 1 ? "Voir le compte" : "Voir les comptes"}
          </Link>
        </Button>
        <Button variant="ghost" onClick={onAnother} className="h-auto min-h-9 justify-start gap-2 text-left whitespace-normal">
          <Plus className="size-4" />
          Connecter un autre compte
        </Button>
      </div>
    </div>
  );
}

// ─── Retour par redirection ───────────────────────────────────────

/**
 * Relit le résultat d'une connexion revenue par redirection (fenêtre
 * surgissante bloquée, ou parcours lancé depuis une autre page) et rend de
 * quoi rouvrir le parcours à la bonne étape. `clear` retire ces paramètres
 * de l'adresse.
 */
export function useConnectionReturn(): { start: ConnectFlowStart | null; clear: () => void } {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const start = useMemo<ConnectFlowStart | null>(() => {
    const connectorId = params.get("connector") ?? params.get("configure") ?? undefined;
    const marked = params.has("sxmConnect");
    const connected = params.get("connected");
    const pending = params.get("pending");
    const errorCode = params.get("errorCode");
    if (!marked && !connected && !pending && !errorCode && !params.has("configure")) return null;
    if (pending) return { connectorId, result: { state: "pending", pendingId: pending } };
    if (connected) return { connectorId, result: { state: "connected", ids: [connected] } };
    if (params.has("configure") || errorCode === "app_not_configured") return { connectorId, step: "configure" };
    if (errorCode) return { connectorId, result: { state: "error", code: errorCode, message: params.get("error") ?? "" } };
    return marked ? { connectorId } : null;
  }, [params]);
  const clear = useCallback(() => {
    router.replace(`${pathname}${stripFlowParams(params.toString())}`, { scroll: false });
  }, [router, pathname, params]);
  return { start, clear };
}

/**
 * Point d'entrée prêt à poser ailleurs (section « Publication » d'une image
 * de marque…) : un bouton qui ouvre le parcours, et qui le rouvre au retour
 * d'une redirection. Réservé aux administrateurs, comme la connexion.
 */
export function ConnectAccountButton({
  capability,
  returnLabel,
  onConnected,
  children,
  variant = "outline",
  size = "sm",
  className,
}: {
  capability?: ConnectionCapability;
  returnLabel?: string;
  onConnected?: (accounts: AccountSummary[]) => void;
  children?: ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { start, clear } = useConnectionReturn();
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<ConnectFlowStart | null>(null);
  useEffect(() => {
    if (!start) return;
    setEntry(start);
    setOpen(true);
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois par retour
  }, [start]);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn("gap-1.5", className)}
        onClick={() => {
          setEntry(null);
          setOpen(true);
        }}
      >
        {children ?? (
          <>
            <Plus className="size-4" />
            Connecter un compte
          </>
        )}
      </Button>
      <ConnectAccountSheet open={open} onOpenChange={setOpen} start={entry} capability={capability} returnLabel={returnLabel} onConnected={onConnected} />
    </>
  );
}
