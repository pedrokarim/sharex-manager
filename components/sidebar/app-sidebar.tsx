"use client"

import * as React from "react"
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
} from "lucide-react"
import Link from "next/link"

import { NavMain } from "./nav-main"
import { NavProjects } from "./nav-projects"
import { NavSecondary } from "./nav-secondary"
import { NavUser } from "./nav-user"
import { ThemeToggle } from "../theme-toggle"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar"

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
          url: "/gallery?sort=starred",
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
          title: "Général",
          url: "/settings/general",
        },
        {
          title: "Clés API",
          url: "/settings/api-keys",
        },
        {
          title: "Sécurité",
          url: "/settings/security",
        },
        {
          title: "Intégrations",
          url: "/settings/integrations",
        },
      ],
    },
  ],
  navSecondary: [
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
  ],
  projects: [
    {
      name: "Images Personnelles",
      url: "/folders/personal",
      icon: FileImage,
    },
    {
      name: "Images Partagées",
      url: "/folders/shared",
      icon: Users,
    },
    {
      name: "Images Sécurisées",
      url: "/folders/secure",
      icon: Shield,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="icon"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ImageIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ShareX Manager</span>
                  <span className="truncate text-xs">Gestionnaire d'images</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between px-4 py-2">
          <ThemeToggle />
        </div>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}