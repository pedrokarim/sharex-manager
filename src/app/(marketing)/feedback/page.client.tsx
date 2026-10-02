"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Send } from "lucide-react";

import { FRONT_CONTAINER } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, FIELD, FIELD_AREA, KICKER, PILL_SOLID } from "@/components/front/styles";
import { Discord, Github } from "@/components/ui/icons";
import { SITE_LINKS } from "@/config/links";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export function FeedbackPageClient() {
  const { t } = useTranslation();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simuler l'envoi du formulaire
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 3000);
  };

  const channels = [
    { icon: Discord, label: t("feedback.channels.discord"), href: SITE_LINKS.discord },
    { icon: Github, label: t("feedback.channels.github"), href: SITE_LINKS.issues },
  ];

  return (
    <>
      <PhotoHeader photo="glade" kicker="Feedback" title={t("feedback.title")} description={t("feedback.description")} />

      <div className={cn(FRONT_CONTAINER, "grid gap-14 pt-6 pb-24 sm:pb-32 lg:grid-cols-12")}>
        <Reveal className="lg:col-span-7">
          {/* Le remerciement prend la place du formulaire, en fondu, puis la lui rend. */}
          <AnimatePresence mode="wait" initial={false}>
            {isSubmitted ? (
              <motion.div
                key="thanks"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="rounded-[28px] bg-emerald-500/10 p-10 text-center"
              >
                <Send className={cn("mx-auto size-9", ACCENT)} strokeWidth={1.5} />
                <h2 className={cn(DISPLAY, "mt-5 text-3xl sm:text-4xl")}>{t("feedback.thank_you.title")}</h2>
                <p className="mt-3 text-pretty text-muted-foreground">{t("feedback.thank_you.description")}</p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="space-y-6"
              >
                <div>
                  <h2 className={cn(DISPLAY, "text-3xl sm:text-4xl")}>{t("feedback.forms.title")}</h2>
                  <p className="mt-3 text-pretty text-muted-foreground">{t("feedback.forms.description")}</p>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("feedback.forms.name")}</Label>
                    <Input id="name" type="text" placeholder="Votre nom" className={FIELD} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("feedback.forms.email")}</Label>
                    <Input id="email" type="email" placeholder="votre@email.com" className={FIELD} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">{t("feedback.forms.subject")}</Label>
                  <Input id="subject" type="text" placeholder="Sujet de votre message" required className={FIELD} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">{t("feedback.forms.message")}</Label>
                  <Textarea
                    id="message"
                    placeholder="Décrivez votre idée, suggestion ou problème…"
                    required
                    className={cn(FIELD_AREA, "min-h-[140px]")}
                  />
                </div>
                <button type="submit" className={PILL_SOLID}>
                  <Send className="size-4" />
                  {t("feedback.forms.submit")}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </Reveal>

        <Reveal delay={0.12} className="lg:col-span-4 lg:col-start-9">
          <p className={cn(KICKER, ACCENT)}>Autrement</p>
          <h2 className={cn(DISPLAY, "mt-4 text-3xl sm:text-4xl")}>{t("feedback.channels.title")}</h2>
          <p className="mt-3 text-pretty text-muted-foreground">{t("feedback.channels.description")}</p>
          <ul className="mt-6">
            {channels.map((channel) => (
              <li key={channel.href} className="border-b border-border/70 first:border-t">
                <a
                  href={channel.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 py-4 font-medium transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  <channel.icon className={cn("size-5 shrink-0", ACCENT)} />
                  {channel.label}
                  <ArrowUpRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </>
  );
}
