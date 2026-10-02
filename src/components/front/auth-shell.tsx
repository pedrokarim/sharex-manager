import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { FOREST } from "@/components/front/container";
import { DISPLAY, frontDisplay } from "@/components/front/fonts";
import type { FrontPhoto } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  photo?: FrontPhoto;
  /** Le formulaire, ou le message de la page. */
  children: ReactNode;
}

/**
 * Gabarit des pages de compte – connexion, inscription, mot de passe oublié.
 *
 * Sur grand écran, une photo de nature occupe la moitié gauche et se fond dans
 * la page vers la droite, là où se tient le formulaire : pas de trait entre les
 * deux. Sur mobile, la photo devient un bandeau en haut, fondu par le bas.
 */
export function AuthShell({ photo = "glade", children }: AuthShellProps) {
  return (
    <div className={cn(frontDisplay.variable, "relative grid min-h-svh lg:grid-cols-[1.1fr_1fr]")}>
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>

      <aside
        className="relative isolate flex h-64 flex-col justify-between overflow-hidden p-6 text-white sm:p-10 lg:h-auto"
        style={{ backgroundColor: FOREST }}
      >
        <div aria-hidden className="absolute inset-0 -z-10">
          <Image src={`/images/home/nature-${photo}.webp`} alt="" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${FOREST}cc 0%, ${FOREST}40 35%, ${FOREST}66 65%, ${FOREST}e6 100%)` }} />
          {/* La photo se dissout dans la page : vers le bas sur mobile, vers la droite ensuite. */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent lg:hidden" />
          <div className="absolute inset-y-0 right-0 hidden w-48 bg-gradient-to-l from-background to-transparent lg:block" />
        </div>

        <Link href="/" className="flex w-fit items-center gap-3">
          {/* Le pictogramme seul, en grand : ni carré ni cercle derrière lui. */}
          <Image src="/images/logo-sxm-simple.png" alt="" width={40} height={40} className="size-10" priority />
          <span className="text-lg font-semibold tracking-tight">ShareX Manager</span>
        </Link>

        <Reveal immediate delay={0.15} className="hidden lg:block">
          <p className={cn(DISPLAY, "max-w-[11ch] text-6xl leading-[1.0] xl:text-7xl")}>
            Vos captures, <em className="text-[#bfe6c9]">chez vous.</em>
          </p>
          <p className="mt-6 max-w-[34ch] text-white/75">
            Upload en un raccourci, lien public immédiat, albums et statistiques. Sur votre serveur.
          </p>
        </Reveal>
      </aside>

      <main className="relative flex flex-col px-6 pt-2 pb-10 sm:px-10 lg:py-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            Retour au site
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <Reveal immediate className="w-full max-w-sm">
            {children}
          </Reveal>
        </div>
      </main>
    </div>
  );
}

interface AuthNoticeProps {
  title: string;
  /** Fin du titre, en italique et en vert. */
  titleAccent?: string;
  children: ReactNode;
  action: { label: string; href: string };
}

/** Message d'une page de compte qui n'a pas de formulaire à montrer. */
export function AuthNotice({ title, titleAccent, children, action }: AuthNoticeProps) {
  return (
    <div>
      <h1 className={cn(DISPLAY, "text-4xl leading-[1.05] text-balance sm:text-5xl")}>
        {title}
        {titleAccent ? (
          <>
            {" "}
            <em className="text-emerald-700 dark:text-emerald-400">{titleAccent}</em>
          </>
        ) : null}
      </h1>
      <p className="mt-5 text-pretty text-muted-foreground">{children}</p>
      <Link
        href={action.href}
        className="group mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        {action.label}
      </Link>
    </div>
  );
}
