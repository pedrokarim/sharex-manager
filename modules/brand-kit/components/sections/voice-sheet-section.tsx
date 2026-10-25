"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { ThinkingStatus } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type VoiceDraftJob } from "../../lib/client";
import type { BrandKit } from "../../lib/types";
import {
  VOICE_SHEET_FIELDS,
  VOICE_SHEET_LIMITS,
  emptyVoiceSheet,
  isAnswered,
  voiceSheetProgress,
  type VoiceSheet,
  type VoiceSheetDraft,
  type VoiceSheetField,
} from "../../lib/voice-sheet";
import { CountedTextarea, Field, FieldGroup, SectionHeading, SteppedSliderField, StringListEditor } from "../fields";
import type { SectionProps } from "./types";

/** Nom court de chaque réponse, pour relire une proposition. */
const FIELD_NAMES: Record<VoiceSheetField, string> = {
  pitch: "Ce que vous faites",
  audience: "Pour qui",
  words: "Vos mots",
  bannedWords: "Mots que vous n’employez jamais",
  stands: "Ce que vous défendez",
  against: "Ce contre quoi vous vous battez",
  proofs: "Vos preuves",
  asks: "Ce que vous demandez",
};

const PACE = VOICE_SHEET_LIMITS.wordsPerMinute;
const formatPace = (value: number) => `${value} mots/min`;

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Fiche de voix du créateur (dossier 01 illustrations, étape S1) : huit
 * questions courtes, chacune avec un exemple, et son débit. L’assistant de
 * Clip Studio la reçoit avec chaque script de la marque. « Proposer à partir
 * de mes textes » en prépare un brouillon, relu avant d’entrer dans la fiche.
 */
export function VoiceSheetSection({ kit, update }: SectionProps) {
  const sheet = kit.voiceSheet ?? emptyVoiceSheet();
  const { answered, total } = voiceSheetProgress(kit.voiceSheet);
  const [drafting, setDrafting] = useState(false);
  const taken = useFeedback({ successDuration: 4000 });

  const set = <K extends keyof VoiceSheet>(key: K, value: VoiceSheet[K]) =>
    update((draft) => ({ ...draft, voiceSheet: { ...(draft.voiceSheet ?? emptyVoiceSheet()), [key]: value } }));

  const take = (patch: Partial<VoiceSheetDraft>) => {
    update((draft) => ({ ...draft, voiceSheet: { ...(draft.voiceSheet ?? emptyVoiceSheet()), ...patch } }));
    setDrafting(false);
    const count = Object.keys(patch).length;
    taken.success(`${count} réponse${count > 1 ? "s" : ""} reprise${count > 1 ? "s" : ""} : relisez-les, elles sont à vous.`);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Voix du créateur"
        text="Ce que l’assistant de Clip Studio sait de vous pour écrire des scripts que vous auriez pu dire : vos mots, vos combats, vos vrais chiffres. Une dizaine de minutes, à revoir quand votre offre change."
      />

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex shrink-0 items-center gap-3">
          <Progress value={(answered / total) * 100} aria-label="Questions remplies" className="h-1.5 w-16 shrink-0" />
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {answered} sur {total} questions
          </span>
        </div>
        <Button size="sm" variant="outline" className="ml-auto gap-2" onClick={() => setDrafting(true)}>
          <Sparkles className="size-4" />
          Proposer à partir de mes textes
        </Button>
        <ActionStatus state={taken.state} className="basis-full" />
      </div>

      <FieldGroup title="Ce que vous faites" text="Deux phrases que l’assistant relit avant chaque script.">
        <Field label="Que faites-vous, en une phrase ?" htmlFor="voice-pitch" hint="Exemple : « J’aide les artisans à trouver des clients sur Instagram, sans publicité. »">
          <CountedTextarea id="voice-pitch" value={sheet.pitch} maxLength={VOICE_SHEET_LIMITS.pitch} rows={2} onChange={(event) => set("pitch", event.target.value)} />
        </Field>
        <Field
          label="Pour qui ? Le spectateur, et sa situation"
          htmlFor="voice-audience"
          hint="Exemple : « Des menuisiers à leur compte, un bel atelier, trop peu de commandes. » Jamais « tout le monde »."
        >
          <CountedTextarea id="voice-audience" value={sheet.audience} maxLength={VOICE_SHEET_LIMITS.audience} rows={2} onChange={(event) => set("audience", event.target.value)} />
        </Field>
      </FieldGroup>

      <FieldGroup title="Votre façon de parler" text="Les scripts reprennent vos mots et évitent ceux que vous ne diriez jamais.">
        <div className="grid min-w-0 gap-1.5">
          <SteppedSliderField
            label="Votre débit quand vous parlez"
            value={sheet.wordsPerMinute}
            min={PACE.min}
            max={PACE.max}
            step={5}
            stops={[120, 160, 200]}
            format={formatPace}
            onChange={(value) => set("wordsPerMinute", value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Comptez les mots d’une minute de vos vidéos ; 160 est un débit posé. La langue est celle de l’identité : {languageName(kit.language)}.
          </p>
        </div>
        <StringListEditor
          label="Les mots et tournures que vous employez"
          hint="Exemple : « concrètement », « on arrête de bricoler », « ton atelier ». Un par ligne."
          items={sheet.words}
          max={VOICE_SHEET_LIMITS.words}
          itemMax={VOICE_SHEET_LIMITS.word}
          placeholder="concrètement"
          itemName="mot"
          addLabel="Ajouter le mot"
          onChange={(words) => set("words", words)}
        />
        <StringListEditor
          label="Les mots que vous n’employez jamais"
          hint="Exemple : « hack », « game changer », « incroyable »."
          items={sheet.bannedWords}
          max={VOICE_SHEET_LIMITS.words}
          itemMax={VOICE_SHEET_LIMITS.word}
          placeholder="game changer"
          itemName="mot"
          addLabel="Ajouter le mot banni"
          onChange={(bannedWords) => set("bannedWords", bannedWords)}
        />
      </FieldGroup>

      <FieldGroup title="Ce que vous défendez" text="Ce qui rend vos scripts impossibles à confondre avec ceux d’un autre.">
        <Field label="Que défendez-vous ?" htmlFor="voice-stands" hint="Exemple : « Un client qui revient vaut dix inconnus : on soigne ceux qu’on a déjà. »">
          <CountedTextarea id="voice-stands" value={sheet.stands} maxLength={VOICE_SHEET_LIMITS.stands} rows={2} onChange={(event) => set("stands", event.target.value)} />
        </Field>
        <Field
          label="Contre quoi vous battez-vous ?"
          htmlFor="voice-against"
          hint="Une habitude, un mythe, un outil, jamais le spectateur. Exemple : « Les publicités qu’on lance sans rien mesurer. »"
        >
          <CountedTextarea id="voice-against" value={sheet.against} maxLength={VOICE_SHEET_LIMITS.against} rows={2} onChange={(event) => set("against", event.target.value)} />
        </Field>
      </FieldGroup>

      <FieldGroup title="Vos preuves" text="Chiffres réels, résultats, clients : les seuls que l’assistant cite sans les vérifier. Rien d’arrondi, rien d’espéré.">
        <StringListEditor
          label="Une preuve par ligne"
          hint="Exemple : « 40 ateliers accompagnés depuis 2023 », « Carnet de commandes plein six mois d’avance »."
          items={sheet.proofs}
          max={VOICE_SHEET_LIMITS.proofs}
          itemMax={VOICE_SHEET_LIMITS.proof}
          placeholder="40 ateliers accompagnés depuis 2023"
          itemName="preuve"
          addLabel="Ajouter la preuve"
          onChange={(proofs) => set("proofs", proofs)}
        />
      </FieldGroup>

      <FieldGroup title="Ce que vous demandez au spectateur" text="Du plus léger au plus engageant, trois au plus : un script n’en fait qu’une, celle qui suit le mieux sa promesse.">
        <StringListEditor
          label="Vos demandes, dans l’ordre"
          hint="Exemple : « Me suivre pour la suite », puis « Télécharger la liste gratuite », puis « Réserver un appel »."
          items={sheet.asks}
          max={VOICE_SHEET_LIMITS.asks}
          itemMax={VOICE_SHEET_LIMITS.ask}
          placeholder="Me suivre pour la suite"
          itemName="demande"
          addLabel="Ajouter la demande"
          onChange={(asks) => set("asks", asks)}
        />
      </FieldGroup>

      <VoiceDraftSheet open={drafting} onOpenChange={setDrafting} kit={kit} onTake={take} />
    </div>
  );
}

// ─── « Proposer à partir de mes textes » ───────────────────────────

/** Texte lisible d'une réponse, pour la relecture. */
const shown = (value: string | string[]) => (Array.isArray(value) ? value.join(" · ") : value);

/**
 * Tiroir de la proposition : les textes collés, la lecture par Codex, puis
 * chaque réponse proposée à cocher. Une réponse qui remplacerait la vôtre
 * part décochée, et la vôtre reste affichée à côté.
 */
function VoiceDraftSheet({
  open,
  onOpenChange,
  kit,
  onTake,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kit: BrandKit;
  onTake: (patch: Partial<VoiceSheetDraft>) => void;
}) {
  const [text, setText] = useState("");
  const [job, setJob] = useState<VoiceDraftJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [picked, setPicked] = useState<Set<VoiceSheetField>>(new Set());
  const submit = useFeedback();
  const current = kit.voiceSheet ?? emptyVoiceSheet();
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });
  const running = job?.status === "running";
  const draft = job?.status === "done" ? job.draft : undefined;
  const jobId = job?.id;

  // Suivi de la lecture tant qu'elle tourne ; une erreur revient au formulaire.
  useEffect(() => {
    if (!running || !jobId) return;
    const timer = window.setInterval(() => {
      api
        .getVoiceDraftJob(jobId)
        .then((next) => {
          if (!next || next.status === "running") return;
          if (next.status === "error") submit.error(next.error ?? "La proposition a échoué. Réessayez.");
          if (next.status === "done" && next.draft) {
            const proposal = next.draft;
            // Coché d'office : ce qui remplit une question vide. Ce qui remplacerait une réponse attend votre accord.
            setPicked(new Set(VOICE_SHEET_FIELDS.filter((field) => isAnswered(proposal, field) && !isAnswered(currentRef.current, field))));
          }
          setJob(next.status === "done" ? next : null);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [running, jobId, submit]);

  const start = async () => {
    submit.clear();
    setStarting(true);
    try {
      setJob(await api.startVoiceDraft(kit.id, text));
    } catch (error) {
      submit.error(errorMessage(error, "La proposition n’a pas pu démarrer. Réessayez."));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      await api.cancelVoiceDraft(job.id);
    } catch {
      // La lecture se termine d'elle-même : rien à signaler.
    }
    setJob(null);
  };

  const proposed = draft ? VOICE_SHEET_FIELDS.filter((field) => isAnswered(draft, field)) : [];
  const toggle = (field: VoiceSheetField, on: boolean) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });
  const accept = () => {
    if (!draft) return;
    const patch = Object.fromEntries(proposed.filter((field) => picked.has(field)).map((field) => [field, draft[field]])) as Partial<VoiceSheetDraft>;
    onTake(patch);
    setJob(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden sm:max-w-xl">
        <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
          <div className="grid min-w-0 flex-1 gap-1">
            <SheetTitle>Proposer à partir de mes textes</SheetTitle>
            <SheetDescription>
              {draft
                ? "Cochez ce que vous reprenez. Rien n’entre dans la fiche sans votre accord, et tout reste modifiable ensuite."
                : "Collez une bio, des descriptions de vidéos, la transcription de deux ou trois vidéos. Codex en tire une fiche, sans rien inventer."}
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={() => onOpenChange(false)}>
            <X />
          </Button>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {draft ? (
            <ul className="divide-y">
              {proposed.map((field) => {
                const mine = isAnswered(current, field) ? shown(current[field]) : "";
                const theirs = shown(draft[field]);
                const replaces = Boolean(mine) && mine !== theirs;
                const id = `voice-draft-${field}`;
                return (
                  <li key={field} className="flex min-w-0 items-start gap-3 py-3 first:pt-0">
                    <Checkbox id={id} checked={picked.has(field)} onCheckedChange={(value) => toggle(field, value === true)} className="mt-0.5" />
                    <label htmlFor={id} className="grid min-w-0 flex-1 gap-1">
                      <span className="text-xs font-medium">{FIELD_NAMES[field]}</span>
                      <span className="text-sm break-words">{theirs}</span>
                      {replaces && (
                        <span className="text-xs break-words text-muted-foreground">
                          Remplacerait : {mine}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : running ? (
            <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-4">
              <ThinkingStatus messages={["Codex lit vos textes…", "Relevé de vos mots et de vos preuves…", "Préparation de la fiche…"]} state="composing" />
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void cancel()}>
                <X className="size-4" />
                Annuler
              </Button>
            </div>
          ) : (
            <form
              id="voice-draft-form"
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              <Field label="Vos textes" htmlFor="voice-draft-text" hint="Seul ce qui y est écrit entre dans la proposition : un chiffre absent de vos textes n’apparaîtra pas.">
                <CountedTextarea
                  id="voice-draft-text"
                  value={text}
                  maxLength={VOICE_SHEET_LIMITS.source}
                  rows={14}
                  placeholder="Je suis menuisier à Nantes depuis 2011…"
                  onChange={(event) => {
                    submit.clear();
                    setText(event.target.value);
                  }}
                />
              </Field>
            </form>
          )}
        </div>

        <AnimatePresence initial={false}>
          {!running && (
            <motion.div key="footer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <SheetFooter className="mt-0 border-t px-5 py-3">
                {draft ? (
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => setJob(null)}>
                      <RotateCcw className="size-4" />
                      Revenir aux textes
                    </Button>
                    <Button size="sm" className="gap-2" disabled={picked.size === 0} onClick={accept}>
                      <Sparkles className="size-4" />
                      {picked.size > 1 ? `Reprendre ${picked.size} réponses` : picked.size === 1 ? "Reprendre 1 réponse" : "Reprendre"}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <FormStatus state={submit.state} />
                    <div className="flex min-w-0 items-center justify-end gap-2">
                      <Button type="submit" form="voice-draft-form" size="sm" className="gap-2" loading={starting} disabled={!text.trim()}>
                        <Sparkles className="size-4" />
                        Proposer
                      </Button>
                    </div>
                  </div>
                )}
              </SheetFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
