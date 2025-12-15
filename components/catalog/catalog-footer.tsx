"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function CatalogFooter() {
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground">
              © 2025 Ascencia. Tous droits réservés.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex gap-4 text-sm text-muted-foreground">
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
