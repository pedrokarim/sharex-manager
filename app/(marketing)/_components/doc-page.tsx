import Link from "next/link";
import { ArrowLeft, ListTree, type LucideIcon } from "lucide-react";

export interface DocSection {
  id: string;
  title: string;
  icon: LucideIcon;
  content: React.ReactNode;
  /** Le contenu gère lui-même sa mise en forme (grilles de cartes, etc.). */
  raw?: boolean;
}

interface DocPageProps {
  eyebrow?: string;
  title: string;
  icon: LucideIcon;
  intro: React.ReactNode;
  sections: DocSection[];
  backHref?: string;
  backLabel?: string;
  lastUpdated?: string;
}

function TableOfContents({ sections }: { sections: DocSection[] }) {
  return (
    <nav className="space-y-1">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="flex items-start gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <section.icon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-snug">{section.title}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * Coquille commune aux pages éditoriales du site vitrine (à propos, légales).
 * Sommaire collant à hauteur de contenu, colonne de lecture calibrée,
 * sections séparées par un filet plutôt qu'empilées dans des encadrés.
 */
export function DocPage({
  eyebrow,
  title,
  icon: TitleIcon,
  intro,
  sections,
  backHref,
  backLabel = "Retour",
  lastUpdated,
}: DocPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-10 lg:py-14">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sur cette page
          </p>
          <TableOfContents sections={sections} />
        </div>
      </aside>

      <article className="min-w-0 flex-1">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        ) : null}

        <header className="max-w-3xl">
          {eyebrow ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex items-start gap-3">
            <TitleIcon className="mt-1 h-8 w-8 shrink-0 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {title}
            </h1>
          </div>
          <div className="mt-5 text-base leading-relaxed text-muted-foreground">
            {intro}
          </div>
        </header>

        {/* Sommaire replié sur mobile, où l'aside est masquée. */}
        <details className="mt-8 rounded-lg border bg-card lg:hidden">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <ListTree className="h-4 w-4 text-primary" />
            Sommaire
          </summary>
          <div className="border-t px-1 py-2">
            <TableOfContents sections={sections} />
          </div>
        </details>

        <div className="mt-12 max-w-3xl space-y-12">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 border-t pt-8 first:border-t-0 first:pt-0"
            >
              <h2 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                <section.icon className="h-5 w-5 shrink-0 text-primary" />
                {section.title}
              </h2>
              {section.raw ? (
                <div className="mt-4">{section.content}</div>
              ) : (
                /* prose gère l'espacement interne ; on neutralise les marges
                   extrêmes pour maîtriser le rythme depuis le conteneur. */
                <div className="prose mt-4 max-w-none text-[0.95rem] leading-relaxed text-muted-foreground dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary prose-li:marker:text-muted-foreground/60 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {section.content}
                </div>
              )}
            </section>
          ))}
        </div>

        {lastUpdated ? (
          <p className="mt-12 max-w-3xl border-t pt-6 text-sm text-muted-foreground">
            Dernière mise à jour : {lastUpdated}
          </p>
        ) : null}
      </article>
    </div>
  );
}
