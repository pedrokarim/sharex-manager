"use client";

import { ArrowUpRight, MessageCircle } from "lucide-react";

import { FRONT_CONTAINER, FRONT_NARROW } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER, PILL_SOFT, PILL_SOLID } from "@/components/front/styles";
import { Github } from "@/components/ui/icons";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const CHANNELS = [
  {
    key: "discord",
    icon: MessageCircle,
    listTitle: "support.discord.benefits",
    list: "support.discord.benefits_list",
    button: "support.discord.join_button",
    href: "https://discord.gg/rTd95UpUEb",
    pill: PILL_SOLID,
  },
  {
    key: "github",
    icon: Github,
    listTitle: "support.github.available",
    list: "support.github.available_list",
    button: "support.github.view_button",
    href: "https://github.com/AliasPedroKarim/sharex-manager",
    pill: PILL_SOFT,
  },
] as const;

export function SupportPageClient() {
  const { t } = useTranslation();

  return (
    <>
      <PhotoHeader photo="lake" kicker="Support" title={t("support.title")} description={t("support.description")} />

      <ul className={cn(FRONT_CONTAINER, "grid gap-5 pt-6 md:grid-cols-2")}>
        {CHANNELS.map((channel, index) => (
          <Reveal as="li" key={channel.key} delay={index * 0.1} className="flex">
            <div className="flex w-full flex-col rounded-[28px] bg-foreground/[0.045] p-8">
              <channel.icon className={cn("size-7", ACCENT)} />
              <h2 className={cn(DISPLAY, "mt-6 text-3xl sm:text-4xl")}>{t(`support.${channel.key}.title`)}</h2>
              <p className="mt-3 text-pretty text-muted-foreground">{t(`support.${channel.key}.description`)}</p>
              <p className={cn(KICKER, "mt-8 text-muted-foreground")}>{t(channel.listTitle)}</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[0, 1, 2, 3].map((item) => (
                  <li key={item} className="flex items-baseline gap-3">
                    <span aria-hidden className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    {t(`${channel.list}.${item}`)}
                  </li>
                ))}
              </ul>
              <a href={channel.href} target="_blank" rel="noopener noreferrer" className={cn(channel.pill, "mt-8 w-fit")}>
                {t(channel.button)}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </Reveal>
        ))}
      </ul>

      {/* Questions fréquentes : une liste séparée par des filets. */}
      <section className={cn(FRONT_NARROW, "pt-24 pb-24 sm:pt-28 sm:pb-32")}>
        <Reveal className="text-center">
          <p className={cn(KICKER, ACCENT)}>FAQ</p>
          <h2 className={cn(DISPLAY, "mt-4 text-4xl leading-[1.05] text-balance sm:text-5xl")}>{t("support.faq.title")}</h2>
          <p className="mt-5 text-pretty text-muted-foreground">{t("support.faq.description")}</p>
        </Reveal>
        <dl className="mt-10">
          {[0, 1, 2].map((item) => (
            <Reveal key={item} delay={item * 0.08} y={18} className="border-b border-border/70 py-6 first:border-t">
              <dt className="text-lg font-semibold tracking-tight">{t(`support.faq.questions.${item}.question`)}</dt>
              <dd className="mt-2 text-pretty text-muted-foreground">{t(`support.faq.questions.${item}.answer`)}</dd>
            </Reveal>
          ))}
        </dl>
        <p className="mt-12 text-center text-sm text-muted-foreground">{t("support.footer")}</p>
      </section>
    </>
  );
}
