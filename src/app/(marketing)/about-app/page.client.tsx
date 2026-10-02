"use client";

import { ArrowUpRight, Globe, Mail } from "lucide-react";

import { FRONT_NARROW } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER, PILL_SOFT, PILL_SOLID } from "@/components/front/styles";
import { appConfig } from "@/lib/constant";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AboutPageClient() {
  const { t } = useTranslation();

  return (
    <>
      <PhotoHeader
        photo="pines"
        kicker={`Version ${appConfig.version}`}
        title={appConfig.name}
        description={appConfig.description}
      />

      <div className={cn(FRONT_NARROW, "pt-6 pb-24 sm:pb-32")}>
        <Reveal>
          <p className={cn(KICKER, ACCENT)}>{t("about.title")}</p>
          <h2 className={cn(DISPLAY, "mt-4 text-4xl leading-[1.05] sm:text-5xl")}>{t("about.project.title")}</h2>
          <p className="mt-5 text-pretty text-muted-foreground sm:text-lg">{t("about.project.description")}</p>
        </Reveal>

        <Reveal className="mt-14 border-t border-border/70 pt-10">
          <h2 className={cn(DISPLAY, "text-3xl sm:text-4xl")}>{t("about.contact.title")}</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={appConfig.authorUrl} target="_blank" rel="noopener noreferrer" className={PILL_SOLID}>
              <Globe className="size-4" />
              {t("about.contact.website")}
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a href={`mailto:${appConfig.authorEmail}`} className={PILL_SOFT}>
              <Mail className="size-4" />
              {t("about.contact.email")}
            </a>
          </div>
        </Reveal>

        <p className="mt-14 border-t border-border/70 pt-6 text-sm text-muted-foreground">
          {t("about.footer")}{" "}
          <a
            href={appConfig.authorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {appConfig.author}
          </a>
        </p>
      </div>
    </>
  );
}
