"use client";

import { useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo, type Brand } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ModuleShell } from "../components/module-shell";
import { callModule, useCatalogue } from "../lib/client";
import type { Catalogue, KeyName } from "../lib/types";

const KEYS: { name: KeyName; brand: Brand; title: string; description: string; href: string; hrefLabel: string }[] = [
  {
    name: "saucenao",
    brand: "saucenao",
    title: "SauceNAO",
    description: "Indispensable pour intégrer ses résultats : SauceNAO refuse les appels sans compte. La clé est gratuite, avec une limite quotidienne.",
    href: "https://saucenao.com/user.php?page=search-api",
    hrefLabel: "Obtenir une clé sur saucenao.com",
  },
  {
    name: "serpapi",
    brand: "serpapi",
    title: "SerpApi",
    description:
      "Google Lens et Yandex n’ont pas d’API ouverte. SerpApi, un service tiers, les interroge pour vous : avec sa clé, leurs résultats s’affichent dans la page. Sans elle, ces deux moteurs s’ouvrent dans un onglet. Une offre gratuite limitée existe.",
    href: "https://serpapi.com/manage-api-key",
    hrefLabel: "Obtenir une clé sur serpapi.com",
  },
  {
    name: "tracemoe",
    brand: "tracemoe",
    title: "trace.moe",
    description: "Facultative : trace.moe répond sans clé, avec un quota mensuel par adresse. Une clé de soutien le relève.",
    href: "https://www.patreon.com/soruly",
    hrefLabel: "Soutenir trace.moe",
  },
];

function KeyCard({
  entry,
  status,
  onSaved,
}: {
  entry: (typeof KEYS)[number];
  status: Catalogue["keys"][KeyName] | undefined;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: string) => {
    setSaving(true);
    try {
      await callModule("saveKey", entry.name, next);
      setValue("");
      toast.success(next ? `Clé ${entry.title} enregistrée` : `Clé ${entry.title} retirée`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2.5">
        <BrandLogo brand={entry.brand} className="size-5 rounded-sm" />
        <h3 className="text-sm font-semibold">{entry.title}</h3>
        <span
          className={cn(
            "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
            status?.configured ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
          )}
        >
          {status?.configured && <Check className="h-3 w-3" />}
          {status?.configured ? (status.fromEnv ? "Fournie par l’environnement" : "Clé enregistrée") : "Aucune clé"}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{entry.description}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) void save(value.trim());
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={status?.fromEnv || saving}
          placeholder={status?.fromEnv ? "Définie par une variable d’environnement" : status?.configured ? "Remplacer la clé" : "Coller la clé"}
          className="h-9 font-mono text-xs"
        />
        <Button type="submit" size="sm" className="h-9" disabled={!value.trim() || saving || status?.fromEnv}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
        {status?.configured && !status.fromEnv && (
          <Button type="button" variant="ghost" size="sm" className="h-9" disabled={saving} onClick={() => void save("")}>
            Retirer
          </Button>
        )}
      </form>
      <a href={entry.href} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline">
        {entry.hrefLabel}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function SettingsPage() {
  const { catalogue, reload } = useCatalogue();

  return (
    <ModuleShell current="settings">
      <div className="grid gap-8 xl:grid-cols-2">
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Moteurs</h2>
            <p className="text-sm text-muted-foreground">
              Ce que chaque moteur sait retrouver, et la façon dont il répond aujourd’hui sur cette instance.
            </p>
          </div>
          <ul className="divide-y rounded-xl border">
            {(catalogue?.engines ?? []).map((engine) => (
              <li key={engine.id} className="flex items-start gap-3 p-3">
                <BrandLogo brand={engine.brand} className="mt-0.5 size-5 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{engine.name}</p>
                  <p className="text-xs text-muted-foreground">{engine.description}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    engine.inlineReady
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : engine.inline === "none"
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  )}
                >
                  {engine.inlineReady ? "Résultats dans la page" : engine.inline === "none" ? "Onglet uniquement" : "Onglet, ou clé à ajouter"}
                </span>
              </li>
            ))}
            {!catalogue && <li className="p-4 text-sm text-muted-foreground">Chargement…</li>}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">
            TinEye, ascii2d et Bing n’offrent pas d’accès gratuit à leurs résultats : ils s’ouvrent toujours dans un onglet, avec
            l’image déjà transmise.
          </p>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <KeyRound className="h-4 w-4" />
              Clés d’API
            </h2>
            <p className="text-sm text-muted-foreground">
              Réservées aux administrateurs. Elles restent sur le serveur et ne sont jamais renvoyées au navigateur.
            </p>
          </div>
          {KEYS.map((entry) => (
            <KeyCard key={entry.name} entry={entry} status={catalogue?.keys[entry.name]} onSaved={reload} />
          ))}
        </section>
      </div>
    </ModuleShell>
  );
}
