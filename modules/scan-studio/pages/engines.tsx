"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCircle2, Languages, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { DetectorSettings } from "../components/library/detector-settings";
import { ENGINE_NAMES, EngineLogo, EngineName } from "../components/library/engine-logo";
import { ModuleShell } from "../components/module-shell";
import { api } from "../lib/client";
import { errorMessage, formatNumber } from "../lib/library-helpers";
import type { EngineCatalogue, EngineSettingsPatch, EngineStatus, TranslationEngineId } from "../lib/types";

/** État des moteurs gardé entre deux visites : il reste à l'écran pendant qu'on le rafraîchit. */
let snapshot: EngineCatalogue | null = null;

/** Part du plafond mensuel à partir de laquelle l'interface prévient (§ 7.5 du dossier). */
const WARNING_RATIO = 0.8;

/** Ce que chaque ordre veut dire, pour la confidentialité et pour la qualité. */
const ORDER_CHOICES: { primary: TranslationEngineId; fallback: TranslationEngineId; description: string }[] = [
  {
    primary: "deepl",
    fallback: "libretranslate",
    description:
      "Le plus juste vers le français : le texte des bulles part chez DeepL, et LibreTranslate ne prend le relais que si DeepL ne répond pas.",
  },
  {
    primary: "libretranslate",
    fallback: "deepl",
    description:
      "Rien ne sort de la machine tant que LibreTranslate répond ; la qualité est moindre, surtout depuis le japonais, et DeepL ne reçoit du texte qu’en secours.",
  },
];

export default function EnginesPage() {
  const { data: session } = useSession();
  // Le serveur refuse de toute façon ces réglages aux autres comptes : ici, on ne fait que ne pas les proposer.
  const isAdmin = session?.user?.role === "admin";
  const [catalogue, setCatalogue] = useState<EngineCatalogue | null>(snapshot);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const store = useCallback((next: EngineCatalogue) => {
    snapshot = next;
    setCatalogue(next);
    setFailed(false);
  }, []);

  /** Lit l'état des moteurs sur ce serveur : aucun service de traduction n'est appelé. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      store(await api.getEngines());
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "État des moteurs indisponible."));
    } finally {
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveOrder = async (primary: TranslationEngineId) => {
    const choice = ORDER_CHOICES.find((entry) => entry.primary === primary);
    if (!choice || savingOrder) return;
    setSavingOrder(true);
    try {
      store(await api.saveEngineSettings({ order: [choice.primary, choice.fallback] }));
      toast.success(`${ENGINE_NAMES[choice.primary]} est maintenant le moteur principal`);
    } catch (error) {
      toast.error(errorMessage(error, "L’ordre des moteurs n’a pas pu être enregistré."));
    } finally {
      setSavingOrder(false);
    }
  };

  const order = catalogue?.order ?? [];
  const primary = order[0];
  const engines = catalogue ? [...catalogue.engines].sort((left, right) => rankOf(order, left.id) - rankOf(order, right.id)) : [];
  const currentChoice = ORDER_CHOICES.find((entry) => entry.primary === primary);

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        crumbs={[{ label: "Moteurs" }]}
        actions={
          <Button variant="outline" className="gap-2" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Actualiser
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Languages aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">Moteurs</h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Ce qui repère le texte, et ce qui le traduit. Une traduction ne part chez un moteur que d’un clic sur « Traduire », et seulement si le
                glossaire, la mémoire et le cache ne peuvent pas répondre.
              </p>
            </div>
          </div>

          {catalogue === null ? (
            failed ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">L’état des moteurs n’a pas pu être chargé.</p>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </div>
            ) : (
              <EnginesSkeleton />
            )
          ) : (
            <>
              <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="flex min-w-0 flex-col gap-6">
                  <Card role="region" aria-labelledby="scan-studio-engine-order">
                    <CardHeader>
                      <CardTitle>
                        <h3 id="scan-studio-engine-order">Ordre d’appel</h3>
                      </CardTitle>
                      <CardDescription>
                        Le premier moteur traduit ; le second ne sert que si le premier ne répond pas. MyMemory passe en dernier : il marche sans clé, avec
                        un quota par jour, et traduit seul tant qu’aucun des deux autres n’est réglé.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {isAdmin ? (
                        <RadioGroup value={primary ?? ""} onValueChange={(next) => void saveOrder(next as TranslationEngineId)} disabled={savingOrder} className="gap-0">
                          <ItemGroup className="gap-3">
                            {ORDER_CHOICES.map((choice) => (
                              <Item key={choice.primary} variant="outline" role="listitem" className="items-start">
                                <ItemMedia>
                                  <RadioGroupItem id={`scan-studio-order-${choice.primary}`} value={choice.primary} className="mt-0.5" />
                                </ItemMedia>
                                <ItemContent>
                                  <ItemTitle>
                                    <Label htmlFor={`scan-studio-order-${choice.primary}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium">
                                      <EngineName engine={choice.primary} /> en premier, <EngineName engine={choice.fallback} /> en secours
                                    </Label>
                                  </ItemTitle>
                                  <ItemDescription className="line-clamp-none text-pretty">{choice.description}</ItemDescription>
                                </ItemContent>
                              </Item>
                            ))}
                          </ItemGroup>
                        </RadioGroup>
                      ) : currentChoice ? (
                        <Item variant="outline" className="items-start">
                          <ItemContent>
                            <ItemTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <EngineName engine={currentChoice.primary} /> en premier, <EngineName engine={currentChoice.fallback} /> en secours
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none text-pretty">{currentChoice.description}</ItemDescription>
                          </ItemContent>
                        </Item>
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucun ordre n’est enregistré.</p>
                      )}
                      {!isAdmin && <p className="text-xs text-muted-foreground">Les clés, les plafonds et l’ordre des moteurs sont réglés par un administrateur.</p>}
                    </CardContent>
                  </Card>

                  <DetectorSettings isAdmin={isAdmin} />
                </div>

                <section className="flex min-w-0 flex-col gap-3" aria-labelledby="scan-studio-engine-list">
                  <div className="space-y-1">
                    <h3 id="scan-studio-engine-list" className="text-base font-semibold">
                      Moteurs de traduction
                    </h3>
                    <p className="text-sm text-muted-foreground">Dans l’ordre où ils sont appelés. Le texte des bulles part chez le moteur qui traduit.</p>
                  </div>
                  <div className="grid gap-4">
                    <AnimatePresence initial={false}>
                      {engines.map((engine) => (
                        <motion.div key={engine.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                          <EngineRow engine={engine} rankLabel={engine.id === "mymemory" ? "Sans clé, en dernier" : rankOf(order, engine.id) === 0 ? "Moteur principal" : "Moteur de secours"} isAdmin={isAdmin} onSaved={store} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </ModuleShell>
    </MotionConfig>
  );
}

function rankOf(order: TranslationEngineId[], id: TranslationEngineId): number {
  const rank = order.indexOf(id);
  return rank < 0 ? order.length : rank;
}

/** Les deux moteurs, avant leur arrivée : même gabarit que les lignes. */
function EnginesSkeleton() {
  return (
    <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-hidden>
      <div className="flex flex-col gap-3 rounded-xl border p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="grid gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 rounded" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-64" />
          </div>
        ))}
      </div>
    </div>
  );
}

function timeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString("fr-FR", sameDay ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" });
}

/** Consommation du jour, face au quota journalier d'un service qui en a un. */
function DailyUsageLine({ engine, dailyLimit }: { engine: EngineStatus; dailyLimit: number }) {
  const { day, month } = engine.usage;
  const ratio = Math.min(1, day / dailyLimit);
  const reached = day >= dailyLimit;
  return (
    <div className="flex max-w-xl flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label={`Consommation du jour de ${engine.label}`}
        aria-valuemin={0}
        aria-valuemax={dailyLimit}
        aria-valuenow={Math.min(day, dailyLimit)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", reached ? "bg-destructive" : ratio >= WARNING_RATIO ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        Aujourd’hui : {formatNumber(day)} caractères sur {formatNumber(dailyLimit)} · ce mois : {formatNumber(month)}
      </p>
      {reached && <p className="text-xs text-destructive">Quota du jour atteint : ce moteur est mis de côté jusqu’à demain.</p>}
    </div>
  );
}

/** Consommation du jour et du mois, face au plafond mensuel. */
function UsageLine({ engine }: { engine: EngineStatus }) {
  if (engine.dailyLimit) return <DailyUsageLine engine={engine} dailyLimit={engine.dailyLimit} />;
  const { day, month } = engine.usage;
  const limit = engine.monthlyLimit;
  const ratio = limit > 0 ? Math.min(1, month / limit) : 0;
  const reached = limit > 0 && month >= limit;
  const warning = limit > 0 && !reached && ratio >= WARNING_RATIO;

  return (
    <div className="flex max-w-xl flex-col gap-1.5">
      {limit > 0 && (
        <div
          role="progressbar"
          aria-label={`Consommation mensuelle de ${engine.label}`}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(month, limit)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", reached ? "bg-destructive" : warning ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground tabular-nums">
        Aujourd’hui : {formatNumber(day)} caractères · ce mois : {formatNumber(month)}
        {limit > 0 ? ` sur ${formatNumber(limit)}` : " caractères, sans plafond"}
      </p>
      {warning && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {Math.round(ratio * 100)} % du plafond mensuel sont consommés : au plafond, ce moteur est mis de côté jusqu’au mois suivant.
        </p>
      )}
      {reached && <p className="text-xs text-destructive">Plafond mensuel atteint : ce moteur est mis de côté jusqu’au mois suivant.</p>}
    </div>
  );
}

interface EngineRowProps {
  engine: EngineStatus;
  /** « Moteur principal » ou « Moteur de secours ». */
  rankLabel: string;
  isAdmin: boolean;
  onSaved: (catalogue: EngineCatalogue) => void;
}

function EngineRow({ engine, rankLabel, isAdmin, onSaved }: EngineRowProps) {
  const paused = engine.pausedUntil !== undefined && engine.pausedUntil > Date.now();
  const access =
    engine.id === "deepl"
      ? engine.keyHint
        ? `Clé se terminant par ${engine.keyHint}`
        : null
      : [engine.url, engine.keyHint ? `clé se terminant par ${engine.keyHint}` : null].filter(Boolean).join(" · ") || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <EngineLogo engine={engine.id} className="size-6" />
          <h4>{engine.label || ENGINE_NAMES[engine.id]}</h4>
        </CardTitle>
        <CardDescription>{rankLabel}</CardDescription>
        <CardAction>
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm",
              engine.available ? "text-emerald-700 dark:text-emerald-300" : engine.configured ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
            )}
          >
            {engine.available ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <XCircle aria-hidden className="h-4 w-4" />}
            {engine.available ? "Disponible" : engine.configured ? "Indisponible" : "Non configuré"}
          </p>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {access && <p className="break-all font-mono text-xs text-muted-foreground">{access}</p>}
        {!engine.available && engine.reason && <p className="text-sm">{engine.reason}</p>}
        {paused && engine.pausedUntil !== undefined && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Mis de côté après des échecs répétés, jusqu’à {timeLabel(engine.pausedUntil)}. Une seule requête d’essai décidera alors de sa remise en service.
          </p>
        )}
        <UsageLine engine={engine} />
      </CardContent>
      {isAdmin && (
        <CardContent className="border-t pt-6">
          <EngineForm engine={engine} onSaved={onSaved} />
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Réglages de MyMemory : rien n'est obligatoire. Une adresse de contact, si on
 * en donne une, élève le quota du jour chez le service.
 */
function MyMemoryForm({ engine, onSaved }: { engine: EngineStatus; onSaved: (catalogue: EngineCatalogue) => void }) {
  const saved = engine.contactEmail ?? "";
  const [email, setEmail] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => setEmail(saved), [saved]);
  const dirty = email.trim() !== saved;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      onSaved(await api.saveEngineSettings({ myMemoryEmail: email.trim() }));
      setTest(null);
      toast.success(email.trim() ? "Adresse de contact enregistrée" : "Adresse de contact retirée");
    } catch (error) {
      toast.error(errorMessage(error, "Ces réglages n’ont pas pu être enregistrés."));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.testEngine(engine.id));
    } catch (error) {
      toast.error(errorMessage(error, "Essai impossible."));
    } finally {
      setTesting(false);
    }
  };

  const id = `scan-studio-engine-${engine.id}`;
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Service public de Translated, utilisable sans clé : c’est lui qui traduit tant qu’aucun autre moteur n’est réglé. Il ne prend qu’une phrase par
        requête : une page part donc bulle après bulle, avec une seconde entre deux. Le texte des bulles est envoyé à ce service.
      </p>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-email`}>Adresse de contact (facultative)</Label>
        <Input
          id={`${id}-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="vous@exemple.org"
          autoComplete="off"
          spellCheck={false}
          className="h-9 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Sans adresse, MyMemory accorde 5 000 caractères par jour ; avec une adresse, 50 000. Elle est jointe à chaque requête : n’en mettez une que si
          cela vous convient.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className="gap-2" disabled={!dirty || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={testing || dirty} onClick={() => void runTest()} title="Envoie une courte phrase d’essai à ce moteur">
          {testing && <Loader2 className="h-4 w-4 animate-spin" />}
          Tester
        </Button>
        {test && (
          <p className={cn("flex items-center gap-1.5 text-xs", test.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")} aria-live="polite">
            {test.ok ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0" /> : <XCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />}
            {test.message}
          </p>
        )}
      </div>
    </form>
  );
}

/** Réglages d'un moteur, réservés aux administrateurs : clé, adresse, plafond, essai. */
function EngineForm({ engine, onSaved }: { engine: EngineStatus; onSaved: (catalogue: EngineCatalogue) => void }) {
  if (engine.id === "mymemory") return <MyMemoryForm engine={engine} onSaved={onSaved} />;
  return <KeyedEngineForm engine={engine} onSaved={onSaved} />;
}

function KeyedEngineForm({ engine, onSaved }: { engine: EngineStatus; onSaved: (catalogue: EngineCatalogue) => void }) {
  const isDeepl = engine.id === "deepl";
  const [key, setKey] = useState("");
  const [url, setUrl] = useState(engine.url ?? "");
  const [limit, setLimit] = useState(String(engine.monthlyLimit));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  // Ce que le serveur vient de rendre remplace les champs qui ne portent pas de secret.
  useEffect(() => {
    setUrl(engine.url ?? "");
    setLimit(String(engine.monthlyLimit));
  }, [engine.url, engine.monthlyLimit]);

  const parsedLimit = Number(limit.replace(/\s/g, ""));
  const limitValid = limit.trim() !== "" && Number.isInteger(parsedLimit) && parsedLimit >= 0;
  const urlChanged = !isDeepl && url.trim() !== (engine.url ?? "");
  const limitChanged = limitValid && parsedLimit !== engine.monthlyLimit;
  const dirty = key.trim() !== "" || urlChanged || limitChanged;

  const save = async (patch: EngineSettingsPatch, message: string) => {
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await api.saveEngineSettings(patch));
      setKey("");
      setTest(null);
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || !limitValid) return;
    // Un champ laissé tel quel n'est pas envoyé : le serveur ne le modifie pas.
    const patch: EngineSettingsPatch = {};
    if (key.trim()) patch[isDeepl ? "deeplKey" : "libreTranslateKey"] = key.trim();
    if (urlChanged) patch.libreTranslateUrl = url.trim();
    if (limitChanged) patch.monthlyLimits = { [engine.id]: parsedLimit };
    void save(patch, `Réglages de ${engine.label} enregistrés`);
  };

  const clearKey = () => void save(isDeepl ? { deeplKey: "" } : { libreTranslateKey: "" }, `Clé ${engine.label} retirée`);

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.testEngine(engine.id));
    } catch (error) {
      toast.error(errorMessage(error, "Essai impossible."));
    } finally {
      setTesting(false);
    }
  };

  /** Une lecture, d'un clic : le quota du compte, demandé au service. */
  const readUsage = async () => {
    if (testing) return;
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.readEngineUsage(engine.id));
    } catch (error) {
      toast.error(errorMessage(error, "Lecture du quota impossible."));
    } finally {
      setTesting(false);
    }
  };

  const id = `scan-studio-engine-${engine.id}`;

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      {!isDeepl && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-url`}>Adresse du service</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="http://libretranslate:5000"
            autoComplete="off"
            spellCheck={false}
            className="h-9 font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">L’adresse de votre instance LibreTranslate. Vide, le moteur n’est plus utilisé.</p>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-key`}>{isDeepl ? "Clé d’API" : "Clé d’API (facultative)"}</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-key`}
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={engine.keyHint ? "Remplacer la clé enregistrée" : "Coller la clé"}
            autoComplete="off"
            spellCheck={false}
            className="h-9 font-mono text-xs"
          />
          {engine.keyHint && (
            <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" disabled={saving} onClick={clearKey}>
              Retirer la clé
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          La clé reste sur le serveur : cette page n’en montre jamais que les quatre derniers caractères. Si le serveur la tient d’une variable
          d’environnement, il refusera de la remplacer ici et dira pourquoi.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-limit`}>Plafond mensuel, en caractères</Label>
        <Input
          id={`${id}-limit`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          aria-invalid={!limitValid}
          className="h-9 w-44 tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          Passé ce nombre de caractères envoyés dans le mois, le moteur est mis de côté jusqu’au mois suivant. 0 : aucun plafond.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!dirty || !limitValid || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!engine.configured || testing || dirty}
          onClick={() => void runTest()}
          title={dirty ? "Enregistrez d’abord vos changements" : "Envoie une courte phrase d’essai à ce moteur"}
        >
          {testing && <Loader2 className="h-4 w-4 animate-spin" />}
          Tester
        </Button>
        {isDeepl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!engine.configured || testing || dirty}
            onClick={() => void readUsage()}
            title={dirty ? "Enregistrez d’abord vos changements" : "Demande à DeepL ce que le compte a consommé : une requête, aucun texte envoyé"}
          >
            Lire le quota
          </Button>
        )}
        {test && (
          <p className={cn("flex items-center gap-1.5 text-xs", test.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")} aria-live="polite">
            {test.ok ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0" /> : <XCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />}
            {test.message}
          </p>
        )}
      </div>
    </form>
  );
}
