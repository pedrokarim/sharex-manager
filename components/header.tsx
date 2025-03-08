"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { UserCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

export function Header() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut({
      redirect: true,
      redirectTo: "/",
    });
    toast.success(t("common.logout_success"));
  };

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center px-4">
        <Link href="/" className="font-bold">
          ShareX Manager
        </Link>

        <nav className="ml-auto flex items-center gap-4">
          {session ? (
            <>
              <Link href="/gallery">
                <Button variant="ghost">{t("navigation.gallery")}</Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <UserCircle className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSignOut}>
                    {t("common.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/login">
              <Button>{t("common.login")}</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
