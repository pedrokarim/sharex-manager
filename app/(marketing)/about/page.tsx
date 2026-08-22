import type { Metadata } from "next";
import {
  Globe,
  Info,
  Shield,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

import { Github } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { DocPage, type DocSection } from "../_components/doc-page";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "À propos",
  description:
    "Ce qu'est ShareX Manager, pourquoi il existe et ce qu'il fait de vos images.",
  path: "/about",
});


const features = [
  {
    icon: Workflow,
    title: "Gestion simplifiée",
    description:
      "Une interface pour retrouver, trier et organiser vos envois en galeries et albums.",
  },
  {
    icon: Shield,
    title: "Sécurité avancée",
    description:
      "Fichiers privés par défaut, partage explicite, et clés API révocables à tout moment.",
  },
  {
    icon: Globe,
    title: "Multi-domaines",
    description:
      "Servez vos fichiers depuis votre propre domaine, distinct de celui de l'application.",
  },
  {
    icon: Sparkles,
    title: "Compatible ShareX",
    description:
      "Se branche sur ShareX sous Windows, et sur flameshot ou fu sous Linux.",
  },
];

const sections: DocSection[] = [
  {
    id: "mission",
    title: "Pourquoi ce projet",
    icon: Target,
    content: (
      <>
        <p>
          ShareX Manager est né d&apos;un besoin simple : ShareX envoie très bien
          des fichiers, mais ne dit rien de ce qu&apos;ils deviennent ensuite. Les
          captures s&apos;accumulent sur un serveur, sans galerie, sans
          recherche, sans moyen de reprendre la main sur un lien partagé.
        </p>
        <p>
          Ce projet comble cet angle mort : un point de chute pour vos envois,
          qui les organise, les rend consultables et vous laisse décider de ce
          qui est public. Le tout auto-hébergeable, pour que vos fichiers restent
          sur votre infrastructure.
        </p>
      </>
    ),
  },
  {
    id: "features",
    title: "Ce que fait l'application",
    icon: Sparkles,
    raw: true,
    content: (
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-lg border bg-card p-5">
            <feature.icon className="mb-3 h-5 w-5 text-primary" />
            <h3 className="mb-1.5 font-semibold">{feature.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "team",
    title: "Qui est derrière",
    icon: Users,
    content: (
      <>
        <p>
          ShareX Manager est développé et maintenu par Ascencia, une structure
          informelle animée par Ahmed Karim. C&apos;est un projet personnel, sans
          société ni modèle commercial derrière : pas de publicité, pas de
          revente de données, pas de version payante.
        </p>
        <p>
          Le code est publié sous licence GNU GPL v3 : chacun peut l&apos;auditer,
          l&apos;héberger pour son propre usage et y contribuer.
        </p>
        <div className="not-prose mt-6">
          <Button variant="outline" className="gap-2" asChild>
            <a
              href="https://github.com/pedrokarim/sharex-manager"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
              Voir le projet sur GitHub
            </a>
          </Button>
        </div>
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <DocPage
      eyebrow="À propos"
      title="ShareX Manager"
      icon={Info}
      intro={
        <p>
          Un gestionnaire de fichiers auto-hébergeable pour les captures envoyées
          depuis ShareX et ses équivalents. Libre, sans publicité, et pensé pour
          que vos fichiers restent chez vous.
        </p>
      }
      sections={sections}
    />
  );
}
