/**
 * Pièces communes aux listes de sessions (écran Sécurité, « Mon compte ») :
 * l'icône de l'appareil, son libellé, l'adresse IP en chasse fixe, et la
 * pastille « Cette session ».
 */

import { Bot, HelpCircle, Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import type { DeviceInfo, DeviceType } from "@/lib/security/sessions";
import { cn } from "@/lib/utils";

const DEVICE_ICONS: Record<DeviceType, LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
  unknown: HelpCircle,
};

const DEVICE_TYPES: Record<DeviceType, string> = {
  desktop: "Ordinateur",
  mobile: "Téléphone",
  tablet: "Tablette",
  bot: "Outil ou robot",
  unknown: "Appareil inconnu",
};

export function DeviceIcon({ type, className }: { type: DeviceType; className?: string }) {
  const Icon = DEVICE_ICONS[type] ?? HelpCircle;
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} />;
}

/** Icône dans un carré discret, puis « Firefox sur Windows » ; le type d'appareil en infobulle. */
export function DeviceLabel({ device, className }: { device: DeviceInfo; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)} title={`${DEVICE_TYPES[device.type]} · ${device.label}`}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <DeviceIcon type={device.type} className="size-3.5" />
      </span>
      <span className="min-w-0 truncate text-sm">{device.label}</span>
    </span>
  );
}

/** Adresse IP en chasse fixe, tronquée si elle est longue (IPv6), complète en infobulle. */
export function IpText({ ip, className }: { ip: string | null | undefined; className?: string }) {
  if (!ip) return <span className={cn("text-xs text-muted-foreground", className)}>Adresse inconnue</span>;
  return (
    <span className={cn("block min-w-0 truncate font-mono text-xs", className)} title={ip}>
      {ip}
    </span>
  );
}

export function CurrentSessionPill({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary", className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Cette session
    </span>
  );
}
