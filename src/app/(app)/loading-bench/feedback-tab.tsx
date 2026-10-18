"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheck, FlaskConical, Save, Send, TextCursorInput } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/connections/panel";
import { ActionStatus, FormStatus, useFeedback, type FeedbackState, type FeedbackTone } from "@/components/feedback";
import { DrawnCheck } from "@/components/feedback/drawn-check";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BenchCell, BenchGrid, ReplayButton } from "./bench-parts";

/** Messages des démonstrations : ils décrivent le ton, pas un vrai résultat. */
const MESSAGES: Record<FeedbackTone, string> = {
  success: "Enregistré",
  error: "Le service ne répond pas.",
  info: "Déjà à jour",
};

const TONES: { tone: FeedbackTone; label: string }[] = [
  { tone: "success", label: "Réussite" },
  { tone: "error", label: "Erreur" },
  { tone: "info", label: "Information" },
];

/** Durée de l'attente simulée avant le retour, en millisecondes. */
const SIMULATED_WORK = 1200;

export function FeedbackTab() {
  return (
    <div className="grid min-w-0 gap-6">
      <ActionStatusPanel />
      <FormStatusPanel />
      <DrawnCheckPanel />
    </div>
  );
}

/** Bouton qui « travaille » un instant puis donne son retour à côté de lui. */
function SimulatedAction({ tone, label, icon }: { tone: FeedbackTone; label: string; icon: ReactNode }) {
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = () => {
    feedback.clear();
    setBusy(true);
    timer.current = window.setTimeout(() => {
      setBusy(false);
      feedback[tone](MESSAGES[tone]);
    }, SIMULATED_WORK);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-2">
      <Button variant="outline" size="sm" className="gap-2" loading={busy} onClick={run}>
        {icon}
        {label}
      </Button>
      <ActionStatus state={feedback.state} />
    </div>
  );
}

function ActionStatusPanel() {
  const [round, setRound] = useState(1);
  const stateFor = (tone: FeedbackTone, index: number): FeedbackState => ({ tone, message: MESSAGES[tone], id: round * 10 + index });

  return (
    <Panel>
      <PanelHeader
        icon={CircleCheck}
        title="Retour près du bouton"
        description="ActionStatus : un mot posé à côté de l’action qui l’a produit ; l’attente elle-même est celle du bouton (Button loading)."
        actions={<ReplayButton onReplay={() => setRound((value) => value + 1)} />}
      />
      <PanelBody>
        <BenchGrid>
          {TONES.map(({ tone }, index) => (
            <BenchCell key={tone} name="ActionStatus" props={`state={{ tone: "${tone}" }}`}>
              <ActionStatus state={stateFor(tone, index)} />
            </BenchCell>
          ))}
          <BenchCell name="Button loading → ActionStatus" props={`feedback.success(…)`} note="Simulation : attente d’une seconde, puis réussite qui s’efface seule.">
            <SimulatedAction tone="success" label="Enregistrer" icon={<Save className="size-4" />} />
          </BenchCell>
          <BenchCell name="Button loading → ActionStatus" props={`feedback.error(…)`} note="Simulation : l’erreur reste jusqu’à la prochaine action.">
            <SimulatedAction tone="error" label="Tester" icon={<FlaskConical className="size-4" />} />
          </BenchCell>
          <BenchCell name="Button loading → ActionStatus" props={`feedback.info(…)`} note="Simulation : information neutre.">
            <SimulatedAction tone="info" label="Vérifier" icon={<CircleCheck className="size-4" />} />
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function FormStatusPanel() {
  const [tone, setTone] = useState<FeedbackTone | "none">("error");
  const [round, setRound] = useState(1);
  const state: FeedbackState | null = tone === "none" ? null : { tone, message: formMessage(tone), id: round };

  return (
    <Panel>
      <PanelHeader
        icon={TextCursorInput}
        title="Message de formulaire"
        description="FormStatus : au-dessus du bouton d’envoi, il s’ouvre en poussant doucement la suite ; une erreur arrive avec une brève secousse."
        actions={
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={tone}
              onValueChange={(next) => {
                if (!next) return;
                setTone(next as FeedbackTone | "none");
                setRound((value) => value + 1);
              }}
              aria-label="Ton du message"
              className="flex-wrap"
            >
              <ToggleGroupItem value="none">Aucun</ToggleGroupItem>
              {TONES.map((entry) => (
                <ToggleGroupItem key={entry.tone} value={entry.tone}>
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ReplayButton onReplay={() => setRound((value) => value + 1)} />
          </>
        }
      />
      <PanelBody>
        <BenchGrid wide>
          <BenchCell
            name="FormStatus"
            props={tone === "none" ? "state={null}" : `state={{ tone: "${tone}" }} className="pb-3"`}
            note="Dans un formulaire : le message pousse le bouton d’envoi, puis se referme."
            stageClassName="items-start"
          >
            <div className="grid w-full min-w-0 gap-3">
              <div className="h-9 rounded-md border bg-background" aria-hidden />
              <div>
                <FormStatus state={state} className="pb-3" />
                <Button className="gap-2">
                  <Send className="size-4" />
                  Envoyer
                </Button>
              </div>
            </div>
          </BenchCell>
          {TONES.map((entry) => (
            <BenchCell key={entry.tone} name="FormStatus" props={`state={{ tone: "${entry.tone}" }}`} stageClassName="items-stretch">
              <div className="w-full min-w-0">
                <FormStatus state={{ tone: entry.tone, message: formMessage(entry.tone), id: round }} />
              </div>
            </BenchCell>
          ))}
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}

function formMessage(tone: FeedbackTone) {
  if (tone === "error") return "Envoi impossible : le serveur a refusé la demande.";
  if (tone === "success") return "Réglages enregistrés.";
  return "Ces réglages s’appliquent aux prochains envois.";
}

function DrawnCheckPanel() {
  const [round, setRound] = useState(0);
  return (
    <Panel>
      <PanelHeader
        icon={CircleCheck}
        title="Coche dessinée"
        description="DrawnCheck : le cercle arrive en tournant, puis la coche se trace ; c’est l’icône de réussite des deux retours."
        actions={<ReplayButton onReplay={() => setRound((value) => value + 1)} />}
      />
      <PanelBody>
        <BenchGrid key={round}>
          <BenchCell name="DrawnCheck" props={`className="size-3.5"`} note="Taille d’ActionStatus.">
            <DrawnCheck className="size-3.5 text-emerald-700 dark:text-emerald-400" />
          </BenchCell>
          <BenchCell name="DrawnCheck" props={`className="size-4"`} note="Taille de FormStatus.">
            <DrawnCheck className="size-4 text-emerald-700 dark:text-emerald-400" />
          </BenchCell>
          <BenchCell name="DrawnCheck" props={`className="size-10 text-primary"`} note="Agrandie, pour regarder le tracé.">
            <DrawnCheck className="size-10 text-primary" />
          </BenchCell>
        </BenchGrid>
      </PanelBody>
    </Panel>
  );
}
