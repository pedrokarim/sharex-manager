"use client";

import { ApiKey } from "@/types/api-key";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface ApiKeyDetailsDialogProps {
  apiKey: ApiKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyDetailsDialog({
  apiKey,
  open,
  onOpenChange,
}: ApiKeyDetailsDialogProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  useEffect(() => {
    if (apiKey && open) {
      const qrData = generateQRCodeData();
      QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then(setQrCodeDataUrl)
        .catch(console.error);
    }
  }, [apiKey, open]);

  if (!apiKey) return null;

  const generateSxcuConfig = () => {
    const destinations = [];
    if (apiKey.permissions.uploadImages) destinations.push("ImageUploader");
    if (apiKey.permissions.uploadText) destinations.push("TextUploader");
    if (apiKey.permissions.uploadFiles) destinations.push("FileUploader");

    return {
      Version: "14.0.0",
      Name: "ShareX Upload",
      DestinationType: destinations.join(", "),
      RequestMethod: "POST",
      RequestURL: `${
        process.env.NEXT_PUBLIC_API_URL || window.location.origin
      }/api/upload`,
      Headers: {
        "x-api-key": apiKey.key,
      },
      Body: "MultipartFormData",
      FileFormName: "file",
      URL: "{json:url}",
      ThumbnailURL: "{json:thumbnail_url}",
      DeletionURL: "{json:deletion_url}",
      ErrorMessage: "{json:error}",
    };
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Configuration copiée dans le presse-papier");
  };

  const generateQRCodeData = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    return JSON.stringify({
      type: "sharex-mobile-config",
      version: "1.0.0",
      serverUrl: baseUrl,
      apiKey: apiKey.key,
      permissions: apiKey.permissions,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl overflow-hidden rounded-2xl border border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <DialogTitle>Détails de la clé API</DialogTitle>
          <DialogDescription>
            Informations et configuration pour {apiKey.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="px-5 py-5 sm:px-6">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl border border-border/60 bg-muted/20 p-1">
            <TabsTrigger value="details">Détails</TabsTrigger>
            <TabsTrigger value="config">Configuration ShareX</TabsTrigger>
            <TabsTrigger value="qrcode">QR Code Mobile</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Nom
                  </div>
                  <div className="mt-2 truncate text-sm">{apiKey.name}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Créée le
                  </div>
                  <div className="mt-2 text-sm">
                    {format(new Date(apiKey.createdAt), "PPP", { locale: fr })}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Clé
                </div>
                <code className="mt-2 block rounded-xl border border-border/60 bg-background px-3 py-3 break-all text-xs">
                  {apiKey.key}
                </code>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Expire le
                  </div>
                  <div className="mt-2 text-sm">
                    {apiKey.expiresAt
                      ? format(new Date(apiKey.expiresAt), "PPP", {
                          locale: fr,
                        })
                      : "Jamais"}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Permissions
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {apiKey.permissions.uploadImages && (
                      <Badge variant="secondary">Images</Badge>
                    )}
                    {apiKey.permissions.uploadText && (
                      <Badge variant="secondary">Texte</Badge>
                    )}
                    {apiKey.permissions.uploadFiles && (
                      <Badge variant="secondary">Fichiers</Badge>
                    )}
                  </div>
                </div>
              </div>

              {apiKey.lastUsed && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Dernière utilisation
                  </div>
                  <div className="mt-2 text-sm">
                    {format(new Date(apiKey.lastUsed), "PPP à HH:mm", {
                      locale: fr,
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="config" className="space-y-6">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Cette configuration ShareX vous permet d'uploader directement
                des fichiers vers notre service. Les URLs de vos fichiers seront
                automatiquement copiées dans votre presse-papier après l'upload.
              </p>
              <div className="space-y-2">
                <h4 className="font-semibold">Instructions d'installation :</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>
                    Copiez la configuration en cliquant sur le bouton "Copier"
                  </li>
                  <li>
                    Créez un nouveau fichier avec l'extension{" "}
                    <code className="rounded bg-muted px-1">.sxcu</code>
                  </li>
                  <li>
                    Collez la configuration dans ce fichier et sauvegardez-le
                  </li>
                  <li>
                    Double-cliquez sur le fichier pour l'importer
                    automatiquement dans ShareX
                  </li>
                  <li>
                    La destination sera automatiquement configurée dans ShareX
                    selon les permissions de votre clé
                  </li>
                </ol>
              </div>
            </div>

            {apiKey.permissions.uploadImages ||
            apiKey.permissions.uploadText ||
            apiKey.permissions.uploadFiles ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    Configuration ShareX
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(generateSxcuConfig(), null, 2),
                      )
                    }
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copier
                  </Button>
                </div>
                <pre className="overflow-auto rounded-xl border border-border/60 bg-muted/20 p-4">
                  <code>{JSON.stringify(generateSxcuConfig(), null, 2)}</code>
                </pre>
              </div>
            ) : (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-center">
                <p className="text-sm text-destructive">
                  Cette clé n'a aucune permission d'upload activée. Aucune
                  configuration ShareX n'est disponible.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="qrcode" className="space-y-6">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Scannez ce QR code avec l'application mobile ShareX Manager pour
                configurer automatiquement la connexion au serveur et la clé
                API.
              </p>
              <div className="space-y-2">
                <h4 className="font-semibold">Instructions :</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>
                    Ouvrez l'application ShareX Manager sur votre téléphone
                  </li>
                  <li>Allez dans les Paramètres</li>
                  <li>Appuyez sur "Scanner QR Code"</li>
                  <li>Pointez la caméra vers ce QR code</li>
                  <li>La configuration sera automatiquement appliquée</li>
                </ol>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  QR Code de configuration
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (qrCodeDataUrl) {
                      const link = document.createElement("a");
                      link.download = `sharex-config-${apiKey.name}.png`;
                      link.href = qrCodeDataUrl;
                      link.click();
                    }
                  }}
                  disabled={!qrCodeDataUrl}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Télécharger
                </Button>
              </div>

              <div className="flex justify-center">
                {qrCodeDataUrl ? (
                  <div className="rounded-xl border border-border/60 bg-white p-4">
                    <img
                      src={qrCodeDataUrl}
                      alt="QR Code de configuration"
                      className="w-64 h-64"
                    />
                  </div>
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center rounded-xl border border-border/60 bg-muted/20">
                    <QrCode className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
