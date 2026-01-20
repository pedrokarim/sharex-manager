"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  Home,
  Images,
  Menu,
  X,
  LayoutDashboard,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/catalog", label: "Accueil", icon: Home },
  { href: "/catalog/albums", label: "Albums", icon: FolderOpen },
  { href: "/catalog/gallery", label: "Galerie", icon: Images },
];

export function CatalogNavbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // La page d'accueil du catalogue a un hero sombre, les autres pages non
  const isHeroPage = pathname === "/catalog";
  const useTransparentStyle = isHeroPage && !isScrolled;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        useTransparentStyle
          ? "bg-transparent"
          : "bg-background/80 backdrop-blur-xl border-b border-border/50"
      )}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16 sm:h-20">
          {/* Logo */}
          <Link
            href="/catalog"
            className={cn(
              "flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight transition-colors justify-self-start min-w-0",
              useTransparentStyle ? "text-white" : "text-foreground"
            )}
          >
            <img
              src="/images/logo-sxm-catalog.png"
              alt="SXM"
              className="h-8 w-8"
            />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              SXM Catalog
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1 col-start-2 justify-self-center">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                    useTransparentStyle
                      ? isActive
                        ? "bg-white/20 text-white"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                      : isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* CTA Button */}
          <div className="hidden md:flex items-center gap-2 col-start-3 justify-self-end min-w-0">
            <Link href="/">
              <Button
                variant={useTransparentStyle ? "secondary" : "outline"}
                size="sm"
                className={cn(
                  "rounded-full px-5 transition-all duration-300 gap-2",
                  useTransparentStyle &&
                    "bg-white/10 hover:bg-white/20 text-white border-0"
                )}
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à l&apos;accueil
              </Button>
            </Link>

            <Link href={session?.user ? "/gallery" : "/login"}>
              <Button
                variant={useTransparentStyle ? "secondary" : "default"}
                size="sm"
                className={cn(
                  "rounded-full px-6 transition-all duration-300 gap-2",
                  useTransparentStyle &&
                    "bg-white/20 hover:bg-white/30 text-white border-0"
                )}
              >
                {session?.user ? (
                  <>
                    <LayoutDashboard className="h-4 w-4" />
                    Mon espace
                  </>
                ) : (
                  "Connexion"
                )}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "md:hidden col-start-3 justify-self-end",
              useTransparentStyle ? "text-white" : "text-foreground"
            )}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div
            className={cn(
              "md:hidden pb-4 space-y-2",
              useTransparentStyle
                ? "bg-black/50 backdrop-blur-xl rounded-lg p-4 mt-2"
                : "bg-background/95 backdrop-blur-xl rounded-lg p-4 mt-2 border border-border/50"
            )}
          >
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                    useTransparentStyle
                      ? isActive
                        ? "bg-white/20 text-white"
                        : "text-white/80 hover:bg-white/10"
                      : isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href={session?.user ? "/gallery" : "/login"}
              onClick={() => setIsMobileMenuOpen(false)}
              className="block"
            >
              <Button className="w-full mt-2 rounded-lg gap-2">
                {session?.user ? (
                  <>
                    <LayoutDashboard className="h-4 w-4" />
                    Mon espace
                  </>
                ) : (
                  "Connexion"
                )}
              </Button>
            </Link>

            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="block">
              <Button
                variant={useTransparentStyle ? "secondary" : "outline"}
                className={cn(
                  "w-full rounded-lg gap-2",
                  useTransparentStyle &&
                    "bg-white/10 hover:bg-white/20 text-white border-0"
                )}
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à l&apos;accueil
              </Button>
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
