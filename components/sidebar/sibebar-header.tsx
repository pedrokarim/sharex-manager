"use client";

import { SidebarIcon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
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
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-[--header-height] w-full items-center gap-2 px-2 sm:px-4">
        <Button
          className="h-8 w-8 shrink-0"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={t("sidebar.toggle")}
        >
          <SidebarIcon />
        </Button>

        <Separator orientation="vertical" className="mr-1 sm:mr-2 h-4" />

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
