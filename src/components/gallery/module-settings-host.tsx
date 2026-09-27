"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MODULE_SETTINGS_EVENT,
  fileExtension,
  type ModuleSettingsRequest,
} from "@/lib/modules/file-actions";

interface ModuleUIProps {
  fileInfo: { name: string; url: string; size: number; type: string };
  onComplete: (result: unknown) => void;
}

/**
 * Fenêtre de réglages d'un module de traitement, ouverte depuis un menu
 * contextuel.
 *
 * Le menu se referme au clic et démonte son contenu : la fenêtre est donc
 * tenue ici, une seule fois pour toute l'application, et répond à
 * `openModuleSettings()`.
 */
export function ModuleSettingsHost() {
  const [request, setRequest] = useState<ModuleSettingsRequest | null>(null);
  const [Component, setComponent] = useState<ComponentType<ModuleUIProps> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createNewVersion, setCreateNewVersion] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<ModuleSettingsRequest>).detail;
      setRequest(detail);
      setComponent(null);
      setLoadError(null);
      setCreateNewVersion(true);
      import(`@/modules/${detail.moduleName.toLowerCase()}/ui`)
        .then((loaded) => setComponent(() => loaded.default))
        .catch((error) =>
          setLoadError(error instanceof Error ? error.message : "Interface introuvable")
        );
    };
    window.addEventListener(MODULE_SETTINGS_EVENT, onRequest);
    return () => window.removeEventListener(MODULE_SETTINGS_EVENT, onRequest);
  }, []);

  const close = () => {
    setRequest(null);
    setComponent(null);
  };

  const apply = useCallback(
    async (settings: unknown) => {
      if (!request) return;
      setApplying(true);
      try {
        const response = await fetch("/api/modules/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: request.file.name,
            moduleName: request.moduleName,
            settings,
            createNewVersion,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? `HTTP ${response.status}`);
        }
        toast.success(`${request.moduleName} appliqué`);
        close();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Application du module impossible");
      } finally {
        setApplying(false);
      }
    },
    [request, createNewVersion]
  );

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{request?.moduleName}</DialogTitle>
          {request?.description && (
            <DialogDescription>{request.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="relative py-4">
          {loadError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Interface du module indisponible : {loadError}
            </p>
          ) : Component && request ? (
            <Component
              fileInfo={{
                name: request.file.name,
                url: request.file.url,
                size: request.file.size,
                type: fileExtension(request.file.name),
              }}
              onComplete={apply}
            />
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {applying && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        {request?.category === "Édition" && (
          <div className="flex items-center gap-2 border-t pt-4">
            <Switch
              id="module-settings-new-version"
              checked={createNewVersion}
              onCheckedChange={setCreateNewVersion}
            />
            <Label htmlFor="module-settings-new-version">
              Enregistrer comme nouvelle version
            </Label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
