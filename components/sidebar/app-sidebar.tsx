"use client";

import type * as React from "react";
import { useState, useEffect } from "react";
import {
  Home,
  Image as ImageIcon,
  Upload,
  Settings2,
  FileImage,
  History,
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
  AudioWaveform,
  Palette,
  MoreHorizontal,
  Clock,
  Star,
  Lock,
  Cog,
  BarChart3,
  Tag,
  Grid3X3,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useTranslation } from "@/lib/i18n";
import { resolveIcon } from "@/lib/utils/resolve-icon";

import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "../ui/sidebar";

interface ModuleNavApiItem {
  moduleName: string;
  title: string;
  url: string;
  icon: string;
  subItems: { title: string; url: string }[];
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { t } = useTranslation();
  const [moduleNavItems, setModuleNavItems] = useState<ModuleNavApiItem[]>([]);

  useEffect(() => {
    fetch("/api/modules/nav-items")
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setModuleNavItems(data.items);
      })
      .catch(() => {});
  }, []);

  // Convert module nav items to sidebar format
  const moduleMenuItems = moduleNavItems.map((item) => ({
    title: item.title,
    url: item.url,
    icon: resolveIcon(item.icon),
    items: item.subItems.map((sub) => ({
      title: sub.title,
      url: sub.url,
    })),
  }));

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
            icon: Clock,
          },
          {
            title: t("sidebar.main.starred"),
            url: "/gallery/starred",
            icon: Star,
          },
          {
            title: t("sidebar.main.secure"),
            url: "/gallery/secure",
            icon: Lock,
          },
          {
            title: t("sidebar.main.settings"),
            url: "/gallery/settings",
            icon: Cog,
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
            icon: History,
          },
          {
            title: t("sidebar.main.configuration"),
            url: "/uploads/config",
            icon: Settings,
          },
          {
            title: t("sidebar.main.stats"),
            url: "/uploads/stats",
            icon: BarChart3,
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
            icon: FolderOpen,
          },
          {
            title: t("sidebar.main.tags"),
            url: "/organization/tags",
            icon: Tag,
          },
          {
            title: t("sidebar.main.collections"),
            url: "/organization/collections",
            icon: Grid3X3,
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
            title: t("sidebar.secondary.theme"),
            url: "/settings/theme",
            icon: Palette,
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
    navOther: [
      {
        title: "Outils",
        url: "/tools",
        icon: MoreHorizontal,
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
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Link href="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Image
                    src="/images/logo-sxm-simple.png"
                    alt="ShareX Manager Logo"
                    width={32}
                    height={32}
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {t("sidebar.app_name")}
                  </span>
                  <span className="truncate text-xs">
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
        <NavMain
          title="Autre"
          items={[...data.navOther, ...moduleMenuItems]}
        />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
