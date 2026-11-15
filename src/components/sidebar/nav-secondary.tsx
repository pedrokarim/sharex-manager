import Link from "next/link";
import * as React from "react";
import type { IconComponent } from "@/components/icon-theme";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import { LinkPendingIcon } from "@/components/loading";

export function NavSecondary({
  items,
  activeHref,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: IconComponent;
  }[];
  /** Adresse du lien qui correspond à la page courante. */
  activeHref: string | null;
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild size="sm" isActive={item.url === activeHref}>
                <Link href={item.url} aria-current={item.url === activeHref ? "page" : undefined}>
                  <LinkPendingIcon>
                    <item.icon />
                  </LinkPendingIcon>
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
