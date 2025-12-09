"use client";

import { SidebarIcon } from "lucide-react";
import { SidebarTrigger, useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "../ui/breadcrumb";
import { Separator } from "../ui/separator";
import { SearchForm } from "./search-form";
import { BreadcrumbNav } from "../breadcrumb";
import { useTranslation } from "@/lib/i18n";
import { usePathname } from "next/navigation";

interface SidebarHeaderProps {
  /** Afficher la barre de recherche */
  showSearch?: boolean;
  /** Afficher les breadcrumbs */
  showBreadcrumbs?: boolean;
  /** Titre personnalisé (optionnel) */
  title?: string;
  /** Description personnalisée (optionnel) */
  description?: string;
}

export function SidebarHeader({
  showSearch,
  showBreadcrumbs = true,
  title,
  description,
}: SidebarHeaderProps) {
  const { toggleSidebar } = useSidebar();
  const { t } = useTranslation();
  const pathname = usePathname();

  // Afficher la recherche seulement sur les pages galerie
  const shouldShowSearch =
    showSearch !== undefined ? showSearch : pathname.startsWith("/gallery");

  return (
    <header className="flex h-16 shrink-0 items-center gap-2">
      <div className="flex w-full items-center gap-2 px-2 sm:px-4">
        <SidebarTrigger className="-ml-1" />

        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />

        <div className="flex flex-1 items-center gap-2 sm:gap-4 min-w-0">
          {showBreadcrumbs && (
            <div className={shouldShowSearch ? "hidden sm:block" : "block"}>
              <BreadcrumbNav />
            </div>
          )}

          {shouldShowSearch && (
            <SearchForm className="w-full sm:ml-auto sm:w-auto min-w-0" />
          )}
        </div>
      </div>
    </header>
  );
}
