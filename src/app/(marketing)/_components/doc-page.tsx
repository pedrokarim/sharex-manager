import Link from "next/link";
import { ArrowLeft, ListTree, type LucideIcon } from "lucide-react";

import { FRONT_CONTAINER } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader, type FrontPhoto } from "@/components/front/photo-header";
import { ACCENT, KICKER } from "@/components/front/styles";
import { PageTransition } from "@/components/page-transition";
import { cn } from "@/lib/utils";

export interface DocSection {
  id: string;
  title: string;
  icon: LucideIcon;
  content: React.ReactNode;
  /** Le contenu gère lui-même sa mise en forme (grilles de tuiles, etc.). */
  raw?: boolean;
}

interface DocPageProps {
  eyebrow?: string;
  title: string;
  /** Fin du titre, en italique et en vert clair. */
  titleAccent?: string;
  /** Conservée pour les pages qui la passent : l'en-tête photo n'en a plus besoin. */
  icon?: LucideIcon;
  /** Photo de l'en-tête. */
  photo?: FrontPhoto;
  intro: React.ReactNode;
  sections: DocSection[];
  backHref?: string;
  backLabel?: string;
  lastUpdated?: string;
}

function TableOfContents({ sections }: { sections: DocSection[] }) {
  return (
    <nav className="space-y-0.5">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <section.icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span className="leading-snug">{section.title}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * Coquille commune aux pages éditoriales du site vitrine (à propos, légales) :
 * l'en-tête photographique du site, puis un sommaire collant et une colonne de
 * lecture calibrée, aux sections séparées par un filet plutôt qu'empilées dans
 * des encadrés.
 */
export function DocPage({
  eyebrow,
  title,
  titleAccent,
  photo = "mist",
  intro,
  sections,
  backHref,
  backLabel = "Retour",
  lastUpdated,
}: DocPageProps) {
  return (
    <PageTransition>
      <PhotoHeader
        photo={photo}
        kicker={
          backHref ? (
            <Link href={backHref} className="group inline-flex items-center gap-2 transition-colors hover:text-white">
              <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
              {backLabel}
            </Link>
          ) : (
            eyebrow
          )
        }
        title={title}
        titleAccent={titleAccent}
      />

      <div className={cn(FRONT_CONTAINER, "flex gap-14 pt-6 pb-24 sm:pb-32")}>
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-28">
            <p className={cn(KICKER, "px-3 pb-3 text-muted-foreground")}>Sur cette page</p>
            <TableOfContents sections={sections} />
          </div>
        </aside>

        <article className="min-w-0 flex-1">
          <div className="max-w-3xl text-pretty text-muted-foreground sm:text-lg [&_p+p]:mt-4">{intro}</div>

          {/* Sommaire replié sur mobile, où l'aside est masquée. */}
          <details className="mt-8 rounded-2xl bg-foreground/[0.045] lg:hidden">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
              <ListTree className={cn("size-4", ACCENT)} />
              Sommaire
            </summary>
            <div className="px-1 pb-2">
              <TableOfContents sections={sections} />
            </div>
          </details>

          <div className="mt-14 max-w-3xl space-y-14">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 border-t border-border/70 pt-10 first:border-t-0 first:pt-0">
                <h2 className={cn(DISPLAY, "flex items-center gap-3 text-3xl sm:text-4xl")}>
                  <section.icon className={cn("size-6 shrink-0", ACCENT)} strokeWidth={1.75} />
                  {section.title}
                </h2>
                {section.raw ? (
                  <div className="mt-6">{section.content}</div>
                ) : (
                  /* prose gère l'espacement interne ; on neutralise les marges
                     extrêmes pour maîtriser le rythme depuis le conteneur. */
                  <div className="prose mt-5 max-w-none leading-relaxed text-muted-foreground dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-a:text-emerald-700 dark:prose-a:text-emerald-400 prose-li:marker:text-muted-foreground/60 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    {section.content}
                  </div>
                )}
              </section>
            ))}
          </div>

          {lastUpdated ? (
            <p className="mt-14 max-w-3xl border-t border-border/70 pt-6 text-sm text-muted-foreground">
              Dernière mise à jour : {lastUpdated}
            </p>
          ) : null}
        </article>
      </div>
    </PageTransition>
  );
}
