"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, FileUp, Lock, TriangleAlert } from "lucide-react";
import { BrandLogo, type Brand } from "@/components/brand-logo";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getVideoSources, savePexelsKey, savePixabayKey, saveYoutubeCookies, type VideoSourcesStatus } from "../lib/client";
import type { ApiKeyStatus } from "../lib/video-sources";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

/**
 * « Sources vidéo » : cookies YouTube d'un compte dédié, clés Pixabay et Pexels, et Wikimedia Commons (sans clé). Les
 * fonctions appelées sont réservées aux admins ; rien de secret ne revient
 * du serveur, seulement l'état.
 */
export function VideoSourcesSettings() {
  const [status, setStatus] = useState<VideoSourcesStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getVideoSources());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="video-sources-title">
      <div>
        <h2 id="video-sources-title" className="text-base font-semibold tracking-tight">
          Sources vidéo
        </h2>
        <p className="text-sm text-muted-foreground">
          Pour récupérer une vidéo par son adresse (onglet « Adresse » des médias) et pour les vidéos d’illustration.
        </p>
      </div>
      {failed ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">Les sources vidéo n’ont pas pu être lues. Rechargez la page.</p>
      ) : status === null ? (
        <div className="space-y-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : (
        <>
          <YoutubeCookiesCard status={status} onChange={setStatus} />
          <ApiKeyCard
            id="pixabay-key"
            name="Pixabay"
            brand="pixabay"
            description="Vidéos libres de droits pour illustrer un clip, cherchées en premier. La clé est gratuite et immédiate : créez un compte Pixabay, elle s’affiche dans la documentation de l’API."
            status={status.pixabay}
            save={savePixabayKey}
            onChange={setStatus}
          />
          <ApiKeyCard
            id="pexels-key"
            name="Pexels"
            brand="pexels"
            description="Vidéos libres de droits, cherchées après Pixabay. Pexels a suspendu la délivrance de nouvelles clés : une clé déjà obtenue reste utilisable."
            status={status.pexels}
            save={savePexelsKey}
            onChange={setStatus}
          />
          <WikimediaCard />
        </>
      )}
    </section>
  );
}

function YoutubeCookiesCard({ status, onChange }: { status: VideoSourcesStatus; onChange: (status: VideoSourcesStatus) => void }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const fileInput = useRef<HTMLInputElement>(null);
  const cookies = status.youtubeCookies;

  const save = async (text: string | null) => {
    setBusy(true);
    feedback.clear();
    try {
      onChange(await saveYoutubeCookies(text));
      setDraft("");
      feedback.success(text ? "Cookies enregistrés." : "Cookies supprimés.");
    } catch (error) {
      feedback.error(errorMessage(error, "Les cookies n’ont pas pu être enregistrés. Vérifiez le fichier, puis réessayez."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border p-4">
      <Field>
        <div className="flex flex-wrap items-center gap-2">
          <FieldLabel htmlFor="youtube-cookies" className="flex flex-wrap items-center gap-2">
            <BrandLogo brand="youtube" className="size-5" />
            Cookies YouTube
            {cookies.configured && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                {cookies.savedAt ? `Enregistrés le ${dateFormat.format(cookies.savedAt)}` : "Enregistrés"}
              </Badge>
            )}
          </FieldLabel>
        </div>
        <FieldDescription>
          YouTube refuse les téléchargements depuis l’adresse du serveur sans compte connecté. Créez un compte Google{" "}
          <strong>dédié</strong>, jamais votre compte personnel&nbsp;: YouTube peut le bloquer, et ces cookies donnent accès
          à tout le compte. Dans une fenêtre de navigation privée, connectez-le sur youtube.com, exportez les cookies au
          format Netscape (cookies.txt) avec une extension comme « Get cookies.txt LOCALLY », puis fermez la fenêtre sans
          vous déconnecter. Twitch et les liens directs n’en ont pas besoin.
        </FieldDescription>

        {cookies.rejectedAt && (
          <p className="flex items-start gap-1.5 text-xs break-words text-destructive">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            YouTube a refusé ces cookies le {dateFormat.format(cookies.rejectedAt)}&nbsp;: exportez-en de nouveaux.
          </p>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 512 * 1024) {
              feedback.error("Fichier trop lourd (512 Kio au plus) : ce n’est pas un export de cookies.");
              return;
            }
            await save(await file.text());
          }}
        />
        <Textarea
          id="youtube-cookies"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (feedback.state?.tone === "error") feedback.clear();
          }}
          placeholder={cookies.configured ? "Coller de nouveaux cookies pour remplacer les actuels…" : "# Netscape HTTP Cookie File…"}
          autoComplete="off"
          spellCheck={false}
          rows={4}
          className="max-h-48 min-h-20 font-mono text-xs break-all"
        />
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
              <FileUp className="h-4 w-4" />
              Choisir le fichier cookies.txt
            </Button>
            <Button variant="outline" disabled={!draft.trim()} loading={busy && Boolean(draft.trim())} onClick={() => void save(draft)}>
              Enregistrer le texte collé
            </Button>
            {cookies.configured && (
              <Button variant="ghost" className="text-destructive hover:text-destructive sm:ml-auto" disabled={busy} onClick={() => void save(null)}>
                Supprimer les cookies
              </Button>
            )}
          </div>
          <FormStatus state={feedback.state} className="pt-2" />
        </div>
      </Field>
    </section>
  );
}

/** Une banque de vidéos à clé : nom et logo officiel, lien pour obtenir la clé, champ masqué. */
interface KeyCardProps {
  id: string;
  name: string;
  brand: Brand;
  description: string;
  status: ApiKeyStatus;
  save: (key: string) => Promise<VideoSourcesStatus>;
  onChange: (status: VideoSourcesStatus) => void;
}

function ApiKeyCard({ id, name, brand, description, status, save: saveKey, onChange }: KeyCardProps) {
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();

  const save = async () => {
    setBusy(true);
    feedback.clear();
    try {
      onChange(await saveKey(draft));
      setDraft("");
      feedback.success(draft ? "Clé enregistrée." : "Clé supprimée.");
    } catch (error) {
      feedback.error(errorMessage(error, "La clé n’a pas pu être enregistrée. Vérifiez-la, puis réessayez."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border p-4">
      <Field>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FieldLabel htmlFor={id} className="flex min-w-0 flex-wrap items-center gap-2">
            <BrandLogo brand={brand} className="size-5" />
            {name}
            {status.configured && (
              <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
                {status.fromEnv ? (
                  <>
                    <Lock className="h-2.5 w-2.5" />
                    {status.envVariable}
                  </>
                ) : (
                  status.hint
                )}
              </Badge>
            )}
          </FieldLabel>
          <a
            href={status.site}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            Obtenir une clé
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <FieldDescription>{description}</FieldDescription>
        {status.fromEnv ? (
          <FieldDescription>
            Définie par l’environnement du serveur ({status.envVariable}). Retirez la variable pour gérer la clé depuis cette page.
          </FieldDescription>
        ) : (
          <div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <InputGroup className="min-w-0 flex-1">
                <InputGroupInput
                  id={id}
                  type={revealed ? "text" : "password"}
                  autoComplete="off"
                  placeholder={status.configured ? "Nouvelle clé, pour remplacer l’actuelle" : "Coller la clé…"}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (feedback.state?.tone === "error") feedback.clear();
                  }}
                  className="font-mono text-xs"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label={revealed ? "Masquer la clé" : "Afficher la clé"} onClick={() => setRevealed((previous) => !previous)}>
                    {revealed ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <Button variant="outline" loading={busy} disabled={!draft && !status.configured} onClick={save}>
                {draft ? "Enregistrer" : status.configured ? "Supprimer la clé" : "Enregistrer"}
              </Button>
            </div>
            <FormStatus state={feedback.state} className="pt-2" />
          </div>
        )}
      </Field>
    </section>
  );
}

/** Wikimedia Commons : rien à régler, la banque est ouverte. */
function WikimediaCard() {
  return (
    <section className="rounded-xl border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
        <BrandLogo brand="wikimediacommons" className="size-5" />
        Wikimedia Commons
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
          Sans clé
        </Badge>
      </div>
      <p className="mt-1.5 text-sm break-words text-muted-foreground">
        Toujours disponible, en dernier recours de l’assistant : seules les vidéos sous licence libre (CC0, domaine public, CC BY, CC BY-SA) sont proposées,
        réencodées pour le montage, avec leur auteur et leur licence dans la mention.
      </p>
    </section>
  );
}
