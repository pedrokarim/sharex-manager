"use client";

import { SidebarTrigger } from "../ui/sidebar";
import { Separator } from "../ui/separator";
import { SearchForm } from "./search-form";
import { BreadcrumbNav } from "../breadcrumb";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
}: SidebarHeaderProps) {
  const pathname = usePathname();

  // Afficher la recherche seulement sur les pages galerie
  const shouldShowSearch =
    showSearch !== undefined ? showSearch : pathname.startsWith("/gallery");

  return (
    <header
      className={cn(
        "flex h-16 shrink-0 items-center gap-2",
        shouldShowSearch &&
          "border-b border-border/60 bg-background/70 backdrop-blur",
      )}
    >
      <div className="flex w-full items-center gap-2 px-4 sm:px-4">
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
            <SearchForm className="min-w-0 w-full sm:ml-auto sm:w-[280px] lg:w-[320px] xl:w-[360px]" />
          )}
        </div>
      </div>
    </header>
  );
}
