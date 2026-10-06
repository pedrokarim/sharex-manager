"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCircle2, Languages, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
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
        <div className="flex flex-col gap-8">
          <div className="flex items-start gap-3">
            <Languages aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Moteurs de traduction</h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Une traduction ne part chez un moteur que d’un clic sur « Traduire », une requête par page, et seulement si le glossaire, la mémoire et le
                cache ne peuvent pas répondre.
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
              <section className="flex flex-col gap-3" aria-labelledby="scan-studio-engine-order">
                <div className="space-y-1">
                  <h3 id="scan-studio-engine-order" className="text-sm font-semibold">
                    Ordre d’appel
                  </h3>
                  <p className="text-sm text-muted-foreground">Le premier moteur traduit ; le second ne sert que si le premier ne répond pas.</p>
                </div>
                {isAdmin ? (
                  <RadioGroup value={primary ?? ""} onValueChange={(next) => void saveOrder(next as TranslationEngineId)} disabled={savingOrder} className="gap-3">
                    {ORDER_CHOICES.map((choice) => (
                      <div key={choice.primary} className="flex items-start gap-3">
                        <RadioGroupItem id={`scan-studio-order-${choice.primary}`} value={choice.primary} className="mt-1" />
                        <Label htmlFor={`scan-studio-order-${choice.primary}`} className="flex flex-col items-start gap-1 font-normal">
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <EngineName engine={choice.primary} /> en premier, <EngineName engine={choice.fallback} /> en secours
                          </span>
                          <span className="max-w-3xl text-xs leading-snug text-muted-foreground">{choice.description}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : currentChoice ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <EngineName engine={currentChoice.primary} /> en premier, <EngineName engine={currentChoice.fallback} /> en secours
                    </p>
                    <p className="max-w-3xl text-xs leading-snug text-muted-foreground">{currentChoice.description}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun ordre n’est enregistré.</p>
                )}
                {!isAdmin && <p className="text-xs text-muted-foreground">Les clés, les plafonds et l’ordre des moteurs sont réglés par un administrateur.</p>}
              </section>

              <ul className="flex flex-col divide-y border-y">
                <AnimatePresence initial={false}>
                  {engines.map((engine) => (
                    <motion.li
                      key={engine.id}
                      layout="position"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="list-none py-5"
                    >
                      <EngineRow engine={engine} rankLabel={rankOf(order, engine.id) === 0 ? "Moteur principal" : "Moteur de secours"} isAdmin={isAdmin} onSaved={store} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
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
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="flex flex-col divide-y border-y">
        {[0, 1].map((index) => (
          <div key={index} className="flex flex-col gap-3 py-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 rounded" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
            <Skeleton className="h-1.5 w-full max-w-xl rounded-full" />
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

/** Consommation du jour et du mois, face au plafond mensuel. */
function UsageLine({ engine }: { engine: EngineStatus }) {
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
    <div className="grid gap-x-10 gap-y-5 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <EngineLogo engine={engine.id} className="size-6" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{engine.label || ENGINE_NAMES[engine.id]}</h3>
            <p className="text-xs text-muted-foreground">{rankLabel}</p>
          </div>
          <p
            className={cn(
              "ml-auto flex items-center gap-1.5 text-sm",
              engine.available ? "text-emerald-700 dark:text-emerald-300" : engine.configured ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
            )}
          >
            {engine.available ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <XCircle aria-hidden className="h-4 w-4" />}
            {engine.available ? "Disponible" : engine.configured ? "Indisponible" : "Non configuré"}
          </p>
        </div>

        {access && <p className="break-all font-mono text-xs text-muted-foreground">{access}</p>}
        {!engine.available && engine.reason && <p className="text-sm">{engine.reason}</p>}
        {paused && engine.pausedUntil !== undefined && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Mis de côté après des échecs répétés, jusqu’à {timeLabel(engine.pausedUntil)}. Une seule requête d’essai décidera alors de sa remise en service.
          </p>
        )}
        <UsageLine engine={engine} />
      </div>

      {isAdmin && <EngineForm engine={engine} onSaved={onSaved} />}
    </div>
  );
}

/** Réglages d'un moteur, réservés aux administrateurs : clé, adresse, plafond, essai. */
function EngineForm({ engine, onSaved }: { engine: EngineStatus; onSaved: (catalogue: EngineCatalogue) => void }) {
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
