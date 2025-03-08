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
  showSearch = true,
  showBreadcrumbs = true,
  title,
  description,
}: SidebarHeaderProps) {
  const { toggleSidebar } = useSidebar();
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-[--header-height] w-full items-center gap-2 px-4">
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={t("sidebar.toggle")}
        >
          <SidebarIcon />
        </Button>

        <Separator orientation="vertical" className="mr-2 h-4" />

        <div className="flex flex-1 items-center gap-4">
          {/* {title && (
            <div className="hidden sm:block">
              <h1 className="text-sm font-medium">
                {title}
              </h1>
              {description && (
                <p className="text-xs text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          )} */}

          {showBreadcrumbs && (
            <div className="hidden sm:block">
              <BreadcrumbNav />
            </div>
          )}

          {showSearch && <SearchForm className="w-full sm:ml-auto sm:w-auto" />}
        </div>
      </div>
    </header>
  );
}
