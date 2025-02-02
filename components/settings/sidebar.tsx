"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Upload,
  Users,
  History,
  BarChart,
  Key,
  Trash2,
  Shield,
  Globe,
} from "lucide-react";

const navigation = [
  {
    title: "Configuration des uploads",
    href: "/uploads/config",
    icon: Upload,
  },
  {
    title: "Gestion des utilisateurs",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Historique des uploads",
    href: "/uploads/history",
    icon: History,
  },
  {
    title: "Statistiques",
    href: "/uploads/stats",
    icon: BarChart,
  },
  {
    title: "Clés API",
    href: "/settings/api-keys",
    icon: Key,
  },
  {
    title: "Domaines",
    href: "/settings/domains",
    icon: Globe,
  },
  {
    title: "Nettoyage",
    href: "/cleanup",
    icon: Trash2,
  },
  {
    title: "Sécurité",
    href: "/security",
    icon: Shield,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {navigation.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:text-primary",
              isActive
                ? "bg-muted font-medium text-primary"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
