"use client";

import type * as React from "react";
import {
  Home,
  Image as ImageIcon,
  Upload,
  Settings2,
  FileImage,
  History,
  Star,
  Settings,
  FolderOpen,
  Users,
  Shield,
  HelpCircle,
  Send,
  UserCog,
  Info,
  Sliders,
  Key,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Image from "next/image";

import { NavMain } from "./nav-main";
import { NavProjects } from "./nav-projects";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import { ThemeToggle } from "../theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";

const data = {
  user: {
    name: "Admin",
    email: "admin@sharex.com",
    avatar: "/avatars/admin.jpg",
  },
  navMain: [
    {
      title: "Galerie",
      url: "/gallery",
      icon: ImageIcon,
      isActive: true,
      items: [
        {
          title: "Récents",
          url: "/gallery?sort=recent",
        },
        {
          title: "Favoris",
          url: "/gallery/starred",
        },
        {
          title: "Sécurisés",
          url: "/gallery/secure",
        },
        {
          title: "Paramètres",
          url: "/gallery/settings",
        },
      ],
    },
    {
      title: "Uploads",
      url: "/uploads",
      icon: Upload,
      items: [
        {
          title: "Historique",
          url: "/uploads/history",
        },
        {
          title: "Configuration",
          url: "/uploads/config",
        },
        {
          title: "Stats",
          url: "/uploads/stats",
        },
      ],
    },
    {
      title: "Organisation",
      url: "/organization",
      icon: FolderOpen,
      items: [
        {
          title: "Dossiers",
          url: "/organization/folders",
        },
        {
          title: "Tags",
          url: "/organization/tags",
        },
        {
          title: "Collections",
          url: "/organization/collections",
        },
      ],
    },
    {
      title: "Paramètres",
      url: "/settings",
      icon: Settings2,
      items: [
        {
          title: "Préférences",
          url: "/settings/preferences",
          icon: Sliders,
        },
        {
          title: "Général",
          url: "/settings/general",
          icon: Settings,
        },
        {
          title: "Clés API",
          url: "/settings/api-keys",
          icon: Key,
        },
        {
          title: "Sécurité",
          url: "/settings/security",
          icon: Shield,
        },
        {
          title: "Intégrations",
          url: "/settings/integrations",
          icon: Share2,
        },
      ],
    },
  ],
  navAdmin: [
    {
      title: "Administration",
      url: "/admin",
      icon: Shield,
      items: [
        {
          title: "Utilisateurs",
          url: "/admin/users",
        },
        {
          title: "Logs",
          url: "/admin/logs",
        },
        {
          title: "Configuration système",
          url: "/admin/system",
        },
        {
          title: "Sécurité",
          url: "/admin/security",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Préférences",
      url: "/settings/preferences",
      icon: Sliders,
    },
    {
      title: "Support",
      url: "/support",
      icon: HelpCircle,
    },
    {
      title: "Feedback",
      url: "/feedback",
      icon: Send,
    },
    {
      title: "À propos de l'application",
      url: "/about-app",
      icon: Info,
    },
  ],
  projects: [
    {
      name: "Images Favoris",
      url: "/gallery/starred",
      icon: Star,
    },
    {
      name: "Images Sécurisées",
      url: "/gallery/secure",
      icon: Shield,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground overflow-hidden">
                  <Image
                    src="/images/logo-sxm-simple.png"
                    alt="ShareX Manager Logo"
                    width={32}
                    height={32}
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ShareX Manager</span>
                  <span className="truncate text-xs">
                    Gestionnaire d'images
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain title="Galerie" items={data.navMain} />
        {isAdmin && <NavMain title="Administration" items={data.navAdmin} />}
        <NavProjects projects={data.projects} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2">
          <ThemeToggle />
        </div>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
