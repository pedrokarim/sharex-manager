"use client";

import { Check, Construction } from "lucide-react";

import { FRONT_NARROW } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER } from "@/components/front/styles";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function UpgradePageClient() {
  const { t } = useTranslation();
  const rawFeatures = t("upgrade.features.list");
  const features: string[] = Array.isArray(rawFeatures) ? rawFeatures : [];

  return (
    <>
      <PhotoHeader photo="mist" kicker="Pro" title={t("upgrade.title")} description={t("upgrade.description")} />

      <div className={cn(FRONT_NARROW, "pt-6 pb-24 sm:pb-32")}>
        <Reveal>
          <p className={cn(KICKER, ACCENT)}>Pro</p>
          <h2 className={cn(DISPLAY, "mt-4 text-4xl leading-[1.05] sm:text-5xl")}>{t("upgrade.features.title")}</h2>
        </Reveal>
        <ul className="mt-8">
          {features.map((feature, index) => (
            <Reveal as="li" key={feature} delay={index * 0.06} y={18} className="flex items-center gap-4 border-b border-border/70 py-5 first:border-t">
              <Check className={cn("size-5 shrink-0", ACCENT)} />
              <span className="font-medium">{feature}</span>
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-10 flex items-start gap-4 rounded-[22px] bg-foreground/[0.045] p-6">
          <Construction className={cn("mt-0.5 size-5 shrink-0", ACCENT)} />
          <p className="text-pretty text-muted-foreground">{t("upgrade.coming_soon.description")}</p>
        </Reveal>
      </div>
    </>
  );
}
