"use client";

import { useSyncExternalStore } from "react";
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
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@radix-ui/react-avatar";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

const subscribeNothing = () => () => {};

export function NavUser() {
  const { data: session, isPending } = useSession();
  // Le serveur ne connaît pas la session du client : jusqu'au montage, les
  // deux rendent le même squelette, sinon l'hydratation échoue quand la
  // session est déjà en cache côté navigateur.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const { isMobile } = useSidebar();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    toast.success(t("common.logout_success"));
    window.location.href = "/";
  };

  if (!mounted || (isPending && !session)) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex h-12 items-center gap-2 px-2" aria-hidden>
            <div className="size-8 shrink-0 animate-pulse rounded-lg bg-sidebar-accent" />
            <div className="grid flex-1 gap-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-sidebar-accent" />
              <div className="h-2.5 w-28 animate-pulse rounded bg-sidebar-accent" />
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!session?.user) return null;

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
                  src={session.user.image || ""}
                  alt={session.user.name || ""}
                />
                <AvatarFallback className="rounded-lg font-bold uppercase">
                  {session.user.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {session.user.name}
                </span>
                <span className="truncate text-xs">{session.user.email}</span>
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
                    src={session.user.image || ""}
                    alt={session.user.name || ""}
                  />
                  <AvatarFallback className="rounded-lg font-bold uppercase">
                    {session.user.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {session.user.name}
                  </span>
                  <span className="truncate text-xs">{session.user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href="/upgrade">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("account.upgrade_pro")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href="/account">
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  {t("account.my_account")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/settings/api-keys">
                  <Key className="mr-2 h-4 w-4" />
                  {t("account.api_keys")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
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
