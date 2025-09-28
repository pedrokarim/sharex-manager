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
  TestTube,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useTranslation } from "@/lib/i18n";

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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { t } = useTranslation();

  const data = {
    user: {
      name: "Admin",
      email: "admin@sharex.com",
      avatar: "/avatars/admin.jpg",
    },
    navMain: [
      {
        title: t("sidebar.main.gallery"),
        url: "/gallery",
        icon: ImageIcon,
        isActive: true,
        items: [
          {
            title: t("sidebar.main.recent"),
            url: "/gallery?sort=recent",
          },
          {
            title: t("sidebar.main.starred"),
            url: "/gallery/starred",
          },
          {
            title: t("sidebar.main.secure"),
            url: "/gallery/secure",
          },
          {
            title: t("sidebar.main.settings"),
            url: "/gallery/settings",
          },
        ],
      },
      {
        title: t("sidebar.main.uploads"),
        url: "/uploads",
        icon: Upload,
        items: [
          {
            title: t("sidebar.main.history"),
            url: "/uploads/history",
          },
          {
            title: t("sidebar.main.configuration"),
            url: "/uploads/config",
          },
          {
            title: t("sidebar.main.stats"),
            url: "/uploads/stats",
          },
        ],
      },
      {
        title: t("sidebar.main.organization"),
        url: "/albums",
        icon: FolderOpen,
        items: [
          {
            title: t("albums.title"),
            url: "/albums",
          },
          {
            title: t("sidebar.main.tags"),
            url: "/organization/tags",
          },
          {
            title: t("sidebar.main.collections"),
            url: "/organization/collections",
          },
        ],
      },
      {
        title: t("sidebar.main.tools"),
        url: "/tools",
        icon: Wrench,
        items: [
          {
            title: t("tools.minecraft_skin.title"),
            url: "/tools/minecraft-skin",
          },
          {
            title: "Color Palette",
            url: "/tools/color-palette",
          },
          {
            title: "Image Converter",
            url: "/tools/image-converter",
          },
          {
            title: "QR Generator",
            url: "/tools/qr-generator",
          },
        ],
      },
      {
        title: t("sidebar.main.settings"),
        url: "/settings",
        icon: Settings2,
        items: [
          {
            title: t("sidebar.secondary.preferences"),
            url: "/settings/preferences",
            icon: Sliders,
          },
          {
            title: t("sidebar.settings.general"),
            url: "/settings/general",
            icon: Settings,
          },
          {
            title: t("account.api_keys"),
            url: "/settings/api-keys",
            icon: Key,
          },
          {
            title: t("sidebar.admin.security"),
            url: "/settings/security",
            icon: Shield,
          },
          {
            title: t("sidebar.settings.integrations"),
            url: "/settings/integrations",
            icon: Share2,
          },
          {
            title: "Modules",
            url: "/modules",
            icon: FileImage,
          },
          {
            title: "Test Couleurs",
            url: "/test-colors",
            icon: TestTube,
          },
        ],
      },
    ],
    navAdmin: [
      {
        title: t("sidebar.admin.administration"),
        url: "/admin",
        icon: Shield,
        items: [
          {
            title: t("sidebar.admin.users"),
            url: "/admin/users",
          },
          {
            title: t("sidebar.admin.logs"),
            url: "/admin/logs",
          },
          {
            title: t("sidebar.admin.system_config"),
            url: "/admin/system",
          },
          {
            title: t("sidebar.admin.security"),
            url: "/admin/security",
          },
          {
            title: "Outils Minecraft",
            url: "/admin/tools",
          },
        ],
      },
    ],
    navSecondary: [
      {
        title: t("sidebar.secondary.preferences"),
        url: "/settings/preferences",
        icon: Sliders,
      },
      {
        title: t("sidebar.secondary.support"),
        url: "/support",
        icon: HelpCircle,
      },
      {
        title: t("sidebar.secondary.feedback"),
        url: "/feedback",
        icon: Send,
      },
      {
        title: t("sidebar.secondary.about_app"),
        url: "/about-app",
        icon: Info,
      },
    ],
    projects: [
      {
        name: t("sidebar.projects.starred_images"),
        url: "/gallery/starred",
        icon: Star,
      },
      {
        name: t("sidebar.projects.secure_images"),
        url: "/gallery/secure",
        icon: Shield,
      },
    ],
  };

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
                  <span className="truncate font-semibold">
                    {t("sidebar.app_name")}
                  </span>
                  <span className="truncate text-xs hidden sm:block">
                    {t("sidebar.app_description")}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain title={t("sidebar.main.gallery")} items={data.navMain} />
        {isAdmin && (
          <NavMain
            title={t("sidebar.admin.administration")}
            items={data.navAdmin}
          />
        )}
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
