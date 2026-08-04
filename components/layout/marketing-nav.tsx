"use client";

import Link from "next/link";
import Image from "next/image";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";

export function MarketingNav() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-4 flex h-14 items-center">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Image
                src="/images/logo-sxm-simple.png"
                alt=""
                width={16}
                height={16}
                className="h-4 w-4"
                priority
              />
            </span>
            <span className="font-semibold">ShareX Manager</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <ThemeToggle />
          {session ? (
            <Link href="/gallery">
              <Button variant="default" size="sm" className="gap-2">
                Accéder à la galerie
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
