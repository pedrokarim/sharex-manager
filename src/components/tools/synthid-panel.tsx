"use client";

import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { DISPLAY } from "@/components/front/fonts";
import { KICKER, PILL_SOLID } from "@/components/front/styles";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SYNTHID_URL = "https://synthid.com/";

/**
 * Les éditeurs dont SynthID lit les filigranes, avec les logos que synthid.com
 * affiche lui-même sous sa zone de dépôt. Le site les passe en noir : on fait
 * de même, et on les inverse en thème sombre. Google garde ses couleurs.
 */
const PARTNERS = [
  { name: "Google", src: "/logos/synthid/google.svg", width: 106, height: 34, mono: false },
  { name: "OpenAI", src: "/logos/synthid/openai.png", width: 717, height: 193, mono: true },
  { name: "NVIDIA", src: "/logos/synthid/nvidia.png", width: 217, height: 42, mono: true },
  { name: "Kakao", src: "/logos/synthid/kakao.png", width: 600, height: 182, mono: true },
] as const;

const STEPS = ["step1", "step2", "step3"] as const;

/**
 * Encadré qui présente SynthID Detector, le détecteur officiel de Google.
 *
 * Simple lien : ses conditions interdisent toute requête automatisée, alors
 * le visiteur y va lui-même, se connecte et dépose son fichier. Rien ne part
 * d'ici vers Google.
 */
export function SynthIdPanel({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="synthid-title" className={cn("rounded-[28px] bg-foreground/[0.045] p-6 sm:p-8", className)}>
      <div className="flex items-center gap-4">
        {/* Le bouclier sur une tuile blanche, comme sur l'image de partage du site : son bleu reste lisible en thème sombre. */}
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
          <BrandLogo brand="synthid" className="size-9 p-0" />
        </span>
        <div className="min-w-0">
          <p className={cn(KICKER, "text-muted-foreground")}>{t("tools.origin.synthid.kicker")}</p>
          <h2 id="synthid-title" className={cn(DISPLAY, "mt-1 text-2xl sm:text-3xl")}>
            SynthID Detector
          </h2>
        </div>
      </div>

      <p className="mt-5 text-pretty text-muted-foreground">{t("tools.origin.synthid.intro")}</p>

      <ol className="mt-7 space-y-4">
        {STEPS.map((step, index) => (
          <li key={step} className="flex min-w-0 items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="leading-7 font-medium">{t(`tools.origin.synthid.${step}_title`)}</p>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{t(`tools.origin.synthid.${step}_text`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-sm text-muted-foreground">{t("tools.origin.synthid.partners")}</p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
          {PARTNERS.map((partner) => (
            <li key={partner.name} className="flex h-6 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- petit logo statique, sans intérêt pour next/image */}
              <img
                src={partner.src}
                alt={partner.name}
                width={partner.width}
                height={partner.height}
                draggable={false}
                className={cn("h-4 w-auto max-w-full sm:h-[18px]", partner.mono && "brightness-0 dark:invert")}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <a href={SYNTHID_URL} target="_blank" rel="noopener noreferrer" className={cn(PILL_SOLID, "self-start sm:self-auto")}>
          {t("tools.origin.synthid.open")}
          <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
        <p className="min-w-0 text-sm text-pretty text-muted-foreground sm:max-w-sm sm:text-right">{t("tools.origin.synthid.caveat")}</p>
      </div>

      <p className="mt-5 text-xs text-pretty text-muted-foreground">{t("tools.origin.synthid.privacy")}</p>
    </section>
  );
}
