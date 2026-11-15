"use client";

import * as React from "react";
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
  Wrench,
  AudioWaveform,
  Palette,
  MoreHorizontal,
  Clock,
  Star,
  Lock,
  BarChart3,
  Tag,
  Grid3X3,
  LayoutDashboard,
  ScrollText,
  Server,
  Package,
  Link2,
  PlugZap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import type { ModuleNavEntry } from "@/lib/modules/nav-items";
import { resolveIcon } from "@/lib/utils/resolve-icon";

import { NavMain, type NavMenuItem } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser, type NavUserData } from "./nav-user";
import { ThemeToggle } from "../theme-toggle";
import {
  activeSectionIds,
  collectHrefs,
  findActiveHref,
  linkSectionId,
  openSections,
  type NavSection,
} from "./nav-state";
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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /**
   * Rôle et modules lus côté serveur. Demandés depuis le navigateur, ils
   * arrivaient après l'affichage : la section « Administration » et les
   * modules surgissaient dans une barre déjà en place.
   */
  isAdmin: boolean;
  moduleNavItems: ModuleNavEntry[];
  user: NavUserData;
}

/** Section du groupe Administration, replié tant qu'on n'est pas sur une page d'admin. */
const ADMIN_SECTION_ID = "group:admin";

export function AppSidebar({ isAdmin, moduleNavItems, user, ...props }: AppSidebarProps) {
  const { t } = useTranslation();

  // Convert module nav items to sidebar format
  const moduleMenuItems = moduleNavItems.map((item) => ({
    title: item.title,
    url: item.url,
    icon: resolveIcon(item.icon),
    image: item.logo,
    items: item.subItems.map((sub) => ({
      title: sub.title,
      url: sub.url,
    })),
  }));

  const data = {
    navMain: [
      {
        title: t("sidebar.main.gallery"),
        url: "/gallery",
        icon: ImageIcon,
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
          // Réservée aux admins (la page renvoie les autres vers l'accueil).
          ...(isAdmin
            ? [
                {
                  title: t("sidebar.main.configuration"),
                  url: "/uploads/config",
                  icon: Settings,
                },
              ]
            : []),
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
            title: t("account.api_keys"),
            url: "/settings/api-keys",
            icon: Key,
          },
          {
            title: t("sidebar.settings.integrations"),
            url: "/settings/integrations",
            icon: Share2,
          },
          // La gestion des modules est réservée aux admins, comme sa page.
          ...(isAdmin
            ? [
                {
                  title: "Modules",
                  url: "/modules",
                  icon: FileImage,
                },
              ]
            : []),
        ],
      },
    ],
    // À plat sous le titre « Administration », qui replie le groupe entier.
    // Aucune de ces pages n'a de sous-page, donc pas de sous-menu.
    navAdmin: [
      {
        title: t("sidebar.admin.overview"),
        url: "/admin",
        icon: LayoutDashboard,
      },
      {
        title: t("sidebar.admin.users"),
        url: "/admin/users",
        icon: Users,
      },
      {
        title: t("sidebar.admin.logs"),
        url: "/admin/logs",
        icon: ScrollText,
      },
      {
        title: t("sidebar.admin.global_theme"),
        url: "/admin/theme",
        icon: Palette,
      },
      {
        title: t("sidebar.admin.system_config"),
        url: "/admin/system",
        icon: Server,
      },
      {
        title: t("sidebar.admin.modules"),
        url: "/admin/modules",
        icon: Package,
      },
      {
        title: "Comptes connectés",
        url: "/admin/connections",
        icon: Link2,
      },
      {
        title: "Services externes",
        url: "/admin/services",
        icon: PlugZap,
      },
      {
        title: t("sidebar.admin.security"),
        url: "/admin/security",
        icon: Shield,
      },
    ],
    navOther: [
      {
        // Passerelle vers les services annexes : pas de sous-menu, la page
        // elle-même présente Just Tools et MCInfo.
        title: "Outils",
        url: "/tools",
        icon: MoreHorizontal,
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

  // Modules d'abord, puis la passerelle vers les outils annexes.
  const navModules: NavMenuItem[] = [...moduleMenuItems, ...data.navOther];
  const navAdmin: NavMenuItem[] = isAdmin ? data.navAdmin : [];

  // Sections repliables : chaque lien à sous-liens, et le groupe Administration.
  const sections: NavSection[] = [
    ...[...data.navMain, ...navModules]
      .filter((item) => item.items?.length)
      .map((item) => ({ id: linkSectionId(item.url), links: [item] })),
    ...(isAdmin ? [{ id: ADMIN_SECTION_ID, links: navAdmin }] : []),
  ];

  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const activeHref = findActiveHref(
    collectHrefs([...data.navMain, ...navModules, ...navAdmin, ...data.navSecondary]),
    pathname,
    search,
  );
  const sectionsToOpen = activeSectionIds(sections, activeHref);

  // Fermées par défaut, sauf celle de la page courante. À chaque arrivée sur
  // une page, sa section s'ouvre ; les autres restent comme on les a laissées.
  const [openState, setOpenState] = React.useState<Record<string, boolean>>(() =>
    openSections({}, sectionsToOpen),
  );
  const location = `${pathname}?${search}`;
  const [seenLocation, setSeenLocation] = React.useState(location);
  if (seenLocation !== location) {
    setSeenLocation(location);
    setOpenState((current) => openSections(current, sectionsToOpen));
  }

  const navSections = {
    open: openState,
    onOpenChange: (id: string, open: boolean) =>
      setOpenState((current) => (current[id] === open ? current : { ...current, [id]: open })),
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="pr-10 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:pr-0"
            >
              <Link href="/">
                {/* Le pictogramme seul, sans cadre : une boîte autour le
                    rapetisserait encore. */}
                <Image
                  src="/images/logo-sxm-simple.png"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 shrink-0 group-data-[collapsible=icon]:size-8"
                />
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
            {/* Le thème se règle ici, en tête, au bout de la ligne du nom. Barre
                repliée, il reste dans le menu du compte. */}
            <ThemeToggle className="absolute top-1/2 right-1 size-8 -translate-y-1/2 text-sidebar-foreground/70 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Ordre : l'espace personnel, les modules (visibles sans défiler,
            même sur téléphone), puis l'administration, repliée. */}
        <NavMain
          title={t("sidebar.main.workspace")}
          items={data.navMain}
          activeHref={activeHref}
          sections={navSections}
        />
        <NavMain
          title={t("sidebar.main.modules_and_tools")}
          items={navModules}
          activeHref={activeHref}
          sections={navSections}
        />
        {isAdmin && (
          <NavMain
            title={t("sidebar.admin.administration")}
            items={navAdmin}
            activeHref={activeHref}
            sections={navSections}
            groupSectionId={ADMIN_SECTION_ID}
          />
        )}
        <NavSecondary items={data.navSecondary} activeHref={activeHref} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
