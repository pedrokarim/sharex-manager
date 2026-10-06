"use client";

import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { RefreshCw, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { BundledFontList, CustomFontList } from "../components/fonts/font-list";
import { StyleTable } from "../components/fonts/style-table";
import { ModuleShell } from "../components/module-shell";
import { ensureFonts, fetchCustomFonts } from "../lib/fonts";
import { errorMessage } from "../lib/library-helpers";
import type { CustomFont } from "../lib/types";

/** Polices gardées entre deux visites : elles restent à l'écran pendant qu'on les relit. */
let snapshot: CustomFont[] | null = null;

/** Phrase d'essai par défaut : des capitales, des accents, de la ponctuation, comme dans une bulle. */
const DEFAULT_SAMPLE = "Tiens bon, on y est presque ! Ça ira…";

/**
 * « Polices » : les polices de lettrage du module. En haut, la table des styles
 * d'un dossier ; en dessous, les polices ajoutées, puis celles fournies avec
 * l'application.
 */
export default function FontsPage() {
  const { data: session } = useSession();
  // Le serveur refuse de toute façon l'ajout et le retrait aux autres comptes : ici, on ne fait que ne pas les proposer.
  const isAdmin = session?.user?.role === "admin";
  const [fonts, setFonts] = useState<CustomFont[] | null>(snapshot);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sample, setSample] = useState(DEFAULT_SAMPLE);

  const store = useCallback((next: CustomFont[]) => {
    snapshot = next;
    setFonts(next);
    setFailed(false);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      store(await fetchCustomFonts(true));
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "La liste des polices n’a pas pu être lue."));
    } finally {
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => {
    void ensureFonts();
    void refresh();
  }, [refresh]);

  const shown = sample.trim() || DEFAULT_SAMPLE;

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        crumbs={[{ label: "Polices" }]}
        actions={
          <Button variant="outline" className="gap-2" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Actualiser
          </Button>
        }
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div className="flex items-start gap-3">
              <Type aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <h2 className="text-base font-semibold">Polices de lettrage</h2>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Une police par registre de texte, les mêmes à l’aperçu et à l’export : celles fournies avec l’application, et les vôtres.
                </p>
              </div>
            </div>
            <InputGroup className="w-full max-w-md">
              <InputGroupAddon>
                <InputGroupText>Phrase d’essai</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput value={sample} maxLength={80} onChange={(event) => setSample(event.target.value)} aria-label="Phrase d’essai" />
            </InputGroup>
          </div>

          <StyleTable fonts={fonts ?? []} sample={shown} />

          {failed && fonts === null ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">Les polices ajoutées n’ont pas pu être lues.</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          ) : (
            <CustomFontList fonts={fonts} sample={shown} isAdmin={isAdmin} onChange={store} />
          )}

          <BundledFontList sample={shown} />
        </div>
      </ModuleShell>
    </MotionConfig>
  );
}
