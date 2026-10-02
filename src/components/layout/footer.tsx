import Link from "next/link";
import { FRONT_WIDE } from "@/components/front/container";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function Footer() {
  return (
    <footer className="border-t">
      {/* Même colonne que la barre de navigation : le pied s'aligne sur elle. */}
      <div className={cn(FRONT_WIDE, "py-6")}>
        <div className="flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Ascencia – code sous licence GPL v3.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <Link
                href="/about"
                className="hover:text-primary transition-colors"
              >
                À propos
              </Link>
              <Link
                href="/contact"
                className="hover:text-primary transition-colors"
              >
                Contact
              </Link>
              <Link
                href="/legal"
                className="hover:text-primary transition-colors"
              >
                Mentions légales
              </Link>
              <Link
                href="/legal/terms"
                className="hover:text-primary transition-colors"
              >
                CGU
              </Link>
              <Link
                href="/legal/privacy"
                className="hover:text-primary transition-colors"
              >
                Confidentialité
              </Link>
              <Link
                href="https://ascencia.re"
                className="hover:text-primary transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ascencia
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
