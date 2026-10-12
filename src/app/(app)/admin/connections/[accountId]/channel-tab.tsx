"use client";

/**
 * Bannière, filigrane et avatar du compte, depuis les formats exportés par
 * une image de marque : on voit l'image avant de l'envoyer, et pourquoi un
 * envoi n'est pas possible quand il ne l'est pas.
 */

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/connections/types";
import type { ConnectorView } from "@/components/connections/types";
import type { BrandFormats } from "../data";
import { pushBrandAction } from "../actions";

export function ChannelTab({
  account,
  connector,
  kits,
  onPushed,
}: {
  account: AccountSummary;
  connector: ConnectorView;
  kits: BrandFormats[] | null;
  onPushed: () => void;
}) {
  const [kitId, setKitId] = useState(() => kits?.find((kit) => kit.isDefault)?.id ?? kits?.[0]?.id ?? "");
  const [busy, setBusy] = useState<"banner" | "watermark" | null>(null);
  const kit = kits?.find((entry) => entry.id === kitId) ?? null;
  const canBanner = account.capabilities.includes("profile.banner");
  const canWatermark = account.capabilities.includes("profile.watermark");
  const connected = account.status === "connected";
  const editHref = (id: string) => `/m/brand-kit/edit?id=${encodeURIComponent(id)}`;

  const push = async (what: "banner" | "watermark") => {
    if (!kit) return;
    setBusy(what);
    const result = await pushBrandAction(account.id, kit.id, what);
    setBusy(null);
    onPushed();
    if (!result.ok) return void toast.error(result.error);
    toast.success(what === "banner" ? "Bannière mise à jour" : "Filigrane mis à jour");
  };

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Depuis une image de marque</h2>
          <p className="text-xs text-pretty text-muted-foreground">Les formats exportés par l’éditeur d’une image de marque, envoyés tels quels.</p>
        </div>
        {kits && kits.length > 0 ? (
          <Select value={kitId} onValueChange={setKitId}>
            <SelectTrigger className="w-full min-w-0 sm:w-64" aria-label="Image de marque">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kits.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <span className="truncate">
                    {entry.name}
                    {entry.isDefault ? " (par défaut)" : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {kits === null ? (
        <p className="text-sm text-muted-foreground">Le module « Image de marque » n’est pas chargé.</p>
      ) : kits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune image de marque.{" "}
          <Link href="/m/brand-kit" className="underline underline-offset-2">
            En créer une
          </Link>
          .
        </p>
      ) : kit ? (
        <div className="grid min-w-0 gap-8 lg:grid-cols-2">
          <FormatRow
            title="Bannière"
            image={kit.banner}
            preview="aspect-video w-full max-w-md object-cover"
            missing="Bannière pas encore exportée."
            editHref={editHref(kit.id)}
            disabledReason={!canBanner ? "La bannière demande un accès plus large : reconnectez le compte avec « Tout »." : !connected ? "Compte à reconnecter." : undefined}
            busy={busy === "banner"}
            action="Mettre à jour la bannière"
            onPush={() => void push("banner")}
            help="Remplace la bannière ; les autres réglages du profil sont gardés."
          />
          <FormatRow
            title="Filigrane"
            image={kit.watermark}
            preview="size-24 object-contain [background:repeating-conic-gradient(#8882_0_25%,transparent_0_50%)_0_0/12px_12px]"
            missing="Filigrane pas encore exporté."
            editHref={editHref(kit.id)}
            disabledReason={!canWatermark ? "Ce compte n’a pas le droit de changer le filigrane." : !connected ? "Compte à reconnecter." : undefined}
            busy={busy === "watermark"}
            action="Mettre à jour le filigrane"
            onPush={() => void push("watermark")}
            help={`Posé par ${connector.label} sur les vidéos, en haut à droite.`}
          />
          <div className="grid min-w-0 content-start gap-2">
            <h3 className="text-sm font-medium">Avatar</h3>
            <p className="text-xs text-pretty text-muted-foreground">
              {connector.label} ne permet pas de le changer par son API : téléchargez le PNG de la marque, puis changez-le chez {connector.label}.
            </p>
            {kit.avatar ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- format exporté par la marque */}
                <img src={kit.avatar} alt="" className="size-16 rounded-full object-cover" />
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={kit.avatar} download="avatar.png">
                    <Download className="size-4" />
                    Télécharger
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Avatar pas encore exporté.{" "}
                <Link href={editHref(kit.id)} className="underline underline-offset-2">
                  Ouvrir la marque
                </Link>
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FormatRow({
  title,
  image,
  preview,
  missing,
  editHref,
  disabledReason,
  busy,
  action,
  onPush,
  help,
}: {
  title: string;
  image?: string;
  preview: string;
  missing: string;
  editHref: string;
  disabledReason?: string;
  busy: boolean;
  action: string;
  onPush: () => void;
  help: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- format exporté par la marque
        <img src={image} alt="" className={cn("max-w-full rounded-md bg-muted", preview)} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {missing}{" "}
          <Link href={editHref} className="underline underline-offset-2">
            Exporter les formats depuis la marque
          </Link>
        </p>
      )}
      <p className={cn("text-xs text-pretty", disabledReason ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{disabledReason ?? help}</p>
      <div>
        <Button size="sm" disabled={!image || Boolean(disabledReason) || busy} onClick={onPush} className="gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {action}
        </Button>
      </div>
    </div>
  );
}
