"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileImage, Link2, MessageSquareText, Paperclip, ScanText, Shield, Sparkles } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { LinkPendingIcon, LoadingState, Orb, ShimmerText, ThinkingStatus } from "@/components/loading";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BenchCell, BenchGrid, ReplayButton } from "./bench-parts";

const ROTATING_MESSAGES = ["Lecture de l’image…", "Recherche des couleurs dominantes…", "Mise en page du résultat…"] as const;

const INTERVALS = [
  { value: "1200", label: "1,2 s" },
  { value: "2400", label: "2,4 s" },
  { value: "4000", label: "4 s" },
];

type AttachmentState = "idle" | "uploading" | "processing" | "error" | "done";

const ATTACHMENTS: { state: AttachmentState; title: string; detail: string }[] = [
  { state: "uploading", title: "exemple.png", detail: "Envoi en cours" },
  { state: "processing", title: "exemple.png", detail: "Traitement en cours" },
  { state: "error", title: "exemple.png", detail: "Envoi impossible" },
  { state: "done", title: "exemple.png", detail: "Prêt" },
  { state: "idle", title: "Déposer un fichier", detail: "Case vide" },
];

export function TextsTab() {
  return (
    <div className="grid min-w-0 gap-6">
      <ShimmerPanel />
      <ThinkingPanel />
      <LoadingStatePanel />
      <AttachmentPanel />
      <LinkPanel />
    </div>
  );
}

function ShimmerPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={Sparkles}
        title="Texte scintillant"
        description="Un reflet traverse le texte d’attente ; seul ou à côté d’une orbe, dans toutes les tailles de texte."
      />
      <PanelBody>
        <BenchGrid>
          <BenchCell name="ShimmerText" props={`className="text-sm font-medium"`} note="Libellé de LoadingState.">
            <ShimmerText className="text-sm font-medium">Chargement…</ShimmerText>
          </BenchCell>
          <BenchCell name="Orb + ShimmerText" props={`Orb size="sm" state="connecting"`} note="Connexion d’un compte, en attente du service.">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <Orb size="sm" state="connecting" className="text-primary" />
              <ShimmerText className="min-w-0">En attente du service…</ShimmerText>
            </p>
          </BenchCell>
          <BenchCell
            name="ShimmerText"
            props={`className="min-w-0 truncate text-xs text-muted-foreground" title`}
            note="Étape d’un travail de fond, tronquée avec son texte complet en infobulle."
          >
            <span className="flex w-40 max-w-full min-w-0">
              <ShimmerText className="min-w-0 truncate text-xs text-muted-foreground" title="Transcription de la piste audio, étape 2 sur 3…">
                Transcription de la piste audio, étape 2 sur 3…
              </ShimmerText>
            </span>
          </BenchCell>
          <BenchCell name="shimmer" props={`className="text-2xl font-semibold shimmer"`} note="L’utilitaire seul, sur un grand titre (outil « Origine d’une image »).">
            <p className="text-2xl font-semibold shimmer">Lecture du fichier…</p>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function ThinkingPanel() {
  const [interval, setIntervalValue] = useState("2400");
  const [percent, setPercent] = useState(0);
  // Avancement de démonstration : un message mis à jour sur place, sans relais.
  useEffect(() => {
    const timer = window.setInterval(() => setPercent((current) => (current >= 100 ? 0 : current + 2)), 250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Panel>
      <PanelHeader
        icon={MessageSquareText}
        title="Ligne d’état"
        description="ThinkingStatus : une petite orbe et un texte qui scintille ; plusieurs messages se relaient sans rien pousser autour."
        actions={
          <ToggleGroup type="single" variant="outline" size="sm" value={interval} onValueChange={(next) => next && setIntervalValue(next)} aria-label="Durée de chaque message">
            {INTERVALS.map((entry) => (
              <ToggleGroupItem key={entry.value} value={entry.value}>
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      <PanelBody>
        <BenchGrid wide>
          <BenchCell name="ThinkingStatus" props={`messages={[…3]} interval={${interval}}`} note="Messages qui se relaient, au rythme choisi en haut du panneau.">
            <ThinkingStatus messages={ROTATING_MESSAGES} interval={Number(interval)} />
          </BenchCell>
          <BenchCell name="ThinkingStatus" props={`messages="Démarrage de l’assistant…" state="composing"`} note="Un seul message (Image de marque).">
            <ThinkingStatus messages="Démarrage de l’assistant…" state="composing" />
          </BenchCell>
          <BenchCell
            name="ThinkingStatus"
            props={`messages={\`Lecture de la page… \${percent} %\`} state="solving"`}
            note="Avancement réel : le texte change sur place (lecture OCR de Scan Studio)."
          >
            <ThinkingStatus
              state="solving"
              className="gap-1.5 text-xs whitespace-nowrap text-muted-foreground"
              messages={percent < 10 ? "Préparation de la lecture…" : `Lecture de la page… ${percent} %`}
            />
          </BenchCell>
          <BenchCell name="ThinkingStatus" props={`state="listening" className="text-xs text-muted-foreground"`} note="Relecture d’une voix (Clip Studio).">
            <ThinkingStatus messages="Relecture en cours…" state="listening" className="text-xs text-muted-foreground" />
          </BenchCell>
          <BenchCell name="ThinkingStatus" props="hideOrb" note="Sans orbe, quand une autre est déjà affichée à côté.">
            <ThinkingStatus messages={ROTATING_MESSAGES} interval={Number(interval)} hideOrb />
          </BenchCell>
          <BenchCell name="ThinkingStatus" props={`className="w-44"`} note="Place étroite : le message se tronque, son texte complet reste en infobulle.">
            <ThinkingStatus messages={ROTATING_MESSAGES} interval={Number(interval)} state="weaving" className="w-44" />
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function LoadingStatePanel() {
  const [round, setRound] = useState(0);
  return (
    <Panel>
      <PanelHeader
        icon={ScanText}
        title="Zone en attente"
        description="LoadingState : l’orbe et son texte au centre d’une zone entière ; par défaut, il n’apparaît qu’après un court délai, en fondu."
        actions={<ReplayButton onReplay={() => setRound((value) => value + 1)} />}
      />
      <PanelBody>
        <BenchGrid wide key={round}>
          <BenchCell name="LoadingState" note="Par défaut : délai et fondu, orbe lg « searching », « Chargement… »." stageClassName="items-stretch">
            <LoadingState className="w-full" />
          </BenchCell>
          <BenchCell name="LoadingState" props={`size="md" label="Chargement des albums…"`} note="Dans une fenêtre (ajout à un album)." stageClassName="items-stretch">
            <LoadingState size="md" label="Chargement des albums…" className="w-full py-6 sm:py-8" />
          </BenchCell>
          <BenchCell name="LoadingState" props={`state="shaping" size="md"`} note="Ouverture d’un module ou de ses réglages." stageClassName="items-stretch">
            <LoadingState label="Chargement de l’interface…" state="shaping" size="md" className="w-full py-10" />
          </BenchCell>
          <BenchCell name="LoadingState" props={`description="…"`} note="Précision sous le texte (aucun écran ne s’en sert encore)." stageClassName="items-stretch">
            <LoadingState label="Analyse de la vidéo…" description="Environ une minute pour une vidéo de dix minutes." state="solving" className="w-full" />
          </BenchCell>
          <BenchCell name="LoadingState" props="delayed={false}" note="Sans délai : prend la suite d’une attente de route (pages des modules)." stageClassName="items-stretch">
            <LoadingState delayed={false} className="w-full" />
          </BenchCell>
          <BenchCell
            name="LoadingState"
            props={`size="md" className="rounded-xl border border-border/60 bg-muted/20"`}
            note="À la place d’une liste (clés API)."
            stageClassName="items-stretch"
          >
            <LoadingState size="md" label="Chargement des clés API…" className="w-full rounded-xl border border-border/60 bg-muted/20" />
          </BenchCell>
          <BenchCell name="LoadingState" props={`size="md" className="aspect-[2/1] w-full rounded-xl border"`} note="Repli de Suspense, même boîte que la carte attendue (statistiques réseau)." stageClassName="items-stretch">
            <LoadingState size="md" className="aspect-[2/1] w-full rounded-xl border" />
          </BenchCell>
          <BenchCell name="LoadingState" props="fill" note="Occupe toute la hauteur disponible : attente par défaut des pages de l’espace." stageClassName="items-stretch">
            <div className="flex h-72 w-full min-w-0 flex-col rounded-lg border bg-background">
              <LoadingState fill label="Ouverture du projet…" state="shaping" />
            </div>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function AttachmentPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={Paperclip}
        title="Fichiers joints"
        description="Attachment : le nom scintille pendant l’envoi et le traitement ; la vignette porte l’indicateur."
      />
      <PanelBody>
        <BenchGrid>
          {ATTACHMENTS.map((entry) => (
            <BenchCell key={entry.state} name="Attachment" props={`state="${entry.state}"`}>
              <Attachment state={entry.state} className="w-full">
                <AttachmentMedia>
                  {entry.state === "uploading" || entry.state === "processing" ? <Spinner aria-hidden className="size-4" /> : <FileImage />}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle title={entry.title}>{entry.title}</AttachmentTitle>
                  <AttachmentDescription>{entry.detail}</AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            </BenchCell>
          ))}
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function LinkPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={Link2}
        title="Liens de navigation"
        description="LinkPendingIcon : l’icône d’un lien devient un Spinner de même taille tant que la page demandée n’est pas là."
      />
      <PanelBody>
        <BenchGrid>
          <BenchCell name="LinkPendingIcon" props="au repos" note="Rendu ordinaire : l’icône du lien.">
            <span className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
              <Shield className="size-4" />
              Administration
            </span>
          </BenchCell>
          <BenchCell name="LinkPendingIcon" props="pending" note="Pendant la navigation : un Spinner prend la place exacte de l’icône.">
            <span className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
              <Spinner aria-hidden className="size-4" />
              Administration
            </span>
          </BenchCell>
          <BenchCell name="LinkPendingIcon" props="dans <Link prefetch={false}>" note="Le vrai composant : un clic ouvre l’administration et quitte ce banc.">
            <Link href="/admin" prefetch={false} className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <LinkPendingIcon>
                <Shield className="size-4" />
              </LinkPendingIcon>
              Administration
            </Link>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}
