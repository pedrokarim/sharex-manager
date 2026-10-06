"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/auth-client";
import { EngineLogo } from "../../../ai-image-gen/components/engine-logo";
import { api, formatDate } from "../../lib/client";
import { errorMessage } from "../../lib/library-helpers";
import type { AiAction, AiCatalogue, AiModelOption, AiTrace } from "../../lib/types";
import { acknowledge, findModel, keepChapterModel, sentSentence, useAiRunning, wasAcknowledged } from "./ai-store";

/** Le logo officiel du fournisseur et son nom, côte à côte. Un fournisseur sans logo connu garde son nom seul. */
export function ProviderName({ provider, label }: { provider: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle font-medium whitespace-nowrap">
      <EngineLogo engineId={provider} className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

const ACTION_LABELS: Record<AiAction, string> = {
  reading: "Relecture de la zone",
  translation: "Traduction avec contexte",
  page: "Traduction de la page entière",
};

const SENT_LABELS: Record<AiTrace["sent"], string> = {
  crop: "image de la zone envoyée",
  text: "texte envoyé",
  page: "page entière envoyée",
};

interface ModelPickerProps {
  action: AiAction;
  catalogue: AiCatalogue;
  chapterId: string;
  value: string;
  onChange: (key: string) => void;
}

/** Choix du modèle pour une action, dans la palette d'IA, avec de quoi le retenir pour le chapitre. */
export function ModelPicker({ action, catalogue, chapterId, value, onChange }: ModelPickerProps) {
  const models = catalogue.models[action];
  const chosen = findModel(catalogue, action, value);
  const [kept, setKept] = useState(catalogue.defaults[action] ?? "");

  if (models.length === 0) {
    return <p className="text-xs text-muted-foreground">La palette d’IA ne propose aucun modèle pour cela. Elle se règle dans le module AI Image Gen.</p>;
  }
  return (
    <div className="space-y-1.5">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full text-xs" aria-label={`Modèle pour : ${ACTION_LABELS[action]}`}>
          <SelectValue placeholder="Choisir un modèle" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.key} value={model.key} disabled={!model.available} className="text-xs">
              <span className="flex items-center gap-1.5">
                <EngineLogo engineId={model.provider} className="size-3.5 shrink-0" />
                <span>{model.label}</span>
                <span className="text-muted-foreground">{model.providerLabel}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen && !chosen.available && chosen.reason && <p className="text-xs text-amber-700 dark:text-amber-300">{chosen.reason}</p>}
      {chosen && chosen.available && kept !== chosen.key && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => void keepChapterModel(chapterId, action, chosen.key).then((saved) => saved && setKept(chosen.key))}
        >
          Retenir ce modèle pour le chapitre
        </button>
      )}
      {models.every((model) => !model.available) && (
        <p className="text-xs text-muted-foreground">Aucun de ces modèles n’est utilisable pour l’instant : {models[0].reason ?? "raison inconnue"}</p>
      )}
    </div>
  );
}

interface SendButtonProps {
  action: AiAction;
  scope: "zone" | "page";
  model: AiModelOption | undefined;
  label: string;
  disabled?: boolean;
  onSend: () => void;
}

/**
 * Bouton d'un appel à l'IA. La phrase dit ce qui part, et chez qui, avant
 * l'envoi ; au premier envoi de ce genre vers ce fournisseur, il faut la
 * confirmer. Le bouton est inactif tant qu'un appel attend sa réponse.
 */
export function SendButton({ action, scope, model, label, disabled, onSend }: SendButtonProps) {
  const running = useAiRunning();
  const [confirming, setConfirming] = useState(false);
  const usable = Boolean(model?.available) && !disabled && running === null;

  const send = () => {
    if (!model) return;
    acknowledge(action, model.provider);
    setConfirming(false);
    onSend();
  };

  return (
    <div className="space-y-1.5">
      {model && (
        <p className="text-xs leading-snug text-muted-foreground">
          {sentSentence(action, scope)[0]}
          <ProviderName provider={model.provider} label={model.providerLabel} />
          {sentSentence(action, scope)[1]}
        </p>
      )}
      {confirming && model ? (
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-7 flex-1 text-[11px]" disabled={!usable} onClick={send}>
            Envoyer
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full gap-1.5 text-[11px]"
          disabled={!usable}
          onClick={() => (model && wasAcknowledged(action, model.provider) ? send() : setConfirming(true))}
        >
          {running === action && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {running === action ? "Réponse attendue…" : label}
        </Button>
      )}
    </div>
  );
}

/** Appels déjà faits pour une zone ou une version : où l'IA est passée. */
export function TraceList({ traces, labels }: { traces: AiTrace[]; labels: (provider: string) => string }) {
  if (traces.length === 0) return null;
  return (
    <ul className="space-y-1">
      {[...traces].reverse().map((trace, index) => (
        <li key={`${trace.at}-${index}`} className="text-[11px] leading-snug text-muted-foreground">
          <ProviderName provider={trace.provider} label={labels(trace.provider)} /> · {trace.model}
          <br />
          {ACTION_LABELS[trace.action]}, {formatDate(trace.at)}, {trace.cached ? "réponse reprise du cache, rien n’est reparti" : SENT_LABELS[trace.sent]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Appels du mois face au plafond, tel que le serveur le tient. Un
 * administrateur peut changer le plafond ici ; le serveur le refuse aux autres
 * comptes de toute façon.
 */
export function UsageNote({ catalogue, onSaved }: { catalogue: AiCatalogue; onSaved: () => void }) {
  const { month, monthlyLimit } = catalogue.usage;
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(String(monthlyLimit));
  const [saving, setSaving] = useState(false);
  const parsed = Number(limit);
  const valid = limit.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.saveAiSettings({ monthlyLimit: parsed });
      setEditing(false);
      onSaved();
      toast.success("Plafond mensuel d’appels à l’IA enregistré");
    } catch (error) {
      toast.error(errorMessage(error, "Le plafond n’a pas pu être enregistré."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {month} appel{month > 1 ? "s" : ""} ce mois sur {monthlyLimit} permis sur cette instance.{" "}
        {isAdmin && !editing && (
          <button type="button" className="underline-offset-2 hover:text-foreground hover:underline" onClick={() => setEditing(true)}>
            Changer le plafond
          </button>
        )}
      </p>
      {editing && (
        <form onSubmit={save}>
          <InputGroup className="h-8">
            <InputGroupAddon>
              <InputGroupText className="text-[11px]">Appels par mois</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={limit}
              aria-label="Plafond mensuel d’appels à l’IA"
              aria-invalid={!valid}
              className="text-xs tabular-nums"
              onChange={(event) => setLimit(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" disabled={!valid || saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enregistrer"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      )}
    </div>
  );
}
