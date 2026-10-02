"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ExternalLink, EyeOff, KeyRound, Loader2, Play, RotateCw, SearchX } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODULE_PATH } from "../lib/client";
import { formatSimilarity, type EngineInfo, type EngineResult, type Match } from "../lib/types";

/** Couleur d'un pourcentage : franc quand c'est sûr, neutre quand ça ne l'est pas. */
function similarityTone(match: Match): string {
  if (match.weak) return "bg-muted text-muted-foreground";
  if ((match.similarity ?? 0) >= 0.9) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

export function SimilarityPill({ match, className }: { match: Match; className?: string }) {
  const label = formatSimilarity(match.similarity);
  if (!label) return null;
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", similarityTone(match), className)}>
      {label}
    </span>
  );
}

/** Vignette d'une correspondance : floutée si le contenu est pour adultes, animée si un extrait existe. */
function MatchThumbnail({ match }: { match: Match }) {
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const hidden = match.adult && !revealed;

  if (!match.thumbnail || failed) {
    return <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><SearchX className="h-5 w-5" /></div>;
  }
  return (
    <div
      className="group/thumb relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-36"
      onMouseEnter={() => match.preview && !hidden && setPlaying(true)}
      onMouseLeave={() => setPlaying(false)}
    >
      {playing && match.preview ? (
        <video src={match.preview} autoPlay muted loop playsInline className="h-full w-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- vignette servie par le moteur
        <img
          src={match.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover transition", hidden && "scale-110 blur-xl")}
        />
      )}
      {hidden && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 text-[11px] font-medium text-white"
        >
          <EyeOff className="h-4 w-4" />
          Afficher
        </button>
      )}
      {match.preview && !hidden && !playing && (
        <span className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
          <Play className="h-2.5 w-2.5 fill-current" />
          Extrait
        </span>
      )}
    </div>
  );
}

function MatchCard({ match, index }: { match: Match; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
      className={cn("flex gap-3 rounded-xl border bg-card p-2.5", match.weak && "opacity-75")}
    >
      <MatchThumbnail match={match} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium leading-5 line-clamp-2">{match.title}</p>
          <SimilarityPill match={match} />
        </div>
        {match.subtitle && <p className="text-xs text-muted-foreground line-clamp-1">{match.subtitle}</p>}
        {match.detail && <p className="text-xs text-muted-foreground line-clamp-2">{match.detail}</p>}
        {match.tags && match.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {match.tags.map((tag) => (
              <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
        {match.links.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {match.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {link.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}

interface EngineSectionProps {
  engine: EngineInfo;
  /** `undefined` : pas encore lancé ; `"loading"` : en cours. */
  result: EngineResult | "loading" | undefined;
  showWeak: boolean;
  onRetry: () => void;
  /** Ouvre la page de résultats du moteur lui-même, dans un onglet. */
  onOpenExternal: () => void;
}

/** Les réponses d'un moteur : son état, puis ses correspondances. */
export function EngineSection({ engine, result, showWeak, onRetry, onOpenExternal }: EngineSectionProps) {
  const loading = result === "loading";
  const done = result && result !== "loading" ? result : null;
  const strong = done?.matches.filter((match) => !match.weak) ?? [];
  const weak = done?.matches.filter((match) => match.weak) ?? [];
  const [expanded, setExpanded] = useState(false);
  const displayWeak = showWeak || expanded;
  const shown = displayWeak ? [...strong, ...weak] : strong;

  const status = loading
    ? "Recherche…"
    : !done
      ? "En attente"
      : done.status === "ok"
        ? strong.length > 0
          ? `${strong.length} résultat${strong.length > 1 ? "s" : ""}`
          : "Rien de sûr"
        : done.status === "empty"
          ? "Aucun résultat"
          : done.status === "needs-key"
            ? "Clé requise"
            : "Échec";

  return (
    <section className="space-y-2.5">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <BrandLogo brand={engine.brand} className="size-5 rounded-sm" />
        <h3 className="text-sm font-semibold">{engine.name}</h3>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
            done?.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {status}
        </span>
        {done?.status === "ok" && done.message && <span className="text-xs text-muted-foreground">{done.message}</span>}
        {/* Sans clé, le moteur tient sur une ligne : il reste ouvrable dans un onglet. */}
        {done?.status === "needs-key" && (
          <Link
            href={`${MODULE_PATH}/settings`}
            title={done.message}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <KeyRound className="h-3 w-3" />
            Ajouter une clé pour l’intégrer
          </Link>
        )}
        <div className="ml-auto flex items-center gap-1">
          {done && done.status !== "needs-key" && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRetry} aria-label={`Relancer ${engine.name}`} title="Relancer">
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onOpenExternal}>
            Ouvrir sur {engine.name}
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </header>

      {loading && (
        <div className="flex gap-3 rounded-xl border p-2.5">
          <div className="h-24 w-24 shrink-0 animate-pulse rounded-lg bg-muted sm:w-36" />
          <div className="flex flex-1 flex-col gap-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      )}

      {done?.status === "error" && (
        <p className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {done.message}
        </p>
      )}

      {done && (done.status === "empty" || (done.status === "ok" && shown.length === 0)) && (
        <p className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          {done.status === "empty"
            ? `${engine.name} ne connaît pas cette image.`
            : `${engine.name} n’a rien trouvé de sûr : ${weak.length} résultat${weak.length > 1 ? "s" : ""} sous son seuil de confiance.`}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="grid gap-2 xl:grid-cols-2 min-[1900px]:grid-cols-3">
          {shown.map((match, index) => (
            <MatchCard key={`${match.links[0]?.url ?? match.title}-${index}`} match={match} index={index} />
          ))}
        </ul>
      )}

      {done && weak.length > 0 && !showWeak && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {expanded
            ? "Masquer les résultats peu sûrs"
            : `Afficher ${weak.length} résultat${weak.length > 1 ? "s" : ""} peu sûr${weak.length > 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}
