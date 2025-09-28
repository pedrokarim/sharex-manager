"use client";

import Link from "next/link";
import { Image, LogIn, Wrench, Gamepad2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslation } from "@/lib/i18n";

export function ToolsNav() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-4 flex h-14 items-center">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Image className="h-6 w-6" />
            <span className="font-semibold">ShareX Manager</span>
          </Link>
          <span className="text-muted-foreground">•</span>
          <Link href="/tools" className="flex items-center gap-2 text-primary">
            <Wrench className="h-4 w-4" />
            <span className="font-medium">{t("sidebar.main.tools")}</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <nav className="flex items-center space-x-6">
            <Link
              href="/tools"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {t("tools.title")}
            </Link>
            <Link
              href="/tools/minecraft-skin"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <Gamepad2 className="h-4 w-4" />
              {t("tools.minecraft_skin.title")}
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle />
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <Home className="h-4 w-4" />
              Accueil
            </Button>
          </Link>
          {session ? (
            <Link href="/gallery">
              <Button variant="default" size="sm" className="gap-2">
                Ma galerie
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="default" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                Se connecter
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
