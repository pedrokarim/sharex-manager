import { Globe, Mail } from "lucide-react";

import { FRONT_CONTAINER } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER } from "@/components/front/styles";
import { PageTransition } from "@/components/page-transition";
import { Discord, Github, XLogo } from "@/components/ui/icons";
import { SITE_LINKS } from "@/config/links";
import { publicPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { ContactForm } from "./contact-form";

export const metadata = publicPageMetadata({
  title: "Contact",
  description:
    "Une question, un signalement ou une demande : écrivez-nous.",
  path: "/contact",
});

const CHANNELS = [
  { icon: Mail, label: SITE_LINKS.email, href: `mailto:${SITE_LINKS.email}` },
  { icon: Discord, label: "Discord de support", href: SITE_LINKS.discord },
  { icon: Github, label: "GitHub", href: SITE_LINKS.repository },
  { icon: XLogo, label: `X · ${SITE_LINKS.xHandle}`, href: SITE_LINKS.x },
  { icon: Globe, label: "ascencia.re", href: SITE_LINKS.ascencia },
];

export default function ContactPage() {
  return (
    <PageTransition>
      <PhotoHeader
        photo="lake"
        kicker="Contact"
        title="Une question ?"
        titleAccent="Écrivez-nous."
        description="Un bug, une idée, un signalement ou une simple question : le formulaire arrive directement dans notre boîte."
      />

      <div className={cn(FRONT_CONTAINER, "grid gap-14 pt-6 pb-24 sm:pb-32 lg:grid-cols-12")}>
        <Reveal className="lg:col-span-7">
          <ContactForm />
        </Reveal>

        <Reveal delay={0.12} className="lg:col-span-4 lg:col-start-9">
          <p className={cn(KICKER, ACCENT)}>Autrement</p>
          <h2 className={cn(DISPLAY, "mt-4 text-3xl sm:text-4xl")}>D&apos;autres chemins</h2>
          {/* Une liste séparée par des filets, pas une pile d'encadrés. */}
          <ul className="mt-6">
            {CHANNELS.map((channel) => (
              <li key={channel.href} className="border-b border-border/70 first:border-t">
                <a
                  href={channel.href}
                  {...(channel.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center gap-4 py-4 font-medium transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  <channel.icon className={cn("size-5 shrink-0", ACCENT)} />
                  {channel.label}
                </a>
              </li>
            ))}
          </ul>

          <h3 className={cn(DISPLAY, "mt-12 text-2xl")}>Délai de réponse</h3>
          <p className="mt-3 text-pretty text-muted-foreground">
            ShareX Manager est un projet personnel, maintenu sur le temps libre : les réponses arrivent dès que
            possible, sans garantie de délai. Pour un bug ou une suggestion, une issue GitHub est souvent le chemin le
            plus rapide.
          </p>
        </Reveal>
      </div>
    </PageTransition>
  );
}
