"use client";

import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  Key,
  LogOut,
  Sparkles,
} from "lucide-react";
import {
  useSidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "../ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ThemeOptions, useThemeIcon } from "../theme-toggle";
import { Avatar, AvatarImage, AvatarFallback } from "@radix-ui/react-avatar";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

export interface NavUserData {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/**
 * Le compte, en pied de barre latérale. Ses informations viennent du serveur
 * (`user`) : il s'affiche avec la page, sans case d'attente. La session du
 * navigateur prend le relais quand elle est là, pour suivre un changement de
 * nom ou d'avatar sans recharger.
 */
export function NavUser({ user: initialUser }: { user: NavUserData }) {
  const { data: session } = useSession();
  const user = session?.user ?? initialUser;
  const { isMobile } = useSidebar();
  const { t } = useTranslation();
  const ThemeIcon = useThemeIcon();

  const handleSignOut = async () => {
    await signOut();
    toast.success(t("common.logout_success"));
    window.location.href = "/";
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 min-w-8 min-h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <AvatarImage
                  src={user.image || ""}
                  alt={user.name || ""}
                />
                <AvatarFallback className="rounded-lg font-bold uppercase">
                  {user.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {user.name}
                </span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <AvatarImage
                    src={user.image || ""}
                    alt={user.name || ""}
                  />
                  <AvatarFallback className="rounded-lg font-bold uppercase">
                    {user.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user.name}
                  </span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/upgrade">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("account.upgrade_pro")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/account">
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  {t("account.my_account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/api-keys">
                  <Key className="mr-2 h-4 w-4" />
                  {t("account.api_keys")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* Le thème, toujours à portée : barre repliée, le bouton de tête
                n'est plus visible. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ThemeIcon className="mr-2 h-4 w-4" />
                {t("sidebar.theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <ThemeOptions />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("common.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
