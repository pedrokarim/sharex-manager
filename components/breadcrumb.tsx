"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Fragment } from "react";
import { useTranslation } from "@/lib/i18n";

export function BreadcrumbNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const paths = pathname.split("/").filter(Boolean);

  // Fonction pour obtenir le nom traduit d'une route
  const getRouteName = (path: string) => {
    const routeMap: Record<string, string> = {
      "": t("navigation.home"),
      gallery: t("navigation.gallery"),
      uploads: t("sidebar.main.uploads"),
      history: t("sidebar.main.history"),
      config: t("sidebar.main.configuration"),
      stats: t("sidebar.main.stats"),
      settings: t("navigation.settings"),
      "api-keys": t("account.api_keys"),
      create: t("common.create"),
      admin: t("sidebar.admin.administration"),
      users: t("sidebar.admin.users"),
      preferences: t("sidebar.secondary.preferences"),
    };

    // Gestion des cas spéciaux comme [id]
    if (path.startsWith("[") && path.endsWith("]")) {
      if (path === "[id]" && pathname.includes("/api-keys/")) {
        return t("breadcrumb.edit_key");
      }
      return path; // Retourne le paramètre tel quel si pas de cas spécial
    }

    return routeMap[path] || path;
  };

  // Construire le chemin complet pour chaque niveau
  const buildPath = (index: number) => {
    return "/" + paths.slice(0, index + 1).join("/");
  };

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">{t("navigation.home")}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {paths.map((path, index) => {
          const href = buildPath(index);
          const isLast = index === paths.length - 1;

          return (
            <Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{getRouteName(path)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{getRouteName(path)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
