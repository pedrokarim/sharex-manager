import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HOME_CONTAINER } from "@/components/home/container";
import { cn } from "@/lib/utils";

interface ImageWallProps {
  /** Noms de fichiers publics. Les vignettes sont servies par /api/thumbnails. */
  images: string[];
  kicker: string;
  title: string;
  cta: { label: string; href: string };
}

/**
 * Mur d'images en fondu : la dernière preuve avant la partie technique.
 *
 * Volontairement décoratif – les vignettes ne sont pas cliquables une à une,
 * c'est le bloc entier qui mène au catalogue.
 */
export function ImageWall({ images, kicker, title, cta }: ImageWallProps) {
  // La grille passe de 3 à 6 colonnes : seuls les multiples de 6 se posent sans
  // dernière ligne incomplète, aux deux largeurs. En dessous d'une ligne pleine,
  // le mur ressemble à un bug d'affichage – on ne le montre pas.
  const rows = Math.min(Math.floor(images.length / 6), 2);
  if (rows === 0) return null;

  const tiles = images.slice(0, rows * 6);

  return (
    <section className="relative border-t border-border/60 pb-20 lg:pb-28">
      <div className={cn(HOME_CONTAINER, "max-w-3xl pt-20 pb-9 text-center lg:pt-28")}>
        <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
          {kicker}
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-balance sm:text-3xl lg:text-4xl">
          {title}
        </h2>
      </div>

      <div className="relative">
        <div
          aria-hidden
          className={cn(HOME_CONTAINER, "grid grid-cols-3 gap-2 lg:grid-cols-6")}
        >
          {tiles.map((name) => (
            // eslint-disable-next-line @next/next/no-img-element -- vignettes
            // décoratives déjà redimensionnées par /api/thumbnails ; passer par
            // next/image ferait un second retraitement pour rien.
            <img
              key={name}
              src={`/api/thumbnails/${encodeURIComponent(name)}`}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-video w-full rounded-lg object-cover"
            />
          ))}
        </div>

        {/* Le mur se perd dans le fond plutôt que de s'arrêter net. Sur une
            seule ligne, un fondu haut délaverait toute la rangée. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent",
            rows > 1 ? "h-24" : "h-16",
          )}
        />
      </div>

      <div className="mt-8 text-center">
        <Link
          href={cta.href}
          className="group inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold transition hover:bg-accent"
        >
          {cta.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
