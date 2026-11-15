"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { IconComponent } from "@/components/icon-theme";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "../ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { useTranslation } from "@/lib/i18n";
import { LinkPendingIcon } from "@/components/loading";
import { isLinkActive, linkSectionId } from "./nav-state";

interface SubItem {
  title: string;
  url: string;
  icon?: IconComponent;
}

export interface NavMenuItem {
  title: string;
  url: string;
  icon: IconComponent;
  /** Logo affiché à la place de l'icône : celui d'un module. */
  image?: string;
  items?: SubItem[];
}

/** État ouvert/fermé des sections, tenu par la barre pour survivre aux navigations. */
export interface NavSectionsState {
  open: Record<string, boolean>;
  onOpenChange: (id: string, open: boolean) => void;
}

interface NavMainProps {
  title: string;
  items: NavMenuItem[];
  /** Adresse du lien qui correspond à la page courante. */
  activeHref: string | null;
  sections: NavSectionsState;
  /**
   * Identifiant de section quand le groupe entier se replie sous son titre
   * (Administration). Sans lui, le groupe reste toujours déplié.
   */
  groupSectionId?: string;
}

export function NavMain({ title, items, activeHref, sections, groupSectionId }: NavMainProps) {
  const { state, isMobile } = useSidebar();
  // Barre repliée en icônes : les titres de groupe disparaissent, un groupe
  // fermé n'aurait plus aucun moyen de s'ouvrir. Ses icônes restent visibles.
  const iconMode = state === "collapsed" && !isMobile;

  const menu = <NavMenu items={items} activeHref={activeHref} sections={sections} />;

  if (!groupSectionId) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{title}</SidebarGroupLabel>
        {menu}
      </SidebarGroup>
    );
  }

  return (
    <Collapsible
      open={iconMode || (sections.open[groupSectionId] ?? false)}
      onOpenChange={(open) => sections.onOpenChange(groupSectionId, open)}
      className="group/collapsible"
    >
      <SidebarGroup>
        <SidebarGroupLabel
          asChild
          className="w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:invisible"
        >
          <CollapsibleTrigger>
            {title}
            <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>{menu}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function NavMenu({
  items,
  activeHref,
  sections,
}: {
  items: NavMenuItem[];
  activeHref: string | null;
  sections: NavSectionsState;
}) {
  const { t } = useTranslation();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const sectionId = linkSectionId(item.url);
        const open = sections.open[sectionId] ?? false;

        return (
          <Collapsible
            key={item.url}
            asChild
            open={open}
            onOpenChange={(next) => sections.onOpenChange(sectionId, next)}
          >
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={item.title} isActive={isLinkActive(item, activeHref)}>
                <Link href={item.url} aria-current={item.url === activeHref ? "page" : undefined}>
                  <LinkPendingIcon className={item.image ? "size-5" : undefined}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- logo servi par le module
                      <img src={item.image} alt="" className="size-5 shrink-0 object-contain" />
                    ) : (
                      <item.icon />
                    )}
                  </LinkPendingIcon>
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
              {item.items?.length ? (
                <>
                  <CollapsibleTrigger asChild>
                    {/* Sur téléphone, la flèche occupe toute la hauteur de la
                        ligne (32 px) : l'icône garde sa taille, la zone à
                        toucher grandit. Le halo `after` d'origine déborderait
                        alors sur les lignes voisines. */}
                    <SidebarMenuAction className="data-[state=open]:rotate-90 max-md:top-0! max-md:right-0 max-md:size-8 max-md:after:hidden">
                      <ChevronRight />
                      <span className="sr-only">
                        {open
                          ? t("sidebar.hide_pages", { name: item.title })
                          : t("sidebar.show_pages", { name: item.title })}
                      </span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.url}>
                          <SidebarMenuSubButton asChild isActive={subItem.url === activeHref}>
                            <Link
                              href={subItem.url}
                              aria-current={subItem.url === activeHref ? "page" : undefined}
                            >
                              {subItem.icon && (
                                <LinkPendingIcon>
                                  <subItem.icon className="h-4 w-4" />
                                </LinkPendingIcon>
                              )}
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </SidebarMenu>
  );
}
