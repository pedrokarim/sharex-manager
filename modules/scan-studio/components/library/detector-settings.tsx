"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { forgetDetectorChoice } from "../../lib/analysis";
import { api } from "../../lib/client";
import { errorMessage } from "../../lib/library-helpers";
import type { DetectorChoice, DetectorStatus, DetectorVariantId } from "../../lib/types";

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} Mo`;

/**
 * Repérage du texte : le détecteur de bulles et de texte que l'analyse fait
 * tourner dans le navigateur. Un administrateur choisit la variante et fait
 * télécharger son modèle sur le serveur ; les autres comptes voient l'état.
 */
export function DetectorSettings({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<DetectorStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const store = useCallback((next: DetectorStatus) => {
    setStatus(next);
    setFailed(false);
    // La prochaine analyse relit le choix au lieu de garder l'ancien une minute.
    forgetDetectorChoice();
  }, []);

  useEffect(() => {
    api.getDetector().then(store).catch(() => setFailed(true));
  }, [store]);

  const choose = async (choice: DetectorChoice) => {
    if (busy) return;
    setBusy("choice");
    try {
      store(await api.setDetectorChoice(choice));
      toast.success(choice === "off" ? "Détecteur coupé : l’analyse repère le texte par les pixels" : "Détecteur choisi");
    } catch (error) {
      toast.error(errorMessage(error, "Ce réglage n’a pas pu être enregistré."));
    } finally {
      setBusy(null);
    }
  };

  const download = async (variant: DetectorVariantId, size: number) => {
    if (busy) return;
    setBusy(variant);
    const pending = toast.loading(`Téléchargement du modèle (${megabytes(size)})…`);
    try {
      store(await api.downloadDetector(variant));
      toast.success("Modèle téléchargé et vérifié", { id: pending });
    } catch (error) {
      toast.error(errorMessage(error, "Le modèle n’a pas pu être téléchargé."), { id: pending });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (variant: DetectorVariantId) => {
    if (busy) return;
    setBusy(variant);
    try {
      store(await api.removeDetector(variant));
      toast.success("Modèle effacé du serveur");
    } catch (error) {
      toast.error(errorMessage(error, "Le modèle n’a pas pu être effacé."));
    } finally {
      setBusy(null);
    }
  };

  const chosen = status?.variants.find((variant) => variant.id === status.active);
  const inService = Boolean(status?.modelUrl);

  return (
    <Card role="region" aria-labelledby="scan-studio-detector">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearch aria-hidden className="h-4 w-4 text-muted-foreground" />
          <h3 id="scan-studio-detector">Repérage du texte</h3>
        </CardTitle>
        <CardDescription>
          Un détecteur entraîné sur des pages de manga, de webtoon et de manhua repère les bulles et le texte, y compris hors bulle. Il tourne dans le
          navigateur de celui qui analyse : aucune page ne quitte la machine, et ce n’est pas une IA générative. Sans lui, l’analyse repère le texte par les
          pixels, moins sûrement.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
      {status === null ? (
        failed ? (
          <p className="text-sm text-muted-foreground">L’état du détecteur n’a pas pu être chargé.</p>
        ) : (
          <div className="grid max-w-3xl gap-3" aria-hidden>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )
      ) : (
        <>
          <p className="flex max-w-3xl items-center gap-1.5 text-sm" aria-live="polite">
            {inService ? (
              <>
                <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                En service : variante « {chosen?.label} ».
              </>
            ) : status.active === "off" ? (
              <span className="text-muted-foreground">Détecteur coupé : l’analyse repère le texte par les pixels.</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                La variante « {chosen?.label} » est choisie, mais son modèle n’est pas encore sur le serveur : l’analyse repère le texte par les pixels en
                attendant.
              </span>
            )}
          </p>

          <RadioGroup value={status.active} onValueChange={(next) => void choose(next as DetectorChoice)} disabled={!isAdmin || busy !== null} className="gap-0">
            <ItemGroup className="gap-3">
              {status.variants.map((variant) => (
                <Item key={variant.id} variant="outline" role="listitem">
                  <ItemMedia>
                    <RadioGroupItem id={`scan-studio-detector-${variant.id}`} value={variant.id} aria-label={`Variante ${variant.label}`} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      <Label htmlFor={`scan-studio-detector-${variant.id}`} className="font-medium">
                        {variant.label}
                      </Label>
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-pretty">{variant.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {variant.installed ? (
                      <>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                          Sur le serveur
                        </span>
                        {isAdmin && (
                          <Button type="button" variant="ghost" size="icon" className="size-8" disabled={busy !== null} onClick={() => void remove(variant.id)} aria-label={`Effacer le modèle ${variant.label} du serveur`}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </>
                    ) : isAdmin ? (
                      <Button type="button" variant="outline" size="sm" className="gap-2" disabled={busy !== null} onClick={() => void download(variant.id, variant.size)}>
                        {busy === variant.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Télécharger ({megabytes(variant.size)})
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pas encore sur le serveur</span>
                    )}
                  </ItemActions>
                </Item>
              ))}
              <Item variant="outline" role="listitem">
                <ItemMedia>
                  <RadioGroupItem id="scan-studio-detector-off" value="off" aria-label="Sans détecteur" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    <Label htmlFor="scan-studio-detector-off" className="font-medium">
                      Sans détecteur
                    </Label>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none text-pretty">Repérage par les pixels seulement : rien à télécharger, mais les petites bulles et le texte hors bulle sont souvent manqués.</ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          </RadioGroup>

          <p className="flex max-w-3xl flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            Modèle « comic-text-and-bubble-detector », licence {status.license}, téléchargé une fois depuis son dépôt et vérifié à l’arrivée.
            <a href={status.source} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
              Voir le dépôt
              <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          </p>
          {!isAdmin && <p className="text-xs text-muted-foreground">Le choix du détecteur et le téléchargement de son modèle sont réservés à un administrateur.</p>}
        </>
      )}
      </CardContent>
    </Card>
  );
}
