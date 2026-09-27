"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AudioLines, ExternalLink, Eye, EyeOff, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import type { ProviderStatus } from "../lib/cloud-tts";
import type { VoiceStatus } from "../lib/tts";
import { callModule } from "../lib/client";

const DESCRIPTIONS: Record<ProviderStatus["id"], string> = {
  openai: "Neuf voix naturelles qui parlent français (modèle gpt-4o-mini-tts).",
  google: "Voix françaises Neural2, WaveNet et Studio. Activez l’API Cloud Text-to-Speech sur le projet de la clé.",
  elevenlabs: "Les voix de votre compte ElevenLabs, lues avec le modèle multilingue.",
};

/**
 * Clés des voix en ligne. Les fonctions appelées sont réservées aux admins :
 * un autre compte voit seulement un message.
 */
export default function VoicesPage() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [voices, setVoices] = useState<VoiceStatus[]>([]);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      // Les voix d'abord : les lister vérifie les clés et note leurs erreurs.
      const info = await callModule<{ voices: VoiceStatus[] }>("getVoices");
      setVoices(info.voices);
      setProviders(await callModule<ProviderStatus[]>("getTtsProviders"));
    } catch {
      setForbidden(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Retour aux projets">
          <Link href="/m/clip-studio">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <AudioLines className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Voix en ligne</h1>
          <p className="text-sm text-muted-foreground">
            Des voix plus naturelles que Piper, payées à l’usage chez chaque fournisseur.
          </p>
        </div>
      </header>

      <Alert>
        <TriangleAlert className="h-4 w-4" />
        <AlertDescription>
          Avec une voix en ligne, le texte à lire est envoyé au fournisseur choisi. Piper reste
          disponible, gratuit et entièrement local.
        </AlertDescription>
      </Alert>

      {forbidden ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          Les clés des voix en ligne se règlent depuis un compte administrateur.
        </p>
      ) : providers === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              voiceCount={voices.filter((voice) => voice.provider === provider.id).length}
              onSaved={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  voiceCount,
  onSaved,
}: {
  provider: ProviderStatus;
  voiceCount: number;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await callModule("saveTtsKey", { provider: provider.id, key: draft });
      setDraft("");
      await onSaved();
      toast.success(draft ? "Clé enregistrée" : "Clé supprimée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border p-4">
      <Field>
        <div className="flex flex-wrap items-center gap-2">
          <FieldLabel htmlFor={`tts-key-${provider.id}`} className="flex flex-wrap items-center gap-2">
            {provider.label}
            {provider.configured && (
              <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
                {provider.fromEnv ? (
                  <>
                    <Lock className="h-2.5 w-2.5" />
                    {provider.envVariable}
                  </>
                ) : (
                  provider.hint
                )}
              </Badge>
            )}
            {provider.configured && !provider.error && (
              <span className="text-xs font-normal text-muted-foreground">
                {voiceCount} voix disponible{voiceCount > 1 ? "s" : ""}
              </span>
            )}
          </FieldLabel>
          <a
            href={provider.site}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            Obtenir une clé
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <FieldDescription>{DESCRIPTIONS[provider.id]}</FieldDescription>

        {provider.error && <p className="text-xs text-destructive">{provider.error}</p>}

        {provider.fromEnv ? (
          <FieldDescription>
            Définie par l’environnement du serveur ({provider.envVariable}). Retirez la variable pour
            gérer la clé depuis cette page.
          </FieldDescription>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <InputGroup className="flex-1">
              <InputGroupInput
                id={`tts-key-${provider.id}`}
                type={revealed ? "text" : "password"}
                autoComplete="off"
                placeholder={provider.configured ? "Nouvelle clé, pour remplacer l’actuelle" : "Coller la clé…"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={revealed ? "Masquer la clé" : "Afficher la clé"}
                  onClick={() => setRevealed((previous) => !previous)}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <Button variant="outline" disabled={busy || (!draft && !provider.configured)} onClick={save}>
              {busy && <Spinner className="mr-1.5 h-3 w-3" />}
              {draft ? "Enregistrer" : provider.configured ? "Supprimer la clé" : "Enregistrer"}
            </Button>
          </div>
        )}
      </Field>
    </section>
  );
}
