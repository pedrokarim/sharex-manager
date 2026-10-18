"use client";

import { useEffect, useState } from "react";
import { Activity, CircleDot, Gauge, Grid3x3, MousePointerClick, RefreshCw, Save, Trash2, Upload, X } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { Orb, type OrbSize, type OrbState } from "@/components/loading";
import { ActiveBeam } from "@/components/motion/active-beam";
import { AssistantAvatar } from "@/components/motion/assistant-avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner, type SpinnerVariant } from "@/components/ui/spinner";
import {
  StepTimeline,
  StepTimelineContent,
  StepTimelineDescription,
  StepTimelineIndicator,
  StepTimelineItem,
  StepTimelineTitle,
  type StepState,
} from "@/components/ui/step-timeline";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BenchCell, BenchGrid } from "./bench-parts";

/** Les états de l'orbe, dans l'ordre et avec le sens donnés par `orb.tsx`. */
const ORB_STATES: { state: OrbState; meaning: string }[] = [
  { state: "working", meaning: "Traitement générique." },
  { state: "searching", meaning: "Chargement d’une page ou de données, recherche." },
  { state: "breathing", meaning: "Attente calme, dans une ligne." },
  { state: "shaping", meaning: "Ouverture d’un module, mise en forme." },
  { state: "composing", meaning: "Génération d’image, de texte, de vidéo." },
  { state: "weaving", meaning: "Traduction, assemblage." },
  { state: "solving", meaning: "Analyse, lecture (OCR), calcul." },
  { state: "listening", meaning: "Voix, audio." },
  { state: "connecting", meaning: "Comptes connectés, publication, synchronisation." },
];

const ORB_SIZES: OrbSize[] = ["xs", "sm", "md", "lg"];

const INKS = {
  primary: { className: "text-primary", label: "Primaire" },
  muted: { className: "text-muted-foreground", label: "Atténuée" },
  foreground: { className: "text-foreground", label: "Texte" },
} as const;

type Ink = keyof typeof INKS;

const SPINNER_VARIANTS: { variant: SpinnerVariant; meaning: string }[] = [
  { variant: "orbit", meaning: "Par défaut : les points du bord tournent, le cœur reste fixe." },
  { variant: "scan", meaning: "Une vague balaie les colonnes de gauche à droite." },
  { variant: "twinkle", meaning: "Les points scintillent dans le désordre." },
  { variant: "pulse", meaning: "Le cœur s’allume, puis le reste." },
];

/** Tailles relevées dans le code (`size-3` dans les petits boutons, `size-6` dans les réglages des modules). */
const SPINNER_SIZES = ["size-3", "size-3.5", "size-4", "size-5", "size-6"];

const STEPS: { state: StepState; title: string; detail: string }[] = [
  { state: "done", title: "Étape terminée", detail: "Trait vert vers la suivante." },
  { state: "running", title: "Étape en cours", detail: "Le Spinner occupe la pastille." },
  { state: "pending", title: "Étape à venir", detail: "Point gris." },
  { state: "error", title: "Étape en erreur", detail: "Le détail passe en rouge." },
  { state: "skipped", title: "Étape passée", detail: "Titre barré." },
];

export function IndicatorsTab() {
  return (
    <div className="grid min-w-0 gap-6">
      <OrbPanel />
      <SpinnerPanel />
      <ButtonPanel />
      <ProgressPanel />
      <ActivityPanel />
    </div>
  );
}

function OrbPanel() {
  const [ink, setInk] = useState<Ink>("primary");
  return (
    <Panel>
      <PanelHeader
        icon={CircleDot}
        title="Orbe"
        description="Attente qui travaille&nbsp;: chaque état se reconnaît à son dessin, dans les quatre tailles."
        actions={
          <ToggleGroup type="single" variant="outline" size="sm" value={ink} onValueChange={(next) => next && setInk(next as Ink)} aria-label="Encre de l’orbe" className="flex-wrap">
            {(Object.keys(INKS) as Ink[]).map((key) => (
              <ToggleGroupItem key={key} value={key}>
                {INKS[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      <PanelBody>
        <BenchGrid>
          {ORB_STATES.map(({ state, meaning }) => (
            <BenchCell key={state} name="Orb" props={`state="${state}" className="${INKS[ink].className}"`} note={meaning}>
              <div className="flex items-end gap-3">
                {ORB_SIZES.map((size) => (
                  <div key={size} className="flex flex-col items-center gap-1.5">
                    <Orb state={state} size={size} className={INKS[ink].className} />
                    <span className="font-mono text-[11px] text-muted-foreground">{size}</span>
                  </div>
                ))}
              </div>
            </BenchCell>
          ))}
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function SpinnerPanel() {
  return (
    <Panel>
      <PanelHeader
        icon={Grid3x3}
        title="Spinner"
        description="Attente courte dans une ligne ou un bouton&nbsp;: une matrice de points qui prend la couleur et la taille du texte."
      />
      <PanelBody>
        <BenchGrid>
          {SPINNER_VARIANTS.map(({ variant, meaning }) => (
            <BenchCell key={variant} name="Spinner" props={`variant="${variant}"`} note={meaning}>
              <div className="flex items-end gap-3">
                {SPINNER_SIZES.map((size) => (
                  <div key={size} className="flex flex-col items-center gap-1.5">
                    <Spinner variant={variant} className={size} />
                    <span className="font-mono text-[11px] text-muted-foreground">{size.replace("size-", "")}</span>
                  </div>
                ))}
              </div>
            </BenchCell>
          ))}
          <BenchCell name="Spinner" props={`className="size-3.5 text-muted-foreground"`} note="Dans une ligne de texte, à la place d’une icône d’état.">
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-3.5 shrink-0" />
              <span className="truncate">Enregistrement…</span>
            </span>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function ButtonPanel() {
  const [loading, setLoading] = useState(true);
  return (
    <Panel>
      <PanelHeader
        icon={MousePointerClick}
        title="Boutons qui travaillent"
        description="Un bouton en attente garde sa taille&nbsp;: le Spinner prend la place de l’icône de tête, ou se pose au centre d’un libellé seul."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="bench-button-loading" checked={loading} onCheckedChange={setLoading} />
            <Label htmlFor="bench-button-loading" className="text-sm font-normal">
              En attente
            </Label>
          </div>
        }
      />
      <PanelBody>
        <BenchGrid>
          <BenchCell name="Button" props="loading" note="Icône de tête&nbsp;: remplacée, le libellé reste lisible.">
            <Button loading={loading}>
              <Save className="size-4" />
              Enregistrer
            </Button>
          </BenchCell>
          <BenchCell name="Button" props="loading" note="Libellé seul&nbsp;: effacé sur place, Spinner au centre.">
            <Button loading={loading}>Publier</Button>
          </BenchCell>
          <BenchCell name="Button" props={`loading variant="outline" size="sm"`}>
            <Button loading={loading} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="size-4" />
              Reconnecter
            </Button>
          </BenchCell>
          <BenchCell name="Button" props={`loading variant="ghost" size="sm"`}>
            <Button loading={loading} variant="ghost" size="sm" className="gap-1.5">
              <X className="size-4" />
              Annuler
            </Button>
          </BenchCell>
          <BenchCell name="Button" props={`loading variant="secondary" size="xs"`}>
            <Button loading={loading} variant="secondary" size="xs">
              <Upload />
              Envoyer
            </Button>
          </BenchCell>
          <BenchCell name="Button" props={`loading variant="destructive" size="lg"`}>
            <Button loading={loading} variant="destructive" size="lg">
              Supprimer
            </Button>
          </BenchCell>
          <BenchCell name="Button" props={`loading variant="outline" size="icon"`}>
            <Button loading={loading} variant="outline" size="icon" aria-label="Supprimer">
              <Trash2 />
            </Button>
          </BenchCell>
          <BenchCell name="Button" props={`loading variant="link"`}>
            <Button loading={loading} variant="link">
              Voir le détail
            </Button>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function ProgressPanel() {
  const [value, setValue] = useState(0);
  // Avancement de démonstration : de 0 à 100 % en boucle, par pas de 5.
  useEffect(() => {
    const timer = window.setInterval(() => setValue((current) => (current >= 100 ? 0 : current + 5)), 300);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Panel>
      <PanelHeader
        icon={Gauge}
        title="Avancement"
        description="Barre déterminée quand le pourcentage est connu&nbsp;; sinon le motif pulsé, faute de barre indéterminée dans Progress."
      />
      <PanelBody>
        <BenchGrid wide>
          <BenchCell name="Progress" props="value={…}" note="Valeur de démonstration qui avance en boucle.">
            <div className="grid w-full min-w-0 gap-1.5">
              <Progress value={value} aria-label="Avancement de démonstration" />
              <span className="text-right text-xs tabular-nums text-muted-foreground">{value}&nbsp;%</span>
            </div>
          </BenchCell>
          <BenchCell name="Progress" props={`value={40} className="h-1.5"`} note="Variante fine des listes d’envois.">
            <Progress value={40} className="h-1.5" aria-label="Avancement à 40&nbsp;%" />
          </BenchCell>
          <BenchCell
            name="Progress"
            props={`value={100} className="h-1.5 animate-pulse"`}
            note="Traitement chez le service, durée inconnue (file d’envois des comptes connectés, publication de Clip Studio)."
          >
            <Progress value={100} className="h-1.5 animate-pulse" aria-label="Traitement en cours" />
          </BenchCell>
          <BenchCell name="StepTimeline" props="StepTimelineItem state=…" note="Frise d’un travail en plusieurs étapes, chaque état une fois." stageClassName="justify-start">
            <StepTimeline className="w-full">
              {STEPS.map((step) => (
                <StepTimelineItem key={step.state} state={step.state}>
                  <StepTimelineIndicator />
                  <StepTimelineContent>
                    <StepTimelineTitle state={step.state}>{step.title}</StepTimelineTitle>
                    <StepTimelineDescription>{step.detail}</StepTimelineDescription>
                  </StepTimelineContent>
                </StepTimelineItem>
              ))}
            </StepTimeline>
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function ActivityPanel() {
  const [busy, setBusy] = useState(true);
  // La lueur de border-beam choisit son thème au premier rendu (sombre côté serveur) : posée après le
  // montage seulement, sinon l’hydratation échoue en thème clair.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const card = (
    <div className="flex w-full max-w-56 min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm">
      {busy ? <Spinner className="size-3.5 shrink-0" /> : <CircleDot className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{busy ? "Travail en cours" : "Au repos"}</span>
    </div>
  );
  return (
    <Panel>
      <PanelHeader
        icon={Activity}
        title="Cartes et assistants au travail"
        description="La lueur du bord et le visage de l’assistant ne s’animent que pendant un travail, jamais au repos."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="bench-activity-busy" checked={busy} onCheckedChange={setBusy} />
            <Label htmlFor="bench-activity-busy" className="text-sm font-normal">
              Au travail
            </Label>
          </div>
        }
      />
      <PanelBody>
        <BenchGrid>
          <BenchCell name="ActiveBeam" props={`active={${busy}}`} note="Carte d’un travail en cours (AI Image Gen, Scan Studio).">
            {mounted ? <ActiveBeam active={busy}>{card}</ActiveBeam> : card}
          </BenchCell>
          <BenchCell name="AssistantAvatar" props={`persona="brand" busy={${busy}}`} note="Assistant de l’Image de marque.">
            <AssistantAvatar persona="brand" busy={busy} size={48} />
          </BenchCell>
          <BenchCell name="AssistantAvatar" props={`persona="clip" busy={${busy}}`} note="Assistant de Clip Studio.">
            <AssistantAvatar persona="clip" busy={busy} size={48} />
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}
